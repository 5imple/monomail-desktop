import mailApi from '@/main/api/mail/mailApi';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { handlePushFrame } from '@/main/services/push/pushHandler';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { powerSaveBlocker } from 'electron';
import log from 'electron-log';
import { WebSocket } from 'ws';

/**
 * Long-lived WebSocket connection from the main process to the on-prem
 * backend. Replaces the FCM delivery path. Frames received are forwarded
 * over IPC as `renderer:push:message-received`, matching the shape the
 * legacy MessageContext.handleIncomingMessage already expects:
 *
 *     { data: { type, accountId, threadId, ... }, notification?: {...} }
 *
 * Connection lifecycle:
 *   - opens on token-changed (signed-in)
 *   - reconnects with exponential backoff on close (1s → 30s cap)
 *   - sends ping every 25s, terminates if no pong in 60s
 *   - closes + drops backoff on signed-out
 *   - on 401/403 close codes, triggers a token refresh and reconnects
 */
class WebSocketPushClient {
  private static instance: WebSocketPushClient;
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private deadlineTimer: NodeJS.Timeout | null = null;
  private backoffMs = 1_000;
  private readonly backoffMaxMs = 30_000;
  private readonly pingIntervalMs = 25_000;
  private readonly deadlineMs = 60_000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionallyClosed = false;
  private blockerId: number | null = null;

  private constructor() {
    tokenManager.on('token-changed', () => {
      // Either we just signed in, or our token rotated. In both cases the
      // simplest, race-free thing is to drop any existing socket and let
      // `connect()` open a fresh one with the new bearer.
      this.disconnect('token-changed');
      this.connect();
    });
    tokenManager.on('signed-out', () => {
      this.intentionallyClosed = true;
      this.disconnect('signed-out');
    });
  }

  static getInstance(): WebSocketPushClient {
    if (!WebSocketPushClient.instance) {
      WebSocketPushClient.instance = new WebSocketPushClient();
    }
    return WebSocketPushClient.instance;
  }

  start(): void {
    // Called once during app bootstrap. If a token is already on disk
    // (warm start), open immediately; otherwise wait for token-changed.
    if (tokenManager.getAccessToken()) this.connect();
  }

  private resolveUrl(): string | null {
    const backend = resolveBackendUrl();
    if (!backend) return null;
    const path = (import.meta.env.MONO_ENV_PUSH_WS_PATH || '/push/ws').trim();
    const wsBase = backend.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    const token = tokenManager.getAccessToken();
    if (!token) return null;
    const sep = path.includes('?') ? '&' : '?';
    return `${wsBase}${path.startsWith('/') ? '' : '/'}${path}${sep}token=${encodeURIComponent(token)}`;
  }

  private connect(): void {
    if (this.ws) return;
    if (this.intentionallyClosed) this.intentionallyClosed = false;
    const url = this.resolveUrl();
    if (!url) {
      log.warn('[push] no URL or no token; not connecting');
      return;
    }
    log.info('[push] connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      log.error('[push] WebSocket constructor threw:', (e as Error).message);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      log.info('[push] connected');
      this.backoffMs = 1_000;
      this.startHeartbeat();
      this.startPowerSaveBlocker();
      // Kick off the per-account Gmail watch the same way the legacy
      // FCM_SERVICE_STARTED path did. Without this, Gmail-backed accounts
      // never publish new-mail events to the backend.
      const uid = tokenManager.getActiveUid();
      if (uid) {
        mailApi.watchCloudPubSub(uid).catch((e) =>
          log.warn('[push] watchCloudPubSub on connect failed:', (e as Error).message)
        );
      }
    });

