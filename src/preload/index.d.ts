import { ToastArgs } from '@/main/models/types/toastTypes';
import {
  INativeNotificationOptions,
  ICustomNotificationOptions
} from '@/main/services/notification/INotificationOptions';
import { ValidRendererChannel } from '@/main/validChannels';
import { AudioType } from '@/renderer/app/lib/soundManager';
import { CommandType } from '@/renderer/app/types';
import { BrowserWindowConstructorOptions } from 'electron';

interface IpcRenderer {
  on: (channel: ValidRendererChannel, callback: (...args: any[]) => void) => () => void;
  off: (channel: ValidRendererChannel, callback: (...args: any[]) => void) => void;
  setIdToken: (token: string | null) => void;
  getAuthState: () => Promise<{
    accessToken: string;
    expiresAt: number;
    member: {
      uid: string;
      email: string;
      displayName?: string;
      photoURL?: string;
    } | null;
  } | null>;
  signOutMain: () => Promise<void>;
  refreshToken: () => Promise<
    { ok: true; accessToken: string; expiresAt: number } | { ok: false; error: string }
  >;
  devSignIn: (args: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  devAddAccount: (args: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  queueSnooze: (req: any) => Promise<any>;
  queueListSnoozed: (accountId: string) => Promise<any>;
  queueUnsnooze: (snoozeId: string) => Promise<any>;
  queueRescheduleSnooze: (args: { snoozeId: string; snoozeUntil: string }) => Promise<any>;
  queueSchedule: (req: any) => Promise<any>;
  queueListScheduled: (accountId: string) => Promise<any>;
  queueCancelSchedule: (scheduleId: string) => Promise<any>;
  queueRescheduleSend: (args: { scheduleId: string; sendAt: string }) => Promise<any>;
  queueSendNow: (scheduleId: string) => Promise<any>;
  setAlertSound: (audio: AudioType) => void;
  setIsFullSizeWindowOnCreation: (value: boolean) => void;
  setOfflineStatus: (status: boolean) => void;
  setStrictPubSub: (status: boolean) => void;
  setActiveUid: (uid: string | null) => void;
  openNewWindow: (
    route: string,
    options?: Partial<BrowserWindowConstructorOptions>,
    uid?: string
  ) => void;
  closeWindow: (id: string) => void;

  startNotificationService: (uid: string) => void;
  stopNotificationService: () => void;

  getNotificationPreference: (uid: string) => Promise<string>;
  setNotificationPreference: (uid: string, preference: string) => Promise<boolean>;
  getAllNotificationPreferences: () => Promise<Record<string, string>>;

  changeAppearance: (appearance: 'light' | 'dark' | 'black' | 'pure-light' | 'system') => void;

  triggerCommand: (command: CommandType) => void;

  showNativeNotification: <T = any>(
    title: string,
    body?: string,
    options: Partial<INativeNotificationOptions<T>> = {}
  ) => Promise<string>;
  showCustomNotification: <T = any>(
    title: string,
    body?: string,
    options: Partial<ICustomNotificationOptions> = {}
  ) => Promise<string>;
  notificationClicked: (id: string, data?: any) => void;
  notificationClose: (id: string) => void;

  // New notification management methods
  removeNotification: (id: string) => Promise<boolean>;
  removeNativeNotification: (id: string) => Promise<boolean>;
  clearAllNotifications: () => Promise<boolean>;
  getNotification: (id: string) => Promise<{ exists: boolean; id?: string }>;
  hasNotification: (id: string) => Promise<boolean>;
  closeNativeNotification: (id: string) => void;

  mainLayoutReady: () => Promise<void>;
  showToast: (args: ToastArgs) => Promise<void>;
  openLogFolder: () => Promise<string>;
  downloadAndInstallUpdate: () => Promise<string>;
  checkForUpdate: () => Promise<string>;

  getAutoStartEnabled: () => boolean;
  toggleAutoStart: () => void;

  // Badge count management methods
  /**
   * Set the application badge count to a specific number
   * @param {number} count - The count to display on the app badge
   * @returns {Promise<boolean>} Whether the operation was successful
   */
  setBadgeCount: (count: number) => Promise<boolean>;

  /**
   * Increment the current badge count by a specified amount
   * @param {number} [amount=1] - Amount to increment by (defaults to 1)
   * @returns {Promise<number>} The new badge count after incrementing
   */
  incrementBadge: (amount?: number) => Promise<number>;

  /**
   * Decrement the current badge count by a specified amount
   * @param {number} [amount=1] - Amount to decrement by (defaults to 1)
   * @returns {Promise<number>} The new badge count after decrementing
   */
  decrementBadge: (amount?: number) => Promise<number>;

  /**
   * Get the current app badge count
   * @returns {Promise<number>} The current badge count
   */
  getBadgeCount: () => Promise<number>;

  /**
   * Clear the badge count (set to 0)
   * @returns {Promise<boolean>} Whether the operation was successful
   */
  clearBadge: () => Promise<boolean>;

  unsubscribeFetch: (url: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
  setKnownAccountUids: (uids: string[]) => Promise<void>;
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
}

declare global {
  interface Window {
    electronBridge: IpcRenderer;
  }
}
