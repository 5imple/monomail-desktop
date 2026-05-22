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
import { net } from 'electron';

const ALLOWED_UNSUBSCRIBE_SCHEMES = new Set(['https:', 'http:']);

function isSafeUnsubscribeUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 2048) return false;
  try {
    const u = new URL(raw);
    return ALLOWED_UNSUBSCRIBE_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Whitelisted subset of BrowserWindowConstructorOptions that the renderer
 * is allowed to influence. Anything that affects security boundaries
 * (`webPreferences`, `preload`, `nodeIntegration`, `webSecurity`, etc.)
 * is intentionally absent — those must only be set by main.
 */
type SafeWindowOptions = Pick<
  BrowserWindowConstructorOptions,
  'width' | 'height' | 'minWidth' | 'minHeight' | 'x' | 'y' | 'show' | 'title' | 'parent'
>;

function pickSafeWindowOptions(input: unknown): SafeWindowOptions | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const src = input as Record<string, unknown>;
  const out: SafeWindowOptions = {};
  if (typeof src.width === 'number' && src.width > 0 && src.width < 8192) out.width = src.width;
  if (typeof src.height === 'number' && src.height > 0 && src.height < 8192)
    out.height = src.height;
  if (typeof src.minWidth === 'number') out.minWidth = src.minWidth;
  if (typeof src.minHeight === 'number') out.minHeight = src.minHeight;
  if (typeof src.x === 'number') out.x = src.x;
  if (typeof src.y === 'number') out.y = src.y;
  if (typeof src.show === 'boolean') out.show = src.show;
  if (typeof src.title === 'string' && src.title.length < 256) out.title = src.title;
  return out;
}

function isSafeRoute(route: unknown): route is string {
  if (typeof route !== 'string') return false;
  if (route.length > 2048) return false;
  // Must be an in-app path. Reject schemes (`http:`, `file:`, `javascript:`,
  // protocol-relative `//evil`, and `..` traversal).
  if (/^\s*[a-zA-Z][a-zA-Z0-9+.-]*:/.test(route)) return false;
  if (route.startsWith('//')) return false;
  if (route.includes('..')) return false;
  // Allow only `/foo/bar?x=y#frag` shape.
  return /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]*$/.test(route);
}

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

  ipcMain.handle('main:window:open', (_, rawRoute: unknown = '/', rawOptions?: unknown) => {
    // Validate the route is an in-app path. A renderer compromise could
    // otherwise pass `route = 'https://attacker.com'` and have main load
    // an arbitrary remote page with elevated privileges.
    const route = isSafeRoute(rawRoute) ? rawRoute : '/';
    // Strip everything except a known-safe subset of options. The
    // previous spread allowed the renderer to override `webPreferences`,
    // `preload`, etc.
    const options = pickSafeWindowOptions(rawOptions);
    windowManager.createAppWindow({ route, options });
  });
  ipcMain.handle('main:window:close', (_, uid: number) => {
    windowManager.closeAppWindow(uid);
  });
  ipcMain.handle('main:renderer:trigger-command', (_, command: CommandType) => {
    const mainWindow = windowManager.getMainAppWindow();
    if (mainWindow) {
      mainWindow.triggerCommand(command);
    }
  });

  ipcMain.handle('main:renderer:ready', (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const appWindow = senderWindow ? windowManager.getAppWindow(senderWindow.id) : null;
    if (appWindow) {
      appWindow.markRendererReady();
    }

    const mainWindow = windowManager.getMainAppWindow();
    if (senderWindow && mainWindow && senderWindow.id === mainWindow.id) {
      systemManager.setMainLayoutReady(true);
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
    if (typeof count !== 'number' || count < 0 || !Number.isFinite(count)) {
      return false;
    }

    // Cap at a sane upper bound — without this, a renderer can pass 1e9
    // and the macOS dock will dutifully render "1000000000".
    const safeCount = Math.min(Math.floor(count), 9999);

    try {
      app.setBadgeCount(safeCount);
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

  ipcMain.handle('main:system:set-known-account-uids', (_event, uids: unknown) => {
    if (Array.isArray(uids) && uids.every((u) => typeof u === 'string')) {
      systemManager.setKnownAccountUids(uids);
    }
  });

  ipcMain.handle('main:unsubscribe:fetch', async (_event, url: unknown) => {
    if (!isSafeUnsubscribeUrl(url)) {
      return { ok: false, error: 'Invalid or disallowed URL' };
    }
    try {
      const res = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}