    ws.on('message', (raw) => {
      this.bumpDeadline();
      let frame: unknown;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        log.warn('[push] dropped non-JSON frame');
        return;
      }
      this.dispatch(frame);
    });

    ws.on('pong', () => this.bumpDeadline());

    ws.on('close', (code, reasonBuf) => {
      const reason = reasonBuf?.toString() || '';
      log.info(`[push] closed code=${code} reason=${reason || '<none>'}`);
      this.stopHeartbeat();
      this.ws = null;
      // Auth-failure closures (4401/4403 by convention, or HTTP 401/403
      // mapped to close codes). Try a refresh + reconnect once.
      if (code === 4401 || code === 4403 || code === 1008) {
        tokenManager
          .refresh()
          .then(() => this.scheduleReconnect(500))
          .catch(() => {
            /* clearTokens already fired */
          });
        return;
      }
      if (!this.intentionallyClosed) this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      log.warn('[push] error:', (err as Error).message);
      // 'error' is followed by 'close'; reconnect happens there.
    });
  }

  private dispatch(frame: unknown): void {
    if (!frame || typeof frame !== 'object') return;
    // Heartbeat / health frames the backend can send back without bothering
    // the renderer. Anything without a `data` object is treated as control
    // traffic.
    if (!('data' in (frame as Record<string, unknown>))) return;

    const data = (frame as { data?: Record<string, unknown> }).data;
    const eventType = typeof data?.type === 'string' ? data.type : '';

    // P8 Later Queue events route directly to a dedicated renderer
    // channel — they don't drive native notifications and shouldn't be
    // parsed as mail. Skip handlePushFrame so MESSAGE_ADDED-style
    // post-processing doesn't run.
    if (
      eventType === 'THREAD_UNSNOOZED' ||
      eventType === 'SCHEDULED_SENT' ||
      eventType === 'SNOOZE_RESCHEDULED' ||
      eventType === 'SCHEDULE_RESCHEDULED'
    ) {
      const w = windowManager.getMainAppWindow();
      if (w) w.webContents.send('renderer:queue:event', data);
      return;
    }

    // Drive native notifications first (so they fire even if the window
    // isn't created yet), then forward to the renderer to update the
    // thread list / message store.
    handlePushFrame(frame as { data?: Record<string, string>; notification?: { title?: string; body?: string } }).catch(
      (e) => log.error('[push] handlePushFrame threw:', (e as Error).message)
    );
    const w = windowManager.getMainAppWindow();
    if (w) w.webContents.send('renderer:push:message-received', frame);
  }

  private startPowerSaveBlocker(): void {
    if (this.blockerId !== null) return;
    try {
      this.blockerId = powerSaveBlocker.start('prevent-app-suspension');
      log.info('[push] power-save blocker started');
    } catch (e) {
      log.warn('[push] power-save blocker start failed:', (e as Error).message);
    }
  }

  private stopPowerSaveBlocker(): void {
    if (this.blockerId === null) return;
    try {
      powerSaveBlocker.stop(this.blockerId);
      log.info('[push] power-save blocker stopped');
    } catch (e) {
      log.warn('[push] power-save blocker stop failed:', (e as Error).message);
    }
    this.blockerId = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.bumpDeadline();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
      } catch (e) {
        log.warn('[push] ping failed:', (e as Error).message);
      }
    }, this.pingIntervalMs);
  }

  private bumpDeadline(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = setTimeout(() => {
      log.warn('[push] heartbeat deadline exceeded; reconnecting');
      this.disconnect('heartbeat-deadline');
    }, this.deadlineMs);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }

  private scheduleReconnect(immediateMs?: number): void {
    if (this.reconnectTimer) return;
    const wait = immediateMs ?? this.backoffMs;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionallyClosed) return;
      if (!tokenManager.getAccessToken()) return;
      this.connect();
    }, wait);
    this.backoffMs = Math.min(this.backoffMs * 2, this.backoffMaxMs);
  }

  private disconnect(reason: string): void {
    this.stopHeartbeat();
    this.stopPowerSaveBlocker();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, reason);
      } catch {
        // already closing
      }
      this.ws = null;
    }
  }
}

function resolveBackendUrl(): string {
  const explicit = (import.meta.env.MONO_ENV_BACKEND_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return (import.meta.env.MONO_ENV_API_URL || '').trim().replace(/\/$/, '');
}

export const webSocketPushClient = WebSocketPushClient.getInstance();
