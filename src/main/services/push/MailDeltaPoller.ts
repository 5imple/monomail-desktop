import { app, powerMonitor } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';
import { classifyGraphDeltaError } from '@/main/api/mail/graphRequestMapping';
import type { GraphDeltaItem, GraphMessage } from '@/main/api/mail/graphTransforms';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { graphGetMain } from '@/main/services/push/graphFetchMain';
import { handlePushFrame } from '@/main/services/push/pushHandler';
import {
  DeltaPollStatus,
  POLL_INTERVAL_MS,
  nextPollDelay,
  splitDelta,
  synthesizeDeltaFrames
} from '@/main/services/push/mailDeltaFrames';

// v1 polls only the Inbox folder per account for new-mail delivery (plan Phase
// 11 — "Microsoft accounts: Inbox-folder delta on the same cadence"). The wider
// MICROSOFT_TRACKED_FOLDERS set is for full delta sync, not this delivery loop.
const POLL_FOLDER = 'inbox';

// Same $select the provider's list/delta path uses — enough to synthesize the
// notification (from/subject) and the frame (id/conversationId/isRead).
const DELTA_SELECT =
  'id,conversationId,internetMessageId,parentFolderId,subject,bodyPreview,from,sender,isRead,flag,receivedDateTime';

// Defensive cap on a single poll's paging. Ample for incremental deltas; a huge
// mailbox's INITIAL full delta can exceed it — resumable initial sync (persist
// the nextLink, not just the deltaLink) is the documented Phase 11 residual.
const MAX_DELTA_PAGES = 50;

const GRAPH_NEXTLINK = /^https:\/\/graph\.microsoft\.com\//i;

interface FolderCursor {
  deltaLink?: string;
  lastSyncedAt?: number;
}

interface MailDeltaStoreSchema {
  // { [uid]: { [folder]: FolderCursor } } — opaque resume URLs, not secrets, so
  // a plain electron-store (not safeStorage). Provider-neutral name for when the
  // Gmail history.list path also moves to this poller.
  cursors?: Record<string, Record<string, FolderCursor>>;
}

