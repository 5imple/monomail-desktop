import { SplitCategoryPreferences } from '@/main/api/auth/types';
import type {
  CreateScheduleRequest as QueueScheduleRequest,
  CreateSnoozeRequest as QueueSnoozeRequest,
  ScheduleRecord as QueueScheduleRecord,
  SnoozeRecord as QueueSnoozeRecord
} from '@/main/api/queue/types';

type QueueResult<T> = { ok: true; data: T } | { ok: false; error: string };
type GmailBridgeRequest = {
  method: string;
  path: string;
  uid: string;
  headers?: Record<string, string>;
  body?: string;
  responseType?: 'json' | 'blob' | 'text';
};
type GmailBridgeResult<T = any> =
  | { ok: true; status: number; data: T }
  | { ok: false; status?: number; data?: any; error: string };
type PeopleBridgeRequest = {
  path: string;
  uid: string;
  headers?: Record<string, string>;
  responseType?: 'json' | 'blob' | 'text';
};
import { ToastArgs } from '@/main/models/types/toastTypes';
import {
  INativeNotificationOptions,
  ICustomNotificationOptions
} from '@/main/services/notification/INotificationOptions';
import { ValidRendererChannel } from '@/main/validChannels';
import { AudioType } from '@/renderer/app/lib/soundManager';
import { CommandType } from '@/renderer/app/types';
import { BrowserWindowConstructorOptions } from 'electron';

/**
 * Check if the application is running in Electron.
 */
export const isElectron =
  window && window.electronBridge && typeof window.electronBridge.on === 'function';

/**
 * Interface for the IpcRenderer API.
 */
interface IpcRenderer {
  /**
   * Listen for an event from the main process.
   * @param {ValidRendererChannel} channel - The channel to listen to.
   * @param {(...args: T[]) => void} callback - The callback to invoke when the event is received.
   * @returns {() => void} A function to remove the listener.
   */
  on: <T = any>(channel: ValidRendererChannel, callback: (args: T) => void) => () => void;

  /**
   * Remove a listener for an event from the main process.
   * @param {ValidRendererChannel} channel - The channel to remove the listener from.
   * @param {(...args: T[]) => void} callback - The callback to remove.
   */
  off: <T = any>(channel: ValidRendererChannel, callback: (...args: T[]) => void) => void;

  /**
   * @deprecated Pre-Phase-B the renderer pushed Firebase ID tokens into
   * main here. Now tokens live in main (loaded from the OAuth deep-link),
   * and this becomes a no-op in the bridge.
   */
  setIdToken: (token: string | null) => Promise<void>;

  /**
   * Read the current auth state from main. Returns null when signed out.
   */
  getAuthState: () => Promise<{
    accessToken: string;
    expiresAt: number;
    member: {
      uid: string;
      email: string;
      displayName?: string;
      photoURL?: string;
    } | null;
    provider?: 'google' | 'backend';
    googleAccounts?: Array<{
      uid: string;
      email: string;
      displayName?: string;
      photoURL?: string;
      expiresAt: number;
      scopes: string[];
    }>;
  } | null>;

  /**
   * Clear tokens in main + tear down the WebSocket push channel.
   */
  signOutMain: () => Promise<void>;

