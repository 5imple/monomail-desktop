import { MessageAddedPayload } from '@/main/api/message/push';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { notificationManager } from '@/main/services/notification/NotificationManager';
import { getSupportEmailMain } from '@/main/utils/supportEmail';
import log from 'electron-log';

/**
 * Native-notification side of push delivery. Moved out of the FCM
 * IPC handler so the WebSocket transport can call into it directly
 * without going through ipcMain.
 */

export const isPrimaryThread = (labelIds: string[], from: string, aAUid: string): boolean => {
  if (from.includes('github.com')) {
    return false;
  }
  if (!labelIds.includes('INBOX')) return false;
  if (labelIds.includes('CATEGORY_PERSONAL')) return true;
  const hasOtherCategory = labelIds.some((label: string) =>
    [
      systemManager.getSplitCategoryPreferences(aAUid)?.showSocial ? null : 'CATEGORY_SOCIAL',
      systemManager.getSplitCategoryPreferences(aAUid)?.showPromotions
        ? null
        : 'CATEGORY_PROMOTIONS',
      systemManager.getSplitCategoryPreferences(aAUid)?.showForums ? null : 'CATEGORY_FORUMS',
      systemManager.getSplitCategoryPreferences(aAUid)?.showUpdates ? null : 'CATEGORY_UPDATES'
    ]
      .filter(Boolean)
      .includes(label)
  );
  return !hasOtherCategory;
};

export async function handlePushFrame(frame: {
  data?: Record<string, string>;
  notification?: { title?: string; body?: string };
}): Promise<void> {
  const messageData = frame.data;
  const notification = frame.notification;
  if (!messageData || !notification) return;
  if (messageData.type === 'MESSAGE_ADDED') {
    await handleMessageAdded(messageData as unknown as MessageAddedPayload, notification);
  }
}

async function handleMessageAdded(
  addedMessage: MessageAddedPayload,
  notification: { title?: string; body?: string }
): Promise<void> {
  const labelIds = addedMessage.labels.replace(/[\\[\]\s]/g, '').split(',');
  if (labelIds.includes('DRAFT') || labelIds.includes('SENT')) return;
  const userPreference = systemManager.getNotificationPreference(addedMessage.aAUid) || 'INBOX';
  if (userPreference === 'OFF') {
    log.info(`Notification skipped for ${addedMessage.aAUid}: preference set to OFF`);
    return;
  }
  if (userPreference !== 'ALL') {
    if (userPreference === 'PRIMARY') {
      if (!isPrimaryThread(labelIds, notification.title ?? '', addedMessage.aAUid)) {
        log.info(
          `Notification skipped for ${addedMessage.aAUid}: preference set to PRIMARY but message is not in primary category`
        );
        return;
      }
    } else if (!labelIds.includes(userPreference)) {
      log.info(
        `Notification skipped for ${addedMessage.aAUid}: message doesn't have required label ${userPreference}`
      );
      return;
    }
  }
  if (addedMessage.verification === 'true') {
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
  } else {
    notificationManager.createNativeNotification({
      ...notification,
      id: addedMessage.threadId,
      title: notification.title ?? 'Mail',
      body: notification.body ?? '',
      metadata: { aAUid: addedMessage.aAUid, threadId: addedMessage.threadId }
    });
    log.info(`Notification created for ${addedMessage.aAUid}`);
  }
}
