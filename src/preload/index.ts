import { isValidRendererChannel, ValidRendererChannel } from '@/main/validChannels';
import { BrowserWindowConstructorOptions, contextBridge, ipcRenderer } from 'electron';

import { ToastArgs } from '@/main/models/types/toastTypes';
import { INativeNotificationOptions } from '@/main/services/notification/INotificationOptions';
import { AudioType } from '@/renderer/app/lib/soundManager';
import { CommandType } from '@/renderer/app/types';
import { SplitCategoryPreferences } from '@/main/api/auth/types';
// Custom APIs for renderer
const api = {
  on: (channel: ValidRendererChannel, callback: (...args: any[]) => void) => {
    if (isValidRendererChannel(channel)) {
      const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
    return () => {}; // No-op function if the channel is not valid
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
  setIdToken: (token: string | null) => ipcRenderer.invoke('main:auth:set-id-token', token),
  getAuthState: () => ipcRenderer.invoke('main:auth:get-state'),
  signOutMain: () => ipcRenderer.invoke('main:auth:sign-out'),
  refreshToken: () => ipcRenderer.invoke('main:auth:refresh'),
  devSignIn: (args: { accessToken: string; refreshToken: string; expiresInSec?: number }) =>
    ipcRenderer.invoke('main:auth:dev-sign-in', args),
  createAccountLinkIntent: (args?: { provider?: string; client?: string }) =>
    ipcRenderer.invoke('main:auth:create-account-link-intent', args),
  devAddAccount: (args: { accessToken: string; refreshToken: string; expiresInSec?: number }) =>
    ipcRenderer.invoke('main:auth:dev-add-account', args),
  // ---------- P8 Later Queue ----------
  queueSnooze: (req: any) => ipcRenderer.invoke('main:queue:snooze', req),
  queueListSnoozed: (accountId: string) => ipcRenderer.invoke('main:queue:list-snoozed', accountId),
  queueUnsnooze: (snoozeId: string) => ipcRenderer.invoke('main:queue:unsnooze', snoozeId),
  queueRescheduleSnooze: (args: { snoozeId: string; snoozeUntil: string }) =>
    ipcRenderer.invoke('main:queue:reschedule-snooze', args),
  queueSchedule: (req: any) => ipcRenderer.invoke('main:queue:schedule', req),
  queueListScheduled: (accountId: string) =>
    ipcRenderer.invoke('main:queue:list-scheduled', accountId),
  queueCancelSchedule: (scheduleId: string) =>
    ipcRenderer.invoke('main:queue:cancel-schedule', scheduleId),
  queueRescheduleSend: (args: { scheduleId: string; sendAt: string }) =>
    ipcRenderer.invoke('main:queue:reschedule-send', args),
  queueSendNow: (scheduleId: string) => ipcRenderer.invoke('main:queue:send-now', scheduleId),
  setAlertSound: (audio: AudioType) => ipcRenderer.invoke('main:system:set-alert-sound', audio),
  setIsFullSizeWindowOnCreation: (value: boolean) =>
    ipcRenderer.invoke('main:system:set-window-fullsize-on-creation', value),
  setStrictPubSub: (value: boolean) => ipcRenderer.invoke('main:system:set-strict-pubsub', value),
  setOfflineStatus: (status: boolean) =>
    ipcRenderer.invoke('main:system:set-offline-status', status),
  setActiveUid: (uid: string | null) => ipcRenderer.invoke('main:auth:set-active-uid', uid),
  openNewWindow: (
    route: string,
    options?: Partial<BrowserWindowConstructorOptions>,
    uid?: string
  ) => ipcRenderer.invoke('main:window:open', route, options, uid),
  closeWindow: (id: string) => ipcRenderer.invoke('main:window:close', id),
  // Push delivery moved to a backend-owned WebSocket in Phase B
  // (see services/push/WebSocketPushClient.ts). Kept as no-ops so the
  // renderer-side API contract stays stable until call sites are pruned.
  startNotificationService: (_uid: string) => {
    /* push channel auto-starts on token-changed */
  },
  stopNotificationService: () => {
    /* push channel stops on sign-out */
  },
  getNotificationPreference: (uid: string) =>
    ipcRenderer.invoke('main:notification:preference:get', uid),
  setNotificationPreference: (uid: string, preference: string) =>
    ipcRenderer.invoke('main:notification:preference:set', uid, preference),
  getAllNotificationPreferences: () => ipcRenderer.invoke('main:notification:preferences:get:all'),
  closeNativeNotification: (id: string) =>
    ipcRenderer.invoke('main:notification:native:remove', id),

  showToast: (args: ToastArgs) => ipcRenderer.invoke('main:toast:show', args),
  changeAppearance: (appearance: 'light' | 'dark' | 'black' | 'pure-light' | 'system') =>
    ipcRenderer.invoke('main:system:theme-chanage', appearance),
  notificationClicked: (id: string, data?: any) =>
    ipcRenderer.send('main:notification:custom:clicked', id, data),
  notificationClose: (id: string) => ipcRenderer.send('main:notification:custom:close', id),

  triggerCommand: (command: CommandType) =>
    ipcRenderer.invoke('main:renderer:trigger-command', command),

  showNativeNotification: <T = any>(
    title: string,
    body?: string,
    options: Partial<INativeNotificationOptions<T>> = {}
  ) => {
    return ipcRenderer.invoke('main:notification:native:show', { title, body, ...options });
  },
  showCustomNotification: <T = any>(
    title: string,
    body?: string,
    options: Partial<INativeNotificationOptions<T>> = {}
  ) => {
    return ipcRenderer.invoke('main:notification:custom:show', { title, body, ...options });
  },

  // New notification management methods
  removeNotification: (id: string) => {
    return ipcRenderer.invoke('main:notification:custom:remove', id);
  },
  removeNativeNotification: (id: string) => {
    return ipcRenderer.invoke('main:notification:native:remove', id);
  },
  clearAllNotifications: () => {
    return ipcRenderer.invoke('main:notification:clear-all');
  },
  getNotification: (id: string) => {
    return ipcRenderer.invoke('main:notification:custom:get', id);
  },
  hasNotification: (id: string) => {
    return ipcRenderer.invoke('main:notification:exists', id);
  },

  mainLayoutReady: () => {
    return ipcRenderer.invoke('main:renderer:ready');
  },
  openLogFolder: () => {
    return ipcRenderer.invoke('main:system:open-log-folder');
  },
  downloadAndInstallUpdate: () => {
    return ipcRenderer.invoke('main:update:download-and-update');
  },
  checkForUpdate: () => {
    return ipcRenderer.invoke('main:update:check-update');
  },

  getAutoStartEnabled: () => ipcRenderer.invoke('main:system:get-auto-start-enabled'),
  toggleAutoStart: () => ipcRenderer.invoke('main:system:toggle-auto-start'),

  setBadgeCount: (count: number) => ipcRenderer.invoke('main:badge:set-count', count),
  incrementBadge: (amount?: number) => ipcRenderer.invoke('main:badge:increment', amount),
  decrementBadge: (amount?: number) => ipcRenderer.invoke('main:badge:decrement', amount),
  getBadgeCount: () => ipcRenderer.invoke('main:badge:get-count'),
  clearBadge: () => ipcRenderer.invoke('main:badge:clear'),

  unsubscribeFetch: (url: string) => ipcRenderer.invoke('main:unsubscribe:fetch', url),
  setKnownAccountUids: (uids: string[]) =>
    ipcRenderer.invoke('main:system:set-known-account-uids', uids),
  setSplitCategoryPreferences: (uid: string, preferences: SplitCategoryPreferences) =>
    ipcRenderer.invoke('main:system:set-split-category-preferences', uid, preferences),
  getSplitCategoryPreferences: (uid: string) =>
    ipcRenderer.invoke('main:system:get-split-category-preferences', uid),
  updateSplitCategoryPreference: (
    uid: string,
    category: keyof SplitCategoryPreferences,
    value: boolean
  ) => ipcRenderer.invoke('main:system:update-split-category-preference', uid, category, value),
  getAllSplitCategoryPreferences: () =>
    ipcRenderer.invoke('main:system:get-all-split-category-preferences')
};

// Expose the api to the renderer process
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronBridge', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electronBridge = api;
}