  /**
   * Force a refresh round-trip. Returns { ok, accessToken?, expiresAt?, error? }.
   */
  refreshToken: () => Promise<
    { ok: true; accessToken: string; expiresAt: number } | { ok: false; error: string }
  >;
  /**
   * Dev-only: hand pre-parsed tokens straight to main's TokenManager. Used
   * by SignInLayout when the configured homepage is localhost — bypasses
   * the OS protocol handler (unreliable in `npm run dev`).
   */
  devSignIn: (args: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Trigger a full Google OAuth PKCE flow in the system browser. Requires MONO_ENV_GOOGLE_CLIENT_ID. */
  initiateSignIn: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Trigger a Google OAuth PKCE flow to add a second account. Requires MONO_ENV_GOOGLE_CLIENT_ID. */
  initiateAddAccount: () => Promise<
    { ok: true; accessToken: string } | { ok: false; error: string }
  >;
  /** Remove a secondary Google account from local token storage. Returns ok:false if not found or if uid is the primary account. */
  removeGoogleAccount: (uid: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  createAccountLinkIntent: (args?: {
    provider?: string;
    client?: string;
  }) => Promise<
    { ok: true; intent: string; expiresAt?: string } | { ok: false; error: string; status?: number }
  >;
  completeAccountLink: (args: {
    intent: string;
    code: string;
  }) => Promise<
    | { ok: true; accessToken: string; expiresAt: number }
    | { ok: false; error: string; status?: number }
  >;
  getGoogleAccountToken: (
    uid: string
  ) => Promise<{ ok: true; accessToken: string; expiresAt: number } | { ok: false; error: string }>;
  gmailRequest: <T = any>(args: GmailBridgeRequest) => Promise<GmailBridgeResult<T>>;
  peopleRequest: <T = any>(args: PeopleBridgeRequest) => Promise<GmailBridgeResult<T>>;
  devAddAccount: (args: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;

  // ---------- P8 Later Queue ----------
  // Each method wraps main:queue:* IPC. Responses are always
  // { ok: true, data: T } | { ok: false; error: string } — the IPC
  // handler normalizes axios rejections into the error branch.
  queueSnooze: (req: QueueSnoozeRequest) => Promise<QueueResult<QueueSnoozeRecord>>;
  queueListSnoozed: (accountId: string) => Promise<QueueResult<{ items: QueueSnoozeRecord[] }>>;
  queueUnsnooze: (snoozeId: string) => Promise<QueueResult<{ ok: boolean }>>;
  queueRescheduleSnooze: (args: {
    snoozeId: string;
    snoozeUntil: string;
  }) => Promise<QueueResult<QueueSnoozeRecord>>;
  queueSchedule: (req: QueueScheduleRequest) => Promise<QueueResult<QueueScheduleRecord>>;
  queueListScheduled: (accountId: string) => Promise<QueueResult<{ items: QueueScheduleRecord[] }>>;
  queueCancelSchedule: (scheduleId: string) => Promise<QueueResult<{ ok: boolean }>>;
  queueRescheduleSend: (args: {
    scheduleId: string;
    sendAt: string;
  }) => Promise<QueueResult<QueueScheduleRecord>>;
  queueSendNow: (scheduleId: string) => Promise<QueueResult<{ ok: boolean; messageId: string }>>;
  /**
   * Set the app offline
   * @param {boolean} status - Offline status
   * @returns {Promise<void>}
   */
  setOfflineStatus: (status: boolean) => Promise<void>;
  /**
   * Set the app alert sound
   * @param {AudioType} audio - Audio type
   * @returns {Promise<void>}
   */
  setAlertSound: (audio: AudioType) => Promise<void>;

  setIsFullSizeWindowOnCreation: (value: boolean) => Promise<void>;
  setStrictPubSub: (value: boolean) => Promise<void>;
  /**
   * Set the active uid for authentication.
   * @param {string | null} token - The ID token to set.
   * @returns {Promise<void>}
   */
  setActiveUid: (uid: string | null) => Promise<void>;

  /**
   * Open a new window with the specified route.
   * @param {string} route - The route to load in the new window.
   * @returns {Promise<void>}
   */
  openNewWindow: (
    route: string,
    options?: Partial<BrowserWindowConstructorOptions>,
    uid?: string
  ) => Promise<void>;

  /**
   * Close a window with the window Id
   * @param {string} uid - The id of the window.
   * @returns {Promise<void>}
   */
  closeWindow: (uid: string) => Promise<void>;

  /**
   * Start FCM token service.
   * @param {string} uid - Active user uid
   */
  startNotificationService: (uid: string) => void;

  /**
   * Get notification preference for a specific account
   * @param {string} uid - User ID
   * @returns {Promise<string>}
   */
  getNotificationPreference: (uid: string) => Promise<string>;

  /**
   * Set notification preference for a specific account
   * @param {string} uid - User ID
   * @param {string} preference - Notification preference
   * @returns {Promise<boolean>}
   */
  setNotificationPreference: (uid: string, preference: string) => Promise<boolean>;

  /**
   * Get all notification preferences
   * @returns {Promise<Record<string, string>>}
   */
  getAllNotificationPreferences: () => Promise<Record<string, string>>;

  /**
   * Change Theme
   */
  changeAppearance: (appearance: 'light' | 'dark' | 'black' | 'pure-light' | 'system') => void;

  /**
   * Show a notification.
   * @param {string} title - The title of the notification.
   * @param {string} body - The body content of the notification.
   * @param {Partial<INativeNotificationOptions<T>>} options - Optional additional options for the notification.
   * @returns {Promise<void>}
   */
  showNativeNotification: <T = any>(
    title: string,
    body?: string,
    options?: Partial<INativeNotificationOptions<T>>
  ) => Promise<void>;

  /**
   * Show a custom notification.
   * @param {string} title - The title of the notification.
   * @param {string} body - The body content of the notification.
   * @param {Partial<INativeNotificationOptions<T>>} options - Optional additional options for the notification.
   * @returns {Promise<void>}
   */
  showCustomNotification: (
    title: string,
    body?: string,
    options?: Partial<ICustomNotificationOptions>
  ) => Promise<void>;

  /**
   * Close custom notification.
   */
  notificationClose: (id: string) => void;

  /**
   * Update & Install Application
   */
  downloadAndInstallUpdate: () => void;

  /**
   * Check update
   */
  checkForUpdate: () => void;

  /**
   * Trigger when custom notification is clicked.
   */
  notificationClicked: (id: string, data?: any) => void;

  /**
   * Main layout ready
   */
  mainLayoutReady: () => void;

  openLogFolder: () => Promise<string>;

  showToast: (args: ToastArgs) => void;
  triggerCommand: (command: CommandType) => void;
  getAutoStartEnabled: () => boolean;
  toggleAutoStart: () => void;

  /**
   * Close a native notification by ID.
   * @param {string} id - The ID of the native notification to close.
   * @returns {Promise<boolean>} Whether the operation was successful.
   */
  closeNativeNotification: (id: string) => Promise<boolean>;

  /**
   * Set the badge count on the app icon
   * @param {number} count - The count to display
   * @returns {Promise<boolean>} Whether the operation was successful
   */
  setBadgeCount: (count: number) => Promise<boolean>;

  /**
   * Increment the badge count by the specified amount
   * @param {number} [amount=1] - The amount to increment by
   * @returns {Promise<number>} The new badge count
   */
  incrementBadge: (amount?: number) => Promise<number>;

  /**
   * Decrement the badge count by the specified amount
   * @param {number} [amount=1] - The amount to decrement by
   * @returns {Promise<number>} The new badge count
   */
  decrementBadge: (amount?: number) => Promise<number>;

  /**
   * Get the current badge count
   * @returns {Promise<number>} The current badge count
   */
  getBadgeCount: () => Promise<number>;

  /**
   * Clear the badge count (set to 0)
   * @returns {Promise<boolean>} Whether the operation was successful
   */
  clearBadge: () => Promise<boolean>;

  setSplitCategoryPreferences: (
    uid: string,
    preferences: SplitCategoryPreferences
  ) => Promise<void>;
  getSplitCategoryPreferences: (uid: string) => Promise<SplitCategoryPreferences>;
  updateSplitCategoryPreference: (
    uid: string,
    category: keyof SplitCategoryPreferences,
    value: boolean
  ) => Promise<void>;
  getAllSplitCategoryPreferences: () => Promise<Record<string, SplitCategoryPreferences>>;
  unsubscribeFetch: (url: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
  setKnownAccountUids: (uids: string[]) => Promise<void>;
}

/**
 * Implementation of the IpcRenderer API.
 * @type {IpcRenderer}
 */
const electronApi: IpcRenderer = {
  on: (channel, callback) => {
    if (isElectron) {
      return window.electronBridge.on(channel, callback);
    } else {
      console.warn(`Electron API 'on' is not available in web environment for channel: ${channel}`);
      return () => {};
    }
  },
  off: (channel, callback) => {
    if (isElectron) {
      window.electronBridge.off(channel, callback);
    } else {
      console.warn(
        `Electron API 'off' is not available in web environment for channel: ${channel}`
      );
    }
  },
  setOfflineStatus: async (status) => {
    if (isElectron) {
      return window.electronBridge.setOfflineStatus(status);
    } else {
      console.warn(`Electron API 'setIdToken' is not available in web environment`);
      return Promise.resolve();
    }
  },
  setAlertSound: async (audio) => {
    if (isElectron) {
      return window.electronBridge.setAlertSound(audio);
    } else {
      console.warn(`Electron API 'setAlertSound' is not available in web environment`);
      return Promise.resolve();
    }
  },
  setIsFullSizeWindowOnCreation: async (value) => {
    if (isElectron) {
      return window.electronBridge.setIsFullSizeWindowOnCreation(value);
    } else {
      console.warn(
        `Electron API 'setIsFullSizeWindowOnCreation' is not available in web environment`
      );
      return Promise.resolve();
    }
  },
  setStrictPubSub: async (value) => {
    if (isElectron) {
      return window.electronBridge.setStrictPubSub(value);
    } else {
      console.warn(`Electron API 'setStrictPubSub' is not available in web environment`);
      return Promise.resolve();
    }
  },
  setIdToken: async (token) => {
    if (isElectron) {
      return window.electronBridge.setIdToken(token);
    } else {
      console.warn(`Electron API 'setIdToken' is not available in web environment`);
      return Promise.resolve();
    }
  },
  getAuthState: async () => {
    if (isElectron) {
      return window.electronBridge.getAuthState();
    }
    return null;
  },
  signOutMain: async () => {
    if (isElectron) {
      return window.electronBridge.signOutMain();
    }
    return Promise.resolve();
  },
  refreshToken: async () => {
    if (isElectron) {
      return window.electronBridge.refreshToken();
    }
    return { ok: false, error: 'Not in Electron' };
  },
  devSignIn: async (args) => {
    if (isElectron) {
      return window.electronBridge.devSignIn(args);
    }
    return { ok: false, error: 'Not in Electron' };
  },
  initiateSignIn: async () => {
    if (isElectron) return window.electronBridge.initiateSignIn();
    return { ok: false, error: 'Not in Electron' };
  },
  initiateAddAccount: async () => {
    if (isElectron) return window.electronBridge.initiateAddAccount();
    return { ok: false, error: 'Not in Electron' };
  },
  removeGoogleAccount: async (uid) => {
    if (isElectron) return window.electronBridge.removeGoogleAccount(uid);
    return { ok: false, error: 'Not in Electron' };
  },
  createAccountLinkIntent: async (args) => {
    if (isElectron) {
      return window.electronBridge.createAccountLinkIntent(args);
    }
    return { ok: false, error: 'Not in Electron' };
  },
  completeAccountLink: async (args) => {
    if (isElectron) {
      return window.electronBridge.completeAccountLink(args);
    }
    return { ok: false, error: 'Not in Electron' };
  },
  getGoogleAccountToken: async (uid) => {
    if (isElectron) {
      return window.electronBridge.getGoogleAccountToken(uid);
    }
    return { ok: false, error: 'Not in Electron' };
  },
  gmailRequest: async (args) => {
    if (isElectron) {
      return window.electronBridge.gmailRequest(args);
    }
    return { ok: false, error: 'Not in Electron' };
  },
  peopleRequest: async (args) => {
    if (isElectron) {
      return window.electronBridge.peopleRequest(args);
    }
    return { ok: false, error: 'Not in Electron' };
  },
  devAddAccount: async (args) => {
    if (isElectron) {
      return window.electronBridge.devAddAccount(args);
    }
    return { ok: false, error: 'Not in Electron' };
  },

  // ---------- P8 Later Queue ----------
  queueSnooze: async (req) => {
    if (isElectron) return window.electronBridge.queueSnooze(req);
    return { ok: false, error: 'Not in Electron' };
  },
  queueListSnoozed: async (accountId) => {
    if (isElectron) return window.electronBridge.queueListSnoozed(accountId);
    return { ok: false, error: 'Not in Electron' };
  },
  queueUnsnooze: async (snoozeId) => {
    if (isElectron) return window.electronBridge.queueUnsnooze(snoozeId);
    return { ok: false, error: 'Not in Electron' };
  },
  queueRescheduleSnooze: async (args) => {
    if (isElectron) return window.electronBridge.queueRescheduleSnooze(args);
    return { ok: false, error: 'Not in Electron' };
  },
  queueSchedule: async (req) => {
    if (isElectron) return window.electronBridge.queueSchedule(req);
    return { ok: false, error: 'Not in Electron' };
  },
  queueListScheduled: async (accountId) => {
    if (isElectron) return window.electronBridge.queueListScheduled(accountId);
    return { ok: false, error: 'Not in Electron' };
  },
  queueCancelSchedule: async (scheduleId) => {
    if (isElectron) return window.electronBridge.queueCancelSchedule(scheduleId);
    return { ok: false, error: 'Not in Electron' };
  },
  queueRescheduleSend: async (args) => {
    if (isElectron) return window.electronBridge.queueRescheduleSend(args);
    return { ok: false, error: 'Not in Electron' };
  },
  queueSendNow: async (scheduleId) => {
    if (isElectron) return window.electronBridge.queueSendNow(scheduleId);
    return { ok: false, error: 'Not in Electron' };
  },
  setActiveUid: async (uid) => {
    if (isElectron) {
      return window.electronBridge.setActiveUid(uid);
    } else {
      console.warn(`Electron API 'setActiveUid' is not available in web environment`);
      return Promise.resolve();
    }
  },
  openNewWindow: async (route, options, uid) => {
    if (isElectron) {
      return window.electronBridge.openNewWindow(route, options, uid);
    } else {
      console.warn(`Electron API 'openNewWindow' is not available in web environment`);
      return Promise.resolve();
    }
  },
  closeWindow: async (uid) => {
    if (isElectron) {
      return window.electronBridge.closeWindow(uid);
    } else {
      console.warn(`Electron API 'closeWindow' is not available in web environment`);
      return Promise.resolve();
    }
  },
  startNotificationService: (uid) => {
    if (isElectron) {
      return window.electronBridge.startNotificationService(uid);
    } else {
      console.warn(`Electron API 'startNotificationService' is not available in web environment`);
    }
  },
  getNotificationPreference: async (uid) => {
    if (isElectron) {
      return await window.electronBridge.getNotificationPreference(uid);
    } else {
      console.warn(`Electron API 'getNotificationPreference' is not available in web environment`);
      return 'INBOX'; // Default to INBOX in web environment
    }
  },
  setNotificationPreference: async (uid, preference) => {
    if (isElectron) {
      return await window.electronBridge.setNotificationPreference(uid, preference);
    } else {
      console.warn(`Electron API 'setNotificationPreference' is not available in web environment`);
      return false;
    }
  },
  getAllNotificationPreferences: async () => {
    if (isElectron) {
      return await window.electronBridge.getAllNotificationPreferences();
    } else {
      console.warn(
        `Electron API 'getAllNotificationPreferences' is not available in web environment`
      );
      return {};
    }
  },
  changeAppearance: (appearance) => {
    if (isElectron) {
      return window.electronBridge.changeAppearance(appearance);
    } else {
      console.warn(`Electron API 'changeAppearance' is not available in web environment`);
    }
  },
  showNativeNotification: async (title, body, options = {}) => {
    if (isElectron) {
      await window.electronBridge.showNativeNotification(title, body, options);
    } else {
      console.warn(`Electron API 'showNotification' is not available in web environment`);
      // if ('Notification' in window) {
      //   new Notification(title, {
      //     body,
      //     icon: options.icon,
      //     silent: options.silent
      //   });
      // } else {
      //   alert(`${title}\n\n${body}`);
      // }
    }
  },
  showCustomNotification: async (title, body, options = {}) => {
    if (isElectron) {
      await window.electronBridge.showCustomNotification(title, body, options);
    } else {
      console.warn(`Electron API 'showNotification' is not available in web environment`);
      // if ('Notification' in window) {
      //   new Notification(title, {
      //     body,
      //     icon: options.icon,
      //     silent: options.silent
      //   });
      // } else {
      //   alert(`${title}\n\n${body}`);
      // }
    }
  },
  notificationClicked: (id, data) => {
    if (isElectron) {
      return window.electronBridge.notificationClicked(id, data);
    } else {
      console.warn(`Electron API 'notificationClicked' is not available in web environment`);
    }
  },
  notificationClose: (id) => {
    if (isElectron) {
      return window.electronBridge.notificationClose(id);
    } else {
      console.warn(`Electron API 'notificationClose' is not available in web environment`);
    }
  },
  mainLayoutReady: () => {
    if (isElectron) {
      return window.electronBridge.mainLayoutReady();
    } else {
      console.warn(`Electron API 'mainLayoutReady' is not available in web environment`);
      return;
    }
  },
  openLogFolder: async () => {
    if (isElectron) {
      return await window.electronBridge.openLogFolder();
    } else {
      console.warn(`Electron API 'openLogFolder' is not available in web environment`);
      return '';
    }
  },
  showToast: (args) => {
    if (isElectron) {
      window.electronBridge.showToast(args);
    } else {
      console.warn(`Electron API 'showToast' is not available in web environment`);
    }
  },
  downloadAndInstallUpdate: () => {
    if (isElectron) {
      window.electronBridge.downloadAndInstallUpdate();
    } else {
      console.warn(`Electron API 'downloadAndInstallUpdate' is not available in web environment`);
    }
  },
  checkForUpdate: () => {
    if (isElectron) {
      window.electronBridge.checkForUpdate();
    } else {
      console.warn(`Electron API 'checkForUpdate' is not available in web environment`);
    }
  },
  triggerCommand: (command) => {
    if (isElectron) {
      window.electronBridge.triggerCommand(command);
    } else {
      console.warn(`Electron API 'triggerCommand' is not available in web environment`);
    }
  },
  getAutoStartEnabled: () => {
    if (isElectron) {
      return window.electronBridge.getAutoStartEnabled();
    } else {
      console.warn(`Electron API 'getAutoStartEnabled' is not available in web environment`);
      return false;
    }
  },
  toggleAutoStart: () => {
    if (isElectron) {
      window.electronBridge.toggleAutoStart();
    } else {
      console.warn(`Electron API 'toggleAutoStart' is not available in web environment`);
    }
  },
  closeNativeNotification: async (id) => {
    if (isElectron) {
      return await window.electronBridge.removeNativeNotification(id);
    } else {
      console.warn(`Electron API 'closeNativeNotification' is not available in web environment`);
      return false;
    }
  },

  setBadgeCount: async (count) => {
    if (isElectron) {
      return await window.electronBridge.setBadgeCount(count);
    } else {
      console.warn(`Electron API 'setBadgeCount' is not available in web environment`);
      return false;
    }
  },

  incrementBadge: async (amount) => {
    if (isElectron) {
      return await window.electronBridge.incrementBadge(amount);
    } else {
      console.warn(`Electron API 'incrementBadge' is not available in web environment`);
      return 0;
    }
  },

  decrementBadge: async (amount) => {
    if (isElectron) {
      return await window.electronBridge.decrementBadge(amount);
    } else {
      console.warn(`Electron API 'decrementBadge' is not available in web environment`);
      return 0;
    }
  },

  getBadgeCount: async () => {
    if (isElectron) {
      return await window.electronBridge.getBadgeCount();
    } else {
      console.warn(`Electron API 'getBadgeCount' is not available in web environment`);
      return 0;
    }
  },

  clearBadge: async () => {
    if (isElectron) {
      return await window.electronBridge.clearBadge();
    } else {
      console.warn(`Electron API 'clearBadge' is not available in web environment`);
      return false;
    }
  },

  setSplitCategoryPreferences: async (uid, preferences) => {
    if (isElectron) {
      return await window.electronBridge.setSplitCategoryPreferences(uid, preferences);
    } else {
      console.warn(
        `Electron API 'setSplitCategoryPreferences' is not available in web environment`
      );
    }
  },

  getSplitCategoryPreferences: async (uid) => {
    if (isElectron) {
      return await window.electronBridge.getSplitCategoryPreferences(uid);
    } else {
      console.warn(
        `Electron API 'getSplitCategoryPreferences' is not available in web environment`
      );
    }
  },

  updateSplitCategoryPreference: async (uid, category, value) => {
    if (isElectron) {
      return await window.electronBridge.updateSplitCategoryPreference(uid, category, value);
    } else {
      console.warn(
        `Electron API 'updateSplitCategoryPreference' is not available in web environment`
      );
    }
  },

  getAllSplitCategoryPreferences: async () => {
    if (isElectron) {
      return await window.electronBridge.getAllSplitCategoryPreferences();
    } else {
      console.warn(
        `Electron API 'getAllSplitCategoryPreferences' is not available in web environment`
      );
      return {};
    }
  },

  unsubscribeFetch: async (url) => {
    if (isElectron) return window.electronBridge.unsubscribeFetch(url);
    return { ok: false, error: 'Not in Electron' };
  },

  setKnownAccountUids: async (uids) => {
    if (isElectron) return window.electronBridge.setKnownAccountUids(uids);
  }
};

export default electronApi;
