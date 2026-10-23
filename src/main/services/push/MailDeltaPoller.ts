import { app, BrowserWindow, powerMonitor } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';
import { classifyGraphDeltaError } from '@/main/api/mail/graphRequestMapping';
import type { GraphDeltaItem, GraphMessage } from '@/main/api/mail/graphTransforms';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { graphGetMain } from '@/main/services/push/graphFetchMain';
import { handlePushFrames, type PushFrame } from '@/main/services/push/pushHandler';
import {
  BACKGROUND_POLL_INTERVAL_MS,
  DeltaPollStatus,
  POLL_INTERVAL_MS,
  PollGate,
  diffPolledAccounts,
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
  'id,conversationId,internetMessageId,parentFolderId,subject,bodyPreview,from,sender,isRead,flag,receivedDateTime,' +
  // Focused Inbox: a Focused/Other move in Outlook reaches cached messages.
  'inferenceClassification';

// Defensive cap on a single poll's paging. Ample for incremental deltas; a huge
// mailbox's INITIAL full delta can exceed it — resumable initial sync (persist
// the nextLink, not just the deltaLink) is the documented Phase 11 residual.
const MAX_DELTA_PAGES = 50;

const GRAPH_NEXTLINK = /^https:\/\/graph\.microsoft\.com\//i;

interface FolderCursor {
  // Set once the initial sync reaches the end: the resumable incremental cursor.
  deltaLink?: string;
  // Set while an initial sync is still paging (mailbox too large to finish in one
  // poll): the next page to resume from, so the next poll continues forward
  // instead of restarting the whole mailbox every cycle.
  nextLink?: string;
  lastSyncedAt?: number;
  // The $select the cursor was made with. Graph bakes it into the resume
  // links, so a cursor from an older field list is started over (once).
  select?: string;
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
  // Resume point when an initial sync didn't finish this cycle (else undefined).
  nextLink?: string;
  // True while the initial sync is still in progress (no deltaLink anchored yet).
  initialSyncInProgress: boolean;
  retryAfterMs: number;
}

/**
 * Main-process new-mail delivery for Microsoft 365 accounts (plan Phase 11 v1).
 * Polls each account's Inbox via Graph message-delta every 10 s (30 s in the
 * background), persists
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
  // Pending (not yet fired) poll timers only; a timer removes itself on firing.
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Accounts being polled. Separate from `timers` so "tracked" no longer
  // depends on a fired timer handle lingering in the map.
  private active = new Set<string>();
  // Bumped whenever an account stops being polled: a poll still in flight from
  // an older generation throws its result away (no stale cursor write after a
  // sign-out, no frames for a removed account).
  private generations = new Map<string, number>();
  private gate = new PollGate();
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
      // Reconcile (NOT restart) on these: TokenManager re-emits both events on
      // every token refresh, and the poller's own refresh-on-poll would then
      // re-emit → if we re-polled immediately here we'd spin (100% CPU). reconcile
      // is a no-op when the account set is unchanged.
      tokenManager.on('mail-accounts-changed', () => this.reconcile());
      tokenManager.on('token-changed', () => this.reconcile());
      tokenManager.on('signed-out', () => this.onSignedOut());
      powerMonitor.on('suspend', () => this.stopAll());
      powerMonitor.on('resume', () => this.reconcile());
      // Window focus → poll now (cheap freshness when the user returns).
      app.on('browser-window-focus', () => this.pollAllNow());
    }
    this.reconcile();
  }

  /** Stops every poll loop but keeps the cursors (suspend: resume picks up where it left off). */
  stopAll(): void {
    for (const uid of [...this.active]) this.stop(uid);
  }

  private stop(uid: string): void {
    this.clearTimer(uid);
    this.active.delete(uid);
    this.generations.set(uid, this.generationOf(uid) + 1);
    this.gate.forget(uid);
  }

  private generationOf(uid: string): number {
    return this.generations.get(uid) ?? 0;
  }

  /**
   * Sign-out drops every account. Forget their delta cursors too: otherwise the
   * next sign-in resumes from the old deltaLink and announces everything that
   * changed since as new mail.
   */
  private onSignedOut(): void {
    this.stopAll();
    this.store.set('cursors', {});
  }

  /**
   * Reconcile the polled set against the signed-in Microsoft accounts: start
   * polling newly-added uids, stop removed ones (and forget their cursors), and
   * LEAVE running loops untouched. It MUST be a no-op when the account set is
   * unchanged — a token refresh re-emits the change events, and re-polling here
   * would refresh again, a tight feedback loop. (This replaces a blanket
   * restart() that did exactly that and pegged the main process.)
   */
  private reconcile(): void {
    const desired = this.microsoftUids();
    // Account store unreadable: change nothing rather than treat every account
    // as removed and throw its cursor away.
    if (desired === null) return;
    const { toStart, toStop } = diffPolledAccounts(desired, [...this.active]);
    for (const uid of toStop) this.stop(uid);
    // A cursor whose account is no longer signed in is stale by definition:
    // re-adding the account would resume from it and replay everything since.
    // Purging every orphan (not just toStop) also covers cursors left behind
    // by a sign-out or removal while the app was not tracking the account.
    this.clearOrphanCursors(desired);
    for (const uid of toStart) {
      this.active.add(uid);
      this.schedule(uid, 0);
    }
  }

  private pollAllNow(): void {
    // Only accounts already being polled; never start a fresh loop here. Skip
    // an account whose poll is running or started moments ago: at launch the
    // first focus lands while the boot poll is still paging.
    const now = Date.now();
    for (const uid of this.active) {
      if (this.gate.shouldPollOnFocus(uid, now)) this.schedule(uid, 0);
    }
  }

  /**
   * The refresh button: poll every account now, even right after a poll
   * (a poll still running runs once more when it ends).
   */
  pollNow(): void {
    for (const uid of this.active) this.schedule(uid, 0);
  }

  private microsoftUids(): string[] | null {
    try {
      return tokenManager
        .getMailAccounts()
        .filter((account) => account.provider === 'microsoft')
        .map((account) => account.uid);
    } catch {
      return null;
    }
  }

  private schedule(uid: string, delayMs: number): void {
    this.clearTimer(uid);
    const timer = setTimeout(() => {
      // Fired: drop the handle so `timers` only ever holds pending polls.
      if (this.timers.get(uid) === timer) this.timers.delete(uid);
      void this.poll(uid);
    }, delayMs);
    this.timers.set(uid, timer);
  }

  private clearTimer(uid: string): void {
    const timer = this.timers.get(uid);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(uid);
    }
  }

  private async poll(uid: string): Promise<void> {
    if (!this.active.has(uid)) return;
    // Single flight per account: two polls reading the same cursor would both
    // dispatch the same frames. A poll requested meanwhile runs once afterwards.
    if (!this.gate.begin(uid, Date.now())) return;
    const generation = this.generationOf(uid);
    // Fast while the user is looking at the app; window focus also triggers an
    // immediate poll (pollAllNow), so returning to the app is always fresh.
    let delay = BrowserWindow.getFocusedWindow() ? POLL_INTERVAL_MS : BACKGROUND_POLL_INTERVAL_MS;
    try {
      const saved = this.getCursor(uid, POLL_FOLDER);
      // Made with another field list: re-anchor quietly (an initial sync
      // dispatches nothing) so the new fields come through from now on.
      const cursor: FolderCursor = saved.select === DELTA_SELECT ? saved : {};
      const result = await this.runFolderDelta(uid, POLL_FOLDER, cursor);
      // Stopped (sign-out, account removed, suspend) while this was in flight:
      // persist nothing and dispatch nothing.
      if (generation !== this.generationOf(uid)) return;

      switch (result.status) {
        case 'ok':
          this.failures.set(uid, 0);
          this.setCursor(uid, POLL_FOLDER, {
            deltaLink: result.deltaLink ?? cursor.deltaLink,
            nextLink: result.nextLink,
            lastSyncedAt: Date.now(),
            select: DELTA_SELECT
          });
          // Only dispatch for a true incremental sync (we already had an anchored
          // deltaLink). An initial sync — even a multi-cycle resumable one — must
          // not replay the whole inbox as "new mail" (matches GmailHistoryPoller).
          if (cursor.deltaLink && !result.initialSyncInProgress) {
            this.dispatch(uid, result.upserts, result.removedIds);
          }
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
      const runAgain = this.gate.end(uid);
      // Only re-arm if this account is still polled (sign-out / suspend may have
      // stopped it while the poll was in flight). A poll requested while this
      // one ran goes next; otherwise keep the cadence unless a newer loop for
      // this account already armed its own timer.
      if (this.active.has(uid)) {
        if (runAgain) this.schedule(uid, 0);
        else if (!this.timers.has(uid)) this.schedule(uid, delay);
      }
    }
  }

  /**
   * One Inbox delta sync. Pages @odata.nextLink toward the @odata.deltaLink,
   * reusing the provider's error classification. Resume priority: an anchored
   * deltaLink (incremental) → a saved nextLink (an initial sync still paging) →
   * a fresh initial delta. A large mailbox's initial sync can exceed
   * MAX_DELTA_PAGES in one poll, so the unfinished nextLink is returned and
   * persisted — the next poll continues forward instead of restarting the whole
   * mailbox every cycle (which hammered Graph and never anchored).
   */
  private async runFolderDelta(
    uid: string,
    folder: string,
    cursor: FolderCursor
  ): Promise<FolderDeltaResult> {
    const upserts: GraphMessage[] = [];
    const removedIds: string[] = [];
    const anchored = !!cursor.deltaLink;
    // nextLink (a paging resume point) wins over deltaLink so a sync that spans
    // multiple cycles continues forward rather than restarting from the anchor.
    const resume = cursor.nextLink ?? cursor.deltaLink;
    let path: string | undefined =
      resume && GRAPH_NEXTLINK.test(resume)
        ? resume
        : `/me/mailFolders/${folder}/messages/delta?$select=${encodeURIComponent(DELTA_SELECT)}`;
    let newDeltaLink: string | null = null;
    let pendingNextLink: string | undefined;

    for (let page = 0; path && page < MAX_DELTA_PAGES; page++) {
      const res = await graphGetMain<GraphDeltaPage>(uid, path);
      if (!res.ok) {
        const outcome = classifyGraphDeltaError(res.status, res.code);
        if (outcome === 'reset') {
          return {
            status: 'reset',
            upserts: [],
            removedIds: [],
            deltaLink: null,
            initialSyncInProgress: false,
            retryAfterMs: 0
          };
        }
        return {
          status: outcome,
          upserts,
          removedIds,
          deltaLink: cursor.deltaLink ?? null,
          nextLink: cursor.nextLink,
          initialSyncInProgress: !anchored,
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
      pendingNextLink = path; // where to resume if we stop before the deltaLink
    }

    if (newDeltaLink) {
      // Reached the end — fully anchored; clear any resume nextLink.
      return {
        status: 'ok',
        upserts,
        removedIds,
        deltaLink: newDeltaLink,
        nextLink: undefined,
        initialSyncInProgress: false,
        retryAfterMs: 0
      };
    }

    // Stopped at the page cap before the deltaLink: still in progress. Persist
    // the nextLink so the next poll resumes forward. Keep any anchored deltaLink.
    if (!anchored) {
      log.info(
        '[mail-delta] %s initial sync in progress (%d pages this cycle), resuming next poll',
        uid,
        MAX_DELTA_PAGES
      );
    }
    return {
      status: 'ok',
      upserts,
      removedIds,
      deltaLink: cursor.deltaLink ?? null,
      nextLink: pendingNextLink ?? cursor.nextLink,
      initialSyncInProgress: !anchored,
      retryAfterMs: 0
    };
  }

  private dispatch(uid: string, upserts: GraphMessage[], removedIds: string[]): void {
    const frames = synthesizeDeltaFrames(uid, POLL_FOLDER, upserts, removedIds);
    if (frames.length === 0) return;
    // Every frame still reaches the renderer so the cache stays in sync; the
    // notification side sees the batch at once so it can skip backlog and
    // collapse a burst into one summary banner.
    handlePushFrames(frames as PushFrame[]).catch((e) =>
      log.warn('[mail-delta] handlePushFrames: %s', (e as Error).message)
    );
    const win = windowManager.getMainAppWindow();
    if (win && !win.isDestroyed()) {
      for (const frame of frames) win.webContents.send('renderer:push:message-received', frame);
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

  /** Forgets the cursors of every account not in `signedInUids`. */
  private clearOrphanCursors(signedInUids: string[]): void {
    const all = this.store.get('cursors', {});
    const keep = new Set(signedInUids);
    const orphans = Object.keys(all).filter((uid) => !keep.has(uid));
    if (orphans.length === 0) return;
    const rest = { ...all };
    for (const uid of orphans) delete rest[uid];
    this.store.set('cursors', rest);
    log.info('[mail-delta] forgot delta cursors of %d signed-out account(s)', orphans.length);
  }
}

export const mailDeltaPoller = MailDeltaPoller.getInstance();