interface GraphDeltaPage {
  value?: GraphDeltaItem[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

interface FolderDeltaResult {
  status: DeltaPollStatus;
  upserts: GraphMessage[];
  removedIds: string[];
  deltaLink: string | null;
  retryAfterMs: number;
}

/**
 * Main-process new-mail delivery for Microsoft 365 accounts (plan Phase 11 v1).
 * Polls each account's Inbox via Graph message-delta on a ~60s cadence, persists
 * the per-folder delta cursor in a main-process electron-store (`mail-delta`),
 * and synthesizes the existing push-frame shapes so MessageContext + the
 * notification pipeline consume Microsoft mail unchanged.
 *
 * Gmail's history.list path is NOT yet moved here (A3 calls for it eventually);
 * this slice is additive and leaves the renderer-driven Gmail sync untouched so
 * live Gmail delivery is not disturbed before validation against a real tenant.
 */
class MailDeltaPoller {
  private static instance: MailDeltaPoller;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private failures = new Map<string, number>();
  private store: Store<MailDeltaStoreSchema>;
  private wired = false;

  private constructor() {
    this.store = new Store<MailDeltaStoreSchema>({ name: 'mail-delta' });
  }

  static getInstance(): MailDeltaPoller {
    if (!MailDeltaPoller.instance) MailDeltaPoller.instance = new MailDeltaPoller();
    return MailDeltaPoller.instance;
  }

  /** Called once on app bootstrap; wires lifecycle listeners and starts polling. */
  start(): void {
    if (!this.wired) {
      this.wired = true;
      tokenManager.on('mail-accounts-changed', () => this.restart());
      tokenManager.on('token-changed', () => this.restart());
      tokenManager.on('signed-out', () => this.stopAll());
      powerMonitor.on('suspend', () => this.stopAll());
      powerMonitor.on('resume', () => this.restart());
      // Window focus → poll now (cheap freshness when the user returns).
      app.on('browser-window-focus', () => this.pollAllNow());
    }
    this.restart();
  }

  stopAll(): void {
    for (const uid of [...this.timers.keys()]) this.clearTimer(uid);
  }

  private restart(): void {
    this.stopAll();
    for (const uid of this.microsoftUids()) this.schedule(uid, 0);
  }

  private pollAllNow(): void {
    // Only re-arm accounts that already have a timer (i.e. polling is active);
    // never start a fresh poll loop here.
    for (const uid of this.timers.keys()) this.schedule(uid, 0);
  }

  private microsoftUids(): string[] {
    try {
      return tokenManager
        .getMailAccounts()
        .filter((account) => account.provider === 'microsoft')
        .map((account) => account.uid);
    } catch {
      return [];
    }
  }

  private schedule(uid: string, delayMs: number): void {
    this.clearTimer(uid);
    this.timers.set(
      uid,
      setTimeout(() => {
        void this.poll(uid);
      }, delayMs)
    );
  }

  private clearTimer(uid: string): void {
    const timer = this.timers.get(uid);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(uid);
    }
  }

  private async poll(uid: string): Promise<void> {
    let delay = POLL_INTERVAL_MS;
    try {
      const cursor = this.getCursor(uid, POLL_FOLDER);
      const result = await this.runFolderDelta(uid, POLL_FOLDER, cursor.deltaLink);

      switch (result.status) {
        case 'ok':
          this.failures.set(uid, 0);
          this.setCursor(uid, POLL_FOLDER, {
            deltaLink: result.deltaLink ?? cursor.deltaLink,
            lastSyncedAt: Date.now()
          });
          // No prior cursor → this was the initial anchoring delta; don't replay
          // the whole inbox as "new mail" (matches the deleted GmailHistoryPoller).
          if (cursor.deltaLink) this.dispatch(uid, result.upserts, result.removedIds);
          break;
        case 'reset':
          // Cursor is dead (410 / syncStateNotFound); drop it and re-anchor next poll.
          this.failures.set(uid, 0);
          this.clearCursor(uid, POLL_FOLDER);
          break;
        default: {
          const next = (this.failures.get(uid) ?? 0) + 1;
          this.failures.set(uid, next);
          delay = nextPollDelay(result.status, result.retryAfterMs, next);
          log.warn('[mail-delta] %s status=%s, retrying in %dms', uid, result.status, delay);
        }
      }
    } catch (err) {
      log.warn('[mail-delta] poll error for %s: %s', uid, (err as Error).message);
    } finally {
      // Only re-arm if this account is still tracked (sign-out / suspend may have
      // cleared the timer while the poll was in flight).
      if (this.timers.has(uid)) this.schedule(uid, delay);
    }
  }

  /**
   * One Inbox delta sync. Pages @odata.nextLink to the @odata.deltaLink, reusing
   * the provider's error classification. Transport-only duplicate of
   * getMicrosoftFolderDelta (which is renderer/worker-bound via graphApiClient).
   */
  private async runFolderDelta(
    uid: string,
    folder: string,
    deltaLink?: string
  ): Promise<FolderDeltaResult> {
    const upserts: GraphMessage[] = [];
    const removedIds: string[] = [];
    let path: string | undefined =
      deltaLink && GRAPH_NEXTLINK.test(deltaLink)
        ? deltaLink
        : `/me/mailFolders/${folder}/messages/delta?$select=${encodeURIComponent(DELTA_SELECT)}`;
    let newDeltaLink: string | null = null;

    for (let page = 0; path && page < MAX_DELTA_PAGES; page++) {
      const res = await graphGetMain<GraphDeltaPage>(uid, path);
      if (!res.ok) {
        const outcome = classifyGraphDeltaError(res.status, res.code);
        if (outcome === 'reset') {
          return { status: 'reset', upserts: [], removedIds: [], deltaLink: null, retryAfterMs: 0 };
        }
        return {
          status: outcome,
          upserts,
          removedIds,
          deltaLink: deltaLink ?? null,
          retryAfterMs: res.retryAfterMs ?? 0
        };
      }
      const { upserts: pageUpserts, removedIds: pageRemoved } = splitDelta(res.data?.value);
      upserts.push(...pageUpserts);
      removedIds.push(...pageRemoved);
      if (res.data?.['@odata.deltaLink']) {
        newDeltaLink = res.data['@odata.deltaLink'];
        break;
      }
      path = res.data?.['@odata.nextLink'];
    }

    if (!newDeltaLink && !deltaLink) {
      // Hit MAX_DELTA_PAGES on an initial sync without reaching a deltaLink — the
      // cursor stays unanchored and the next poll restarts. Acceptable for v1;
      // resumable initial sync is the documented residual.
      log.warn('[mail-delta] %s initial delta exceeded %d pages without a cursor', uid, MAX_DELTA_PAGES);
    }
    // Never clear a valid cursor on a successful sync that returned no new link.
    // A success needs no backoff, so retryAfterMs is 0.
    return { status: 'ok', upserts, removedIds, deltaLink: newDeltaLink ?? deltaLink ?? null, retryAfterMs: 0 };
  }

  private dispatch(uid: string, upserts: GraphMessage[], removedIds: string[]): void {
    const frames = synthesizeDeltaFrames(uid, POLL_FOLDER, upserts, removedIds);
    if (frames.length === 0) return;
    const win = windowManager.getMainAppWindow();
    for (const frame of frames) {
      handlePushFrame(
        frame as { data?: Record<string, string>; notification?: { title?: string; body?: string } }
      ).catch((e) => log.warn('[mail-delta] handlePushFrame: %s', (e as Error).message));
      win?.webContents.send('renderer:push:message-received', frame);
    }
    log.info('[mail-delta] %s dispatched %d frame(s)', uid, frames.length);
  }

  // ── Cursor persistence (mail-delta electron-store) ──────────────────────────

  private getCursor(uid: string, folder: string): FolderCursor {
    return this.store.get('cursors', {})[uid]?.[folder] ?? {};
  }

  private setCursor(uid: string, folder: string, cursor: FolderCursor): void {
    const all = this.store.get('cursors', {});
    this.store.set('cursors', { ...all, [uid]: { ...(all[uid] ?? {}), [folder]: cursor } });
  }

  private clearCursor(uid: string, folder: string): void {
    const all = this.store.get('cursors', {});
    if (all[uid]?.[folder]) {
      const folders = { ...all[uid] };
      delete folders[folder];
      this.store.set('cursors', { ...all, [uid]: folders });
    }
  }
}

export const mailDeltaPoller = MailDeltaPoller.getInstance();
