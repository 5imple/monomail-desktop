import { SplitCategoryPreferences } from '@/main/api/auth/types';
import { ToastArgs } from '@/main/models/types/toastTypes';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { updateManager } from '@/main/services/mangers/update/UpdateManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { openLogFolder } from '@/main/utils/helpers';
import { AudioType } from '@/renderer/app/lib/soundManager';
import { CommandType } from '@/renderer/app/types';
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  ipcMain,
  nativeTheme
} from 'electron';

export function registerSystemHandlers() {
  ipcMain.handle('main:system:set-offline-status', (_, status: boolean) => {
    if (status) {
      systemManager.updateTrayIcon(true);
    } else {
      systemManager.updateTrayIcon(false);
    }
  });

  ipcMain.handle('main:system:set-alert-sound', (_, audio: AudioType) => {
    systemManager.setAlertSound(audio);
  });

  ipcMain.handle('main:system:set-strict-pubsub', (_, value: boolean) => {
    systemManager.setStrictPubSub(value);
  });

  ipcMain.handle('main:system:set-window-fullsize-on-creation', (_, value: boolean) => {
    systemManager.setIsFullSizeWindowOnCreation(value);
  });

  ipcMain.handle('main:system:theme-toggle', () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = 'light';
    } else {
      nativeTheme.themeSource = 'dark';
    }
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle(
    'main:system:theme-chanage',
    (_, appearance: 'system' | 'light' | 'dark' | 'black' | 'pure-light') => {
      // Map custom themes to system themes for electron's nativeTheme
      if (appearance === 'black') {
        nativeTheme.themeSource = 'dark';
      } else if (appearance === 'pure-light') {
        nativeTheme.themeSource = 'light';
      } else {
        nativeTheme.themeSource = appearance;
      }
    }
  );

  ipcMain.handle(
    'main:window:open',
    (_, route: string = '/', options?: Partial<BrowserWindowConstructorOptions>) => {
      windowManager.createAppWindow({ route, options });
    }
  );
  ipcMain.handle('main:window:close', (_, uid: number) => {
    windowManager.closeAppWindow(uid);
  });
  ipcMain.handle('main:renderer:trigger-command', (_, command: CommandType) => {
    const mainWindow = windowManager.getMainAppWindow();
    if (mainWindow) {
      mainWindow.triggerCommand(command);
    }
  });

  ipcMain.handle('main:renderer:ready', () => {
    systemManager.setMainLayoutReady(true);
    const mainWindow = windowManager.getMainAppWindow();
    // Execute any queued commands
    if (mainWindow) {
      mainWindow.triggerCommandQueue();
      mainWindow.triggerMessageQueue();
    }
  });

  ipcMain.handle('main:renderer:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('main:toast:show', (event, args: ToastArgs) => {
    const sendToRenderer = (window: BrowserWindow, channel: string, data: any) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    };
    const mainWindow = windowManager.getMainAppWindow();
    if (mainWindow) {
      sendToRenderer(mainWindow, 'renderer:toast:show', args);
    }
  });

  ipcMain.handle('main:system:open-log-folder', () => {
    openLogFolder();
  });

  ipcMain.handle('main:update:download-and-update', async () => {
    windowManager.closeAll();
    windowManager.createUpdateWindow();
    updateManager.downloadUpdate();
    //
  });
  ipcMain.handle('main:update:check-update', async () => {
    updateManager.checkForUpdates();
    //
  });

  ipcMain.handle('main:system:toggle-auto-start', () => {
    return systemManager.toggleAutoStart();
  });

  ipcMain.handle('main:system:get-auto-start-enabled', () => {
    return systemManager.getUserAutoStartPreference();
  });

  // BADGE

  // Set a specific badge count
  ipcMain.handle('main:badge:set-count', (_, count: number) => {
    if (typeof count !== 'number' || count < 0) {
      return false;
    }

    try {
      app.setBadgeCount(count);
      return true;
    } catch (error) {
      console.error('Failed to set badge count:', error);
      return false;
    }
  });

  // Increment the badge count by a specified amount (default: 1)
  ipcMain.handle('main:badge:increment', (_, amount: number = 1) => {
    if (typeof amount !== 'number') {
      return false;
    }

    try {
      const currentCount = app.getBadgeCount();
      app.setBadgeCount(currentCount + amount);
      return app.getBadgeCount();
    } catch (error) {
      console.error('Failed to increment badge count:', error);
      return false;
    }
  });

  // Decrement the badge count by a specified amount (default: 1)
  ipcMain.handle('main:badge:decrement', (_, amount: number = 1) => {
    if (typeof amount !== 'number') {
      return false;
    }

    try {
      const currentCount = app.getBadgeCount();
      const newCount = Math.max(0, currentCount - amount); // Prevent negative counts
      app.setBadgeCount(newCount);
      return app.getBadgeCount();
    } catch (error) {
      console.error('Failed to decrement badge count:', error);
      return false;
    }
  });

  // Get the current badge count
  ipcMain.handle('main:badge:get-count', () => {
    try {
      return app.getBadgeCount();
    } catch (error) {
      console.error('Failed to get badge count:', error);
      return 0;
    }
  });

  // Clear the badge (set to 0)
  ipcMain.handle('main:badge:clear', () => {
    try {
      app.setBadgeCount(0);
      return true;
    } catch (error) {
      console.error('Failed to clear badge count:', error);
      return false;
    }
  });

  ipcMain.handle(
    'main:system:set-split-category-preferences',
    (_, uid: string, preferences: SplitCategoryPreferences) => {
      systemManager.setSplitCategoryPreferences(uid, preferences);
    }
  );

  ipcMain.handle('main:system:get-split-category-preferences', (_, uid: string) => {
    return systemManager.getSplitCategoryPreferences(uid);
  });

  ipcMain.handle(
    'main:system:update-split-category-preference',
    (_, uid: string, category: keyof SplitCategoryPreferences, value: boolean) => {
      systemManager.updateSplitCategoryPreference(uid, category, value);
    }
  );

  ipcMain.handle('main:system:get-all-split-category-preferences', () => {
    return systemManager.getAllSplitCategoryPreferences();
  });
}
