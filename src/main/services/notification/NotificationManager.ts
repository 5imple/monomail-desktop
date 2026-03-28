import {
  ICustomNotificationOptions,
  INativeNotificationOptions
} from '@/main/services/notification/INotificationOptions';
import { ipcMain, Notification } from 'electron';
import CustomNotification from './CustomNotification';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import path from 'path';

class NotificationManager {
  private static instance: NotificationManager;
  private customNotifications: Map<string, CustomNotification>;
  private nativeNotifications: Map<string, Notification> = new Map();

  constructor() {
    this.customNotifications = new Map<string, CustomNotification>();

    // Set up the ipcMain event listeners that will handle clicks and closing events for notifications
    ipcMain.on('main:notification:custom:clicked', (event, id: string, data?: any) => {
      const notification = this.customNotifications.get(id);
      if (notification) {
        // log.debug(`Notification ${id} clicked!`, data);
        notification.emit('click', data);
      } else {
        // log.debug(`Notification ${id} not found.`);
      }
    });

    ipcMain.on('main:notification:custom:close', (event, id: string) => {
      this.removeCustomNotification(id);
    });
  }

  /**
   * Get the singleton instance of WindowManager.
   * @returns {NotificationManager} The singleton instance
   */
  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  /**
   * Creates a new notification using the id from options.
   * @param options The notification options with an id
   * @returns {string} The ID of the created notification
   */
  public createCustomNotification(options: ICustomNotificationOptions): string {
    const id = options.id; // Use the id provided in ICustomNotificationOptions

    if (this.customNotifications.has(id)) {
      // log.debug(`Notification with id ${id} already exists.`);
      return id; // Return early if notification with this ID already exists
    }

    const notification = new CustomNotification(options);
    // Store the notification in the manager
    this.customNotifications.set(id, notification);

    return id; // Return the ID so it can be used elsewhere
  }

  /**
   * Creates a native system notification
   * @param options The notification options
   * @returns {string} The ID of the created notification
   */
  public createNativeNotification<T>(options: INativeNotificationOptions<T>): string {
    const id = options.id || `native-${Date.now()}`; // Assign a unique ID if none provided

    if (this.nativeNotifications.has(id)) {
      // Prevent duplicates
      return id;
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: options.icon || path.join(__dirname, 'build/icon.png'),
      silent: options.silent || false
    });

    notification.on('click', () => {
      const browserWindow = windowManager.getMainAppWindow();
      if (!browserWindow) {
        windowManager.createAppWindow({
          messages: [{ channel: 'renderer:notification:native:clicked', args: [options.metadata] }]
        });
      } else {
        browserWindow.show();
        browserWindow.webContents.send('renderer:notification:native:clicked', options.metadata);
      }
      this.nativeNotifications.delete(id); // Remove after use
    });

    notification.on('close', () => {
      this.nativeNotifications.delete(id);
    });

    notification.show();

    this.nativeNotifications.set(id, notification); // Retain notification
    return id;
  }

  /**
   * Removes a custom notification by its ID.
   * @param id The ID of the notification to remove
   */
  public removeCustomNotification(id: string): void {
    const notification = this.customNotifications.get(id);
    if (notification) {
      notification.dispose(); // Close and dispose the notification
      this.customNotifications.delete(id); // Remove from the manager
      // log.debug(`Notification ${id} removed`);
    } else {
      // log.debug(`Notification ${id} not found`);
    }
  }

  /**
   * Removes a native notification by its ID.
   * @param id The ID of the notification to remove
   * @returns {boolean} Whether the notification was found and removed
   */
  public removeNativeNotification(id: string): boolean {
    const notification = this.nativeNotifications.get(id);
    if (notification) {
      notification.close();
      this.nativeNotifications.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Removes all notifications, both custom and native.
   */
  public clearAllNotifications(): void {
    // Close all custom notifications
    this.customNotifications.forEach((notification) => {
      notification.dispose();
    });
    this.customNotifications.clear();

    // Close all native notifications
    this.nativeNotifications.forEach((notification) => {
      notification.close();
    });
    this.nativeNotifications.clear();
  }

  /**
   * Checks if a notification with the given ID exists.
   * @param id The ID to check
   * @returns {boolean} Whether the notification exists
   */
  public hasNotification(id: string): boolean {
    return this.customNotifications.has(id) || this.nativeNotifications.has(id);
  }

  /**
   * Get the notification by ID.
   * @param id The ID of the notification
   * @returns {CustomNotification | null} The notification instance
   */
  public getCustomNotification(id: string): CustomNotification | null {
    return this.customNotifications.get(id) || null;
  }

  /**
   * Get the native notification by ID.
   * @param id The ID of the notification
   * @returns {Notification | null} The native notification instance
   */
  public getNativeNotification(id: string): Notification | null {
    return this.nativeNotifications.get(id) || null;
  }
}

export const notificationManager = NotificationManager.getInstance();
