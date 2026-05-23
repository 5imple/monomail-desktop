import { MessageAddedPayload, MessageDeletedPayload, MessageLabelModificationPayload, PushPayload } from '@/main/api/message/push';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { handlePushFrame } from '@/main/services/push/pushHandler';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { net } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';

const POLL_INTERVAL_MS = 30_000;
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface PollerStoreSchema {
  historyIds?: Record<string, string>;
}

interface RawHistoryMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
}

interface RawHistoryItem {
  id: string;
  messagesAdded?: Array<{ message: RawHistoryMessage }>;
  messagesDeleted?: Array<{ message: RawHistoryMessage }>;
  labelsAdded?: Array<{ message: RawHistoryMessage; labelIds: string[] }>;
  labelsRemoved?: Array<{ message: RawHistoryMessage; labelIds: string[] }>;
}

interface RawHistoryListResponse {
  history?: RawHistoryItem[];
  historyId?: string;
  nextPageToken?: string;
}

type AnyPushFrame = PushPayload<MessageAddedPayload | MessageDeletedPayload | MessageLabelModificationPayload>;

/**
 * Polls Gmail's users.history.list API for each signed-in Google account and
 * emits push frames in the same envelope shape the renderer's MessageContext
 * already consumes. Runs only when provider === 'google' (standalone mode).
 *
 * HistoryIds are persisted in electron-store between sessions so that polling
 * resumes from the correct point after an app restart.
 */
class GmailHistoryPoller {
  private static instance: GmailHistoryPoller;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private store: Store<PollerStoreSchema>;

  private constructor() {
    this.store = new Store<PollerStoreSchema>({ name: 'gmail-poller' });

    tokenManager.on('token-changed', () => {
      if (tokenManager.getState()?.provider === 'google') {
        this.restart();
      }
    });

    tokenManager.on('google-accounts-changed', () => {
      if (tokenManager.getState()?.provider === 'google') {
        this.restart();
      }
    });

    tokenManager.on('signed-out', () => this.stopAll());
  }

  static getInstance(): GmailHistoryPoller {
    if (!GmailHistoryPoller.instance) {
      GmailHistoryPoller.instance = new GmailHistoryPoller();
    }
    return GmailHistoryPoller.instance;
  }

  /** Called once on app bootstrap. Starts polling if tokens are already on disk. */
  start(): void {
    if (tokenManager.getState()?.provider === 'google') {
      this.restart();
    }
  }

  stopAll(): void {
    for (const uid of this.timers.keys()) {
      this.stopForAccount(uid);
    }
  }

  private restart(): void {
    this.stopAll();
    const accounts = tokenManager.getGoogleAccounts();
    for (const account of accounts) {
      this.scheduleForAccount(account.uid, 0);
    }
  }

  private scheduleForAccount(uid: string, delayMs: number): void {
    this.stopForAccount(uid);
    const timer = setTimeout(() => this.poll(uid), delayMs);
    this.timers.set(uid, timer);
  }

