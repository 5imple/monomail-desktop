import mailApi from '@/main/api/mail/mailApi';

import { MessageAddedPayload } from '@/main/api/message/fcm';
import messageApi from '@/main/api/message/messageApi';
import {
  FCM_MESSAGE_RECEIVED,
  FCM_SERVICE_ERROR,
  FCM_SERVICE_STARTED,
  FCM_TOKEN_UPDATED
} from '@/main/api/message/types';
import { notificationManager } from '@/main/services/notification/NotificationManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { FcmClientMessageData } from '@aracna/fcm';
import { ipcMain, IpcMainEvent, powerSaveBlocker } from 'electron';
import log from 'electron-log';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { apiClient } from '@/main/api/apiClient';
import { getSupportEmailMain } from '@/main/utils/supportEmail';
let blockerId: number | null = null;

// Helper function to check if a thread belongs to the primary category
export const isPrimaryThread = (labelIds: string[], from: string, aAUid: string): boolean => {
  if (from.includes('github.com')) {
    return false;
  }

  // Must be in INBOX to be considered for Primary
  if (!labelIds.includes('INBOX')) {
    return false;
  }

  // Explicitly marked as personal
  if (labelIds.includes('CATEGORY_PERSONAL')) {
    return true;
  }

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

export async function registerFcmHandlers() {
  ipcMain.on(
    FCM_SERVICE_STARTED,
    async (event: IpcMainEvent, fcmToken: string | null, uid: string) => {
      if (blockerId === null) {
        blockerId = powerSaveBlocker.start('prevent-app-suspension');
        log.info('Power save blocker started:', powerSaveBlocker.isStarted(blockerId));
      }
      try {
        apiClient.setApiActiveUid(uid);
        await mailApi.watchCloudPubSub(uid);
        log.info(`Messaging started ${uid}`);
      } catch (e) {
        log.error(`Messaging start error`, e);
      }
    }
  );

  ipcMain.on(FCM_SERVICE_ERROR, async (_event: IpcMainEvent, error) => {
    if (blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      log.info('Power save blocker stopped');
      blockerId = null;
    }
    log.error(error);
  });

  ipcMain.on(
    FCM_TOKEN_UPDATED,
    async (_event: IpcMainEvent, uid: string, fcmToken: string | null) => {
      try {
        if (fcmToken) {
          await messageApi.saveFcmToken(uid, fcmToken);
        }
        const mainWindow = windowManager.getMainAppWindow();
        if (mainWindow) {
          mainWindow.webContents.send('renderer:fcm:token-updated', fcmToken);
        }
      } catch (e) {
        log.error(e);
      }
    }
  );

  ipcMain.on(
    FCM_MESSAGE_RECEIVED,
    async (
      _event: IpcMainEvent,
      message: FcmClientMessageData<{
        type: string;
        id: string;
      }>
    ) => {
      log.info('Message received:', message.fcmMessageId);
      const messageData = message.data;
      const notification = message.notification;
      if (messageData && notification) {
        switch (messageData.type) {
          case 'MESSAGE_ADDED': {
            const addedMessage = messageData as unknown as MessageAddedPayload;
            await handleMessageAdded(addedMessage, notification);
            break;
          }
        }
      }

      const mainWindow = windowManager.getMainAppWindow();
      if (mainWindow) {
        mainWindow.webContents.send('renderer:fcm:message-received', message);
      }
    }
  );
}

async function handleMessageAdded(
  addedMessage: MessageAddedPayload,
  notification: { title?: string; body?: string }
) {
  const labelIds = addedMessage.labels.replace(/[\\[\]\s]/g, '').split(',');

  // Don't show notifications for drafts or sent messages
  if (labelIds.includes('DRAFT') || labelIds.includes('SENT')) return;

  // Check if message matches the user's notification preference
  const userPreference = systemManager.getNotificationPreference(addedMessage.aAUid) || 'INBOX';

  // Skip notification if user preference is OFF
  if (userPreference === 'OFF') {
    log.info(`Notification skipped for ${addedMessage.aAUid}: preference set to OFF`);
    return;
  }

  if (userPreference !== 'ALL') {
    // Check if preference is a special case
    if (userPreference === 'PRIMARY') {
      if (!isPrimaryThread(labelIds, notification.title ?? '', addedMessage.aAUid)) {
        log.info(
          `Notification skipped for ${addedMessage.aAUid}: preference set to PRIMARY but message is not in primary category`
        );
        return;
      }
    }
    // Any other preference value is treated as a label that must be present
    else if (!labelIds.includes(userPreference)) {
      log.info(
        `Notification skipped for ${addedMessage.aAUid}: message doesn't have required label ${userPreference}`
      );
      return;
    }
  }

  // Process verification messages
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
    // Create a regular notification
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
