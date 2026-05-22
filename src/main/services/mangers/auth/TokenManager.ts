import { EventEmitter } from 'events';
import { net, safeStorage } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute epoch ms when the access token expires. */
  expiresAt: number;
  /** Optional cached profile so the renderer can hydrate before the next backend round-trip. */
  member?: {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
  };
}

interface StoreSchema {
  /** Encrypted JSON blob (safeStorage.encryptString → base64). */
  authEnc?: string;
}

// Refresh this many ms before the access token expires. Generous because
// every API call also passes through the same refresh path on 401, so the
// timer is a freshness hint, not a hard guarantee.
const REFRESH_LEAD_MS = 60_000;

// Floor on the auto-refresh timer so a misbehaving backend that issues
// near-instant-expiry tokens doesn't pin the event loop in a tight loop.
const MIN_REFRESH_INTERVAL_MS = 5_000;

/**
 * Owns the on-prem JWT lifecycle in the main process. Persists tokens
 * encrypted via safeStorage (OS keychain on macOS, DPAPI on Windows,
 * libsecret on Linux), schedules background refresh against the backend,
 * and emits 'token-changed' / 'signed-out' so the renderer + WebSocket
 * push client can react.
 *
 * The renderer never touches the refresh token — it only sees the current
 * access token (via IPC `main:auth:get-state`).
 */
class TokenManager extends EventEmitter {
  private static instance: TokenManager;
  private store: Store<StoreSchema>;
  private tokens: StoredTokens | null = null;
  private activeUid: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<StoredTokens> | null = null;

  private constructor() {
    super();
    this.store = new Store<StoreSchema>();
    this.loadFromDisk();
  }

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  // ---------- Persistence ----------

  private loadFromDisk(): void {
    try {
      const enc = this.store.get('authEnc');
      if (!enc) return;
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('[TokenManager] safeStorage unavailable on this platform; ignoring saved tokens');
        return;
      }
      const plain = safeStorage.decryptString(Buffer.from(enc, 'base64'));
      const parsed = JSON.parse(plain) as StoredTokens;
      if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
        log.warn('[TokenManager] persisted token blob missing required fields; ignoring');
        return;
      }
      this.tokens = parsed;
      this.scheduleAutoRefresh();
      log.info(
        '[TokenManager] loaded persisted tokens (expires in %dms)',
        parsed.expiresAt - Date.now()
      );
    } catch (e) {
      log.error('[TokenManager] loadFromDisk failed:', (e as Error).message);
    }
  }

  private persist(): void {
    try {
      if (!this.tokens) {
        this.store.delete('authEnc');
        return;
      }
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('[TokenManager] safeStorage unavailable; tokens kept in memory only');
        return;
      }
      const enc = safeStorage.encryptString(JSON.stringify(this.tokens)).toString('base64');
      this.store.set('authEnc', enc);
    } catch (e) {
      log.error('[TokenManager] persist failed:', (e as Error).message);
    }
  }

  // ---------- Public API ----------

  saveTokens(input: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
    expiresAt?: number;
    member?: StoredTokens['member'];
  }): void {
    const expiresAt =
      input.expiresAt ??
      (input.expiresInSec != null ? Date.now() + input.expiresInSec * 1000 : Date.now() + 3600_000);
    this.tokens = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
      member: input.member
    };
    this.persist();
    this.scheduleAutoRefresh();
    this.emit('token-changed', this.tokens);
  }

  clearTokens(reason: string = 'manual'): void {
    if (!this.tokens) return;
    log.info('[TokenManager] clearTokens (%s)', reason);
    this.tokens = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.persist();
    this.emit('signed-out', { reason });
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  getState(): StoredTokens | null {
    return this.tokens;
  }

  setActiveUid(uid: string | null): void {
    this.activeUid = uid;
  }

  getActiveUid(): string | null {
    return this.activeUid;
  }

  // ---------- Refresh ----------

  /**
   * Force a refresh round-trip against the backend, regardless of expiry.
   * Coalesces concurrent callers onto a single in-flight request.
   */
  async refresh(): Promise<StoredTokens> {
    if (!this.tokens) throw new Error('Not signed in');
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<StoredTokens> {
    if (!this.tokens) throw new Error('Not signed in');
    const refreshToken = this.tokens.refreshToken;
    const backend = resolveBackendUrl();
    if (!backend) throw new Error('MONO_ENV_BACKEND_URL not configured');

    const response = await net.fetch(`${backend}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (response.status === 401 || response.status === 403) {
      // Refresh token revoked or expired — sign out.
      this.clearTokens('refresh-rejected');
      throw new Error(`Refresh rejected: ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`Refresh failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
    };
    if (!body.accessToken) throw new Error('Refresh response missing accessToken');

    this.saveTokens({
      accessToken: body.accessToken,
      // Backends MAY rotate refresh tokens; if not, keep the existing one.
      refreshToken: body.refreshToken ?? refreshToken,
      expiresInSec: body.expiresIn,
      member: this.tokens.member
    });
    return this.tokens!;
  }

  private scheduleAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (!this.tokens) return;
    const wait = Math.max(
      this.tokens.expiresAt - Date.now() - REFRESH_LEAD_MS,
      MIN_REFRESH_INTERVAL_MS
    );
    this.refreshTimer = setTimeout(() => {
      this.refresh().catch((err) => {
        log.error('[TokenManager] auto-refresh failed:', (err as Error).message);
        // Re-arm a slow retry so a transient backend outage doesn't permanently
        // disable refresh. Real network recovery typically unsticks within a minute.
        this.refreshTimer = setTimeout(() => this.scheduleAutoRefresh(), 30_000);
      });
    }, wait);
  }
}

export function resolveBackendUrl(): string {
  const explicit = (import.meta.env.MONO_ENV_BACKEND_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return (import.meta.env.MONO_ENV_API_URL || '').trim().replace(/\/$/, '');
}

export const tokenManager = TokenManager.getInstance();