  private stopForAccount(uid: string): void {
    const timer = this.timers.get(uid);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(uid);
    }
  }

  private async poll(uid: string): Promise<void> {
    try {
      const { accessToken } = await tokenManager.getGoogleAccountAccessToken(uid);

      let historyId = this.getStoredHistoryId(uid);
      if (!historyId) {
        historyId = await this.fetchCurrentHistoryId(uid, accessToken);
        if (!historyId) {
          log.warn('[poller] could not determine startHistoryId for', uid);
          return;
        }
        log.info('[poller] initialised historyId=%s for %s', historyId, uid);
        // First time: nothing to dispatch, just start from current position.
        return;
      }

      const url =
        `${GMAIL_BASE}/history` +
        `?startHistoryId=${encodeURIComponent(historyId)}` +
        '&historyTypes=messageAdded' +
        '&historyTypes=messageDeleted' +
        '&historyTypes=labelAdded' +
        '&historyTypes=labelRemoved';

      const response = await net.fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // historyId too stale — reset and let next poll re-anchor
          log.warn('[poller] historyId expired for %s; resetting', uid);
          this.clearStoredHistoryId(uid);
        } else {
          log.warn('[poller] history fetch %s → %d', uid, response.status);
        }
        return;
      }

      const body = (await response.json()) as RawHistoryListResponse;

      if (body.historyId) {
        this.storeHistoryId(uid, body.historyId);
      }

      const mainWindow = windowManager.getMainAppWindow();
      for (const item of body.history ?? []) {
        for (const frame of buildPushFrames(item, uid)) {
          handlePushFrame(
            frame as { data?: Record<string, string>; notification?: { title?: string; body?: string } }
          ).catch((e) => log.warn('[poller] handlePushFrame:', (e as Error).message));
          if (mainWindow) {
            mainWindow.webContents.send('renderer:push:message-received', frame);
          }
        }
      }

      if (body.history?.length) {
        log.debug('[poller] dispatched %d history items for %s', body.history.length, uid);
      }
    } catch (e) {
      log.warn('[poller] poll error for %s:', uid, (e as Error).message);
    } finally {
      this.scheduleForAccount(uid, POLL_INTERVAL_MS);
    }
  }

  private async fetchCurrentHistoryId(uid: string, accessToken: string): Promise<string | null> {
    try {
      const resp = await net.fetch(`${GMAIL_BASE}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { historyId?: string };
      if (data.historyId) {
        this.storeHistoryId(uid, data.historyId);
        return data.historyId;
      }
      return null;
    } catch {
      return null;
    }
  }

  private getStoredHistoryId(uid: string): string | null {
    const ids = this.store.get('historyIds', {});
    return ids[uid] ?? null;
  }

  private storeHistoryId(uid: string, id: string): void {
    const ids = this.store.get('historyIds', {});
    this.store.set('historyIds', { ...ids, [uid]: id });
  }

  private clearStoredHistoryId(uid: string): void {
    const ids = this.store.get('historyIds', {});
    delete ids[uid];
    this.store.set('historyIds', ids);
  }
}

function labelString(ids: string[]): string {
  return `[${ids.join(', ')}]`;
}

function buildPushFrames(item: RawHistoryItem, uid: string): AnyPushFrame[] {
  const frames: AnyPushFrame[] = [];

  for (const { message } of item.messagesAdded ?? []) {
    const labels = message.labelIds ?? [];
    if (labels.includes('DRAFT') || labels.includes('SENT')) continue;
    frames.push({
      data: {
        type: 'MESSAGE_ADDED',
        aAUid: uid,
        threadId: message.threadId,
        id: message.id,
        labels: labelString(labels),
        verification: 'false',
        link: '',
        code: ''
      } satisfies MessageAddedPayload,
      notification: { title: 'New email', body: '' }
    });
  }

  for (const { message } of item.messagesDeleted ?? []) {
    frames.push({
      data: {
        type: 'MESSAGE_DELETED',
        aAUid: uid,
        threadId: message.threadId,
        id: message.id
      } satisfies MessageDeletedPayload
    });
  }

  for (const { message, labelIds } of item.labelsAdded ?? []) {
    frames.push({
      data: {
        type: 'LABEL_ADDED',
        aAUid: uid,
        threadId: message.threadId,
        id: message.id,
        labels: labelString(labelIds)
      } satisfies MessageLabelModificationPayload
    });
  }

  for (const { message, labelIds } of item.labelsRemoved ?? []) {
    frames.push({
      data: {
        type: 'LABEL_REMOVED',
        aAUid: uid,
        threadId: message.threadId,
        id: message.id,
        labels: labelString(labelIds)
      } satisfies MessageLabelModificationPayload
    });
  }

  return frames;
}

export const gmailHistoryPoller = GmailHistoryPoller.getInstance();
