import type { MessageAddedPayload, NotificationClickPayload } from '@/main/api/message/push';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { notificationManager } from '@/main/services/notification/NotificationManager';
import {
  ExpiringKeySet,
  RECENTLY_NOTIFIED_LIMIT,
  RESTORED_THREAD_QUIET_MS,
  RecentKeySet,
  isFreshUnread,
  parseFrameLabels,
  passesNotificationPreference,
  planAlertSound,
  planBanners,
  summaryBannerText
} from '@/main/services/push/notificationPolicy';
import { MAIN_STRINGS } from '@/main/utils/strings';
import { getSupportEmailMain } from '@/main/utils/supportEmail';
import log from 'electron-log';

/**
 * Native-notification side of push delivery. Moved out of the FCM
 * IPC handler so the WebSocket transport can call into it directly
 * without going through ipcMain.
 *
 * The decisions themselves (unread + recent only, collapse bursts, sound) live
 * in the pure notificationPolicy module; this file wires them to Electron.
 */

export interface PushFrame {
  data?: Record<string, string>;
  notification?: { title?: string; body?: string };
}

interface MailBanner {
  uid: string;
  messageId: string;
  threadId: string;
  title: string;
  body: string;
}

// Message keys already announced: a later upsert of the same message (flagged,
// moved, re-delivered by an overlapping poll) never raises a second banner.
const recentlyNotified = new RecentKeySet(RECENTLY_NOTIFIED_LIMIT);
// Threads that just announced themselves another way (back from snooze).
const quietThreads = new ExpiringKeySet();

const messageKey = (uid: string, messageId: string) => `${uid}:${messageId}`;
const threadKey = (uid: string, threadId: string) => `${uid}:${threadId}`;

/** Keep a thread from raising a new-mail banner for a short while. */
export function quietThread(uid: string, threadId: string, ms = RESTORED_THREAD_QUIET_MS): void {
  quietThreads.add(threadKey(uid, threadId), Date.now(), ms);
}

/** True when the main window's renderer is loaded and can play a sound. */
function rendererCanPlaySound(): boolean {
  const win = windowManager.getMainAppWindow();
  if (!win || win.isDestroyed()) return false;
  const contents = win.webContents;
  return !contents.isDestroyed() && !contents.isLoadingMainFrame() && !contents.isCrashed();
}

/** Plays the chosen alert sound in the main window's renderer (once per batch). */
function playRendererSound(sound: string): void {
  const win = windowManager.getMainAppWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('renderer:notification:sound', sound);
}

function showBanner(
  id: string,
  title: string,
  body: string,
  silent: boolean,
  metadata: NotificationClickPayload
): void {
  notificationManager.createNativeNotification<NotificationClickPayload>({
    id,
    title,
    body,
    silent,
    metadata,
    replace: true
  });
}

/** One frame: kept for callers outside the poller. */
export async function handlePushFrame(frame: PushFrame): Promise<void> {
  await handlePushFrames([frame]);
}

/**
 * Raises native notifications for one dispatch of push frames. Only unread
 * mail received recently notifies, each message at most once; more than a
 * handful in one account collapse into a single "N new emails" banner; the
 * chosen alert sound plays once for the whole batch.
 */
export async function handlePushFrames(frames: PushFrame[]): Promise<void> {
  const now = Date.now();
  const banners: MailBanner[] = [];

  for (const frame of frames) {
    const data = frame.data;
    const notification = frame.notification;
    if (!data || !notification || data.type !== 'MESSAGE_ADDED') continue;
    const added = data as unknown as MessageAddedPayload;
    const labelIds = parseFrameLabels(added.labels);
    const preference = systemManager.getNotificationPreference(added.aAUid);
    const splitPrefs = systemManager.getSplitCategoryPreferences(added.aAUid);
    if (!passesNotificationPreference(labelIds, preference, splitPrefs)) continue;

    if (added.verification === 'true') {
      showVerification(added, notification);
      continue;
    }

    if (!isFreshUnread(labelIds, added.receivedAt, now)) continue;
    const key = messageKey(added.aAUid, added.id);
    if (recentlyNotified.has(key)) continue;
    if (quietThreads.has(threadKey(added.aAUid, added.threadId), now)) continue;
    // Claim it now so a second frame for the same message in this batch is dropped.
    recentlyNotified.add(key);

    banners.push({
      uid: added.aAUid,
      messageId: added.id,
      threadId: added.threadId,
      title: notification.title || MAIN_STRINGS.notifications.newMailFallbackTitle,
      body: notification.body ?? ''
    });
  }

  if (banners.length === 0) return;

  const sound = planAlertSound(systemManager.getAlertSound(), rendererCanPlaySound());
  // With the OS sound as fallback, only the first banner of the batch chimes.
  let silent = sound.silentNative;

  const byAccount = new Map<string, MailBanner[]>();
  for (const banner of banners) {
    byAccount.set(banner.uid, [...(byAccount.get(banner.uid) ?? []), banner]);
  }

  for (const [uid, accountBanners] of byAccount) {
    const plan = planBanners(accountBanners);
    if (!plan) continue;
    if (plan.kind === 'summary') {
      const { title, body } = summaryBannerText(
        plan.items.length,
        plan.items.map((b) => b.title)
      );
      // One summary per account: replacing keeps a single banner up while a
      // burst continues across polls.
      showBanner(`mail-summary:${uid}`, title, body, silent, { uid });
      silent = true;
      log.info('[notify] %s: %d new message(s) collapsed into one summary', uid, plan.items.length);
      continue;
    }
    for (const banner of plan.items) {
      showBanner(`mail:${uid}:${banner.threadId}`, banner.title, banner.body, silent, {
        uid,
        threadId: banner.threadId
      });
      silent = true;
    }
    log.info('[notify] %s: %d notification(s) shown', uid, plan.items.length);
  }

  if (sound.rendererSound) playRendererSound(sound.rendererSound);
}

function showVerification(
  addedMessage: MessageAddedPayload,
  notification: { title?: string; body?: string }
): void {
  if (addedMessage.link.length > 0) {
    notificationManager.createCustomNotification({
      id: addedMessage.id,
      type: 'VERIFICATION_URL',
      data: addedMessage.link,
      from: notification.title ?? getSupportEmailMain(),
      audio: systemManager.getAlertSound()
    });
  } else if (addedMessage.code.length > 0) {
    notificationManager.createCustomNotification({
      id: addedMessage.id,
      type: 'VERIFICATION_CODE',
      data: addedMessage.code,
      from: notification.title ?? getSupportEmailMain(),
      audio: systemManager.getAlertSound()
    });
  }
}

/**
 * "Back from snooze": a snoozed conversation returned to the Inbox. Honours the
 * account's 'OFF' notification preference and the alert sound, and quiets the
 * thread briefly so the poller's follow-up upsert does not notify again.
 */
export function notifyBackFromSnooze(args: {
  uid: string;
  threadId: string;
  subject?: string;
}): void {
  const { uid, threadId } = args;
  quietThread(uid, threadId);
  if (systemManager.getNotificationPreference(uid) === 'OFF') return;

  const strings = MAIN_STRINGS.notifications;
  const sound = planAlertSound(systemManager.getAlertSound(), rendererCanPlaySound());
  showBanner(
    `snooze:${uid}:${threadId}`,
    strings.backFromSnoozeTitle,
    args.subject?.trim() || strings.backFromSnoozeFallbackBody,
    sound.silentNative,
    { uid, threadId }
  );
  if (sound.rendererSound) playRendererSound(sound.rendererSound);
}
