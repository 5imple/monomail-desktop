import { systemManager } from '@/main/services/mangers/system/SystemManager';
import {
  ICustomNotificationOptions,
  INativeNotificationOptions
} from '@/main/services/notification/INotificationOptions';
import { notificationManager } from '@/main/services/notification/NotificationManager';
import { ipcMain } from 'electron';
import log from 'electron-log';

export function registerNotificationHandlers() {
  // Create notifications
  ipcMain.handle(
    'main:notification:native:show',
    <T>(_, options: INativeNotificationOptions<T>) => {
      return notificationManager.createNativeNotification(options);
    }
  );

  ipcMain.handle('main:notification:custom:show', (_, options: ICustomNotificationOptions) => {
    return notificationManager.createCustomNotification(options);
  });

  // Remove notifications
  ipcMain.handle('main:notification:custom:remove', (_, id: string) => {
    notificationManager.removeCustomNotification(id);
    return true;
  });

  ipcMain.handle('main:notification:native:remove', (_, id: string) => {
    return notificationManager.removeNativeNotification(id);
  });

  // Remove all notifications
  ipcMain.handle('main:notification:clear-all', () => {
    notificationManager.clearAllNotifications();
    return true;
  });

  // Get notification info
  ipcMain.handle('main:notification:custom:get', (_, id: string) => {
    const notification = notificationManager.getCustomNotification(id);
    return notification ? { exists: true, id: notification.id } : { exists: false };
  });

  // Check if notification exists
  ipcMain.handle('main:notification:exists', (_, id: string) => {
    return notificationManager.hasNotification(id);
  });

  // Notification preference handlers
  ipcMain.handle('main:notification:preference:get', async (_, uid: string) => {
    try {
      const preference = systemManager.getNotificationPreference(uid);
      return preference || 'INBOX'; // Default to INBOX if not set
    } catch (error) {
      log.error(`Error getting notification preference for ${uid}:`, error);
      return 'INBOX'; // Default to INBOX in case of error
    }
  });

  ipcMain.handle('main:notification:preference:set', async (_, uid: string, preference: string) => {
    try {
      systemManager.setNotificationPreference(uid, preference);
      return true;
    } catch (error) {
      log.error(`Error setting notification preference for ${uid}:`, error);
      return false;
    }
  });

  ipcMain.handle('main:notification:preferences:get:all', async () => {
    try {
      return systemManager.getAllNotificationPreferences();
    } catch (error) {
      log.error('Error getting all notification preferences:', error);
      return {}; // Return empty object in case of error
    }
  });
}
