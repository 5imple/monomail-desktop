/* eslint-disable @typescript-eslint/no-explicit-any */

import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { darkBackgroundColor, lightBackgroundColor } from '@/main/utils/contants';
import { CommandType } from '@/renderer/app/types';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log';
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  dialog,
  globalShortcut,
  nativeTheme,
  screen,
  shell
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface IAppWindowOptions {
  route?: string;
  options?: Partial<BrowserWindowConstructorOptions>;
  commands?: Array<CommandType>;
  messages?: Array<{ channel: string; args: any[] }>;
  isOffline?: boolean;
  fullSizeOnCreation?: boolean;
}

// Function to smoothly resize a window to a target size
function smoothResizeToTarget(
  window: BrowserWindow,
  targetBounds: Electron.Rectangle,
  step = 10,
  interval = 16
) {
  const currentBounds = window.getBounds();

  const dx = (targetBounds.width - currentBounds.width) / step;
  const dy = (targetBounds.height - currentBounds.height) / step;
  const dxPos = (targetBounds.x - currentBounds.x) / step;
  const dyPos = (targetBounds.y - currentBounds.y) / step;

  let currentStep = 0;

  const intervalId = setInterval(() => {
    currentStep += 1;

    if (currentStep > step) {
      clearInterval(intervalId);
      window.setBounds(targetBounds); // Ensure it snaps to the final size
      return;
    }

    window.setBounds({
      width: Math.round(currentBounds.width + dx * currentStep),
      height: Math.round(currentBounds.height + dy * currentStep),
      x: Math.round(currentBounds.x + dxPos * currentStep),
      y: Math.round(currentBounds.y + dyPos * currentStep)
    });
  }, interval);
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function toOrigin(value: string | undefined): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  try {
    const url = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getTrustedRendererOrigins(): Set<string> {
  const origins = new Set<string>();

  if (is.dev) {
    const devRendererOrigin = toOrigin(process.env['ELECTRON_RENDERER_URL']);
    if (devRendererOrigin) origins.add(devRendererOrigin);
  }

  const authOrigin = toOrigin(import.meta.env.MONO_ENV_FIREBASE_AUTH_DOMAIN);
  if (authOrigin) origins.add(authOrigin);

  return origins;
}

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.href === 'about:blank') return true;
    if (parsed.protocol === 'monomail-app:' && parsed.hostname === 'app') return true;
    return getTrustedRendererOrigins().has(parsed.origin);
  } catch {
    return false;
  }
}

function openExternalIfAllowed(rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      log.warn(
        `Blocked external navigation with disallowed protocol: ${parsed.protocol} (url=${parsed.host || '<no-host>'})`
      );
      return;
    }
    shell.openExternal(parsed.toString());
  } catch {
    log.warn('Blocked external navigation with un-parseable URL');
  }
}

class AppWindow extends BrowserWindow {
  private commands: Array<CommandType> = [];
  private messages: Array<{ channel: string; args: any[] }> = [];
  private route: string;
  private isOffline: boolean;
  private isFirstShow: boolean = true;
  private fullSizeOnCreation: boolean;
  private saveBoundsTimeout: NodeJS.Timeout | null = null;
  private rendererReady: boolean = false;

  constructor({
    route = '/',
    commands = [],
    messages = [],
    options,
    isOffline = false,
    fullSizeOnCreation = false
  }: IAppWindowOptions) {
    // Get saved window bounds from SystemManager
    const savedBounds = systemManager.getWindowBounds();

    // Validate saved bounds to ensure they're reasonable
    const defaultWidth = 1400;
    const defaultHeight = 900;
    const minWidth = 680;
    const minHeight = 580;

    let windowWidth = defaultWidth;
    let windowHeight = defaultHeight;
    let windowX: number | undefined;
    let windowY: number | undefined;

    if (savedBounds) {
      // Ensure width and height are within reasonable bounds
      windowWidth = Math.max(savedBounds.width, minWidth);
      windowHeight = Math.max(savedBounds.height, minHeight);

      // Only set position if both x and y are defined and reasonable
      if (savedBounds.x !== undefined && savedBounds.y !== undefined) {
        const displayBounds = screen.getPrimaryDisplay().bounds;
        // Ensure window is at least partially visible on screen
        if (
          savedBounds.x >= -windowWidth + 100 &&
          savedBounds.x < displayBounds.width - 100 &&
          savedBounds.y >= -windowHeight + 100 &&
          savedBounds.y < displayBounds.height - 100
        ) {
          windowX = savedBounds.x;
          windowY = savedBounds.y;
        }
      }
    }

    const windowOptions: BrowserWindowConstructorOptions = {
      width: windowWidth,
      height: windowHeight,
      x: windowX,
      y: windowY,
      minWidth,
      minHeight,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false
      },
      // backgroundColor: nativeTheme.shouldUseDarkColors ? darkBackgroundColor : lightBackgroundColor,
      vibrancy: 'fullscreen-ui',
      visualEffectState: 'followWindow',
      trafficLightPosition: { x: 12, y: 16 },
      ...options
    };

    super(windowOptions);

    this.route = route;
    this.isOffline = isOffline;
    this.fullSizeOnCreation = fullSizeOnCreation;

    this.on('ready-to-show', () => {
      this.show();
      if (app.dock) app.dock.show();
    });

    // Diagnostic taps for renderer/process failures. These are quiet during
    // normal operation but make blank-screen / silent-crash regressions
    // immediately visible in main.log instead of needing a devtools probe.
    this.webContents.on('render-process-gone', (_event, details) => {
      log.error(
        `[AppWindow] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
      );
    });
    this.webContents.on('preload-error', (_e, preloadPath, err) => {
      log.error(`[AppWindow] preload-error path=${preloadPath} err=${err.message}`);
    });
    this.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        this.rendererReady = false;
      }
    });

    this.on('show', () => {
      // Only apply full size animation when showing for the first time
      if (this.isFirstShow && this.fullSizeOnCreation) {
        this.maximizeWithAnimation();
        this.isFirstShow = false;
      }
    });

    this.installNavigationGuards();

    // Try loading from remote first, with fallback to local
    this.loadContent();

    // Register global shortcuts for Cmd+W (hide) and Cmd+Q (quit)
    this.on('focus', () => {
      this.webContents.send('renderer:native:focus');
      globalShortcut.register('CommandOrControl+W', () => {
        const mainWindow = windowManager.getMainAppWindow();
        if (mainWindow && this.id === mainWindow.id) {
          this.hide(); // Hide the window on Cmd+W
        } else {
          this.close(); // Close other windows
        }
      });
      globalShortcut.register('CommandOrControl+Q', () => {
        systemManager.setMainLayoutReady(false);
        windowManager.closeAll();
      });
    });

    this.on('blur', () => {
      this.webContents.send('renderer:native:blur');
      globalShortcut.unregister('CommandOrControl+W');
      globalShortcut.unregister('CommandOrControl+Q');
    });

    this.on('closed', () => {
      globalShortcut.unregister('CommandOrControl+W');
      globalShortcut.unregister('CommandOrControl+Q');
    });

    // Save window bounds when resized or moved (throttled to avoid excessive writes)
    this.on('resize', () => {
      this.throttleSaveBounds();
    });

    this.on('move', () => {
      this.throttleSaveBounds();
    });

    this.on('close', (event) => {
      const mainWindow = windowManager.getMainAppWindow();
      if (mainWindow && this.id === mainWindow.id) {
        if (!systemManager.getIsQuitting()) {
          event.preventDefault(); // Prevent the window from closing
          this.hide(); // Hide the window instead
        } else {
          windowManager.closeAppWindow(this.id);
        }
      } else {
        windowManager.closeAppWindow(this.id);
      }
    });

    this.commands.push(...commands);
    this.messages.push(...messages);
    this.webContents.setBackgroundThrottling(false);

    this.webContents.setWindowOpenHandler(({ url }) => {
      // Restrict shell.openExternal to safe URL schemes. Without this guard,
      // a sender-controlled anchor (every email anchor gets target="_blank"
      // via setAnchorAttributes) can hand a URL like `file:///Applications/
      // Calculator.app`, `smb://attacker/payload.exe`, or `vbscript:` to the
      // OS — that's a 1-click RCE from a crafted email message.
      openExternalIfAllowed(url);

      return { action: 'deny' };
    });
  }

  private installNavigationGuards(): void {
    const guardTopLevelNavigation = (
      event: Electron.Event,
      url: string,
      isMainFrame: boolean = true
    ) => {
      if (!isMainFrame || isTrustedRendererUrl(url)) return;

      event.preventDefault();
      log.warn('[AppWindow] Blocked top-level navigation outside trusted renderer origins');
      openExternalIfAllowed(url);
    };

    this.webContents.on('will-navigate', (event, url) => {
      guardTopLevelNavigation(event, url);
    });

    this.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
      guardTopLevelNavigation(event, url, isMainFrame);
    });
  }

  // Method to maximize the window with a smooth animation
  private maximizeWithAnimation(): void {
    // Get the screen size for the display containing the window
    const { bounds } = screen.getDisplayMatching(this.getBounds());

    // Create target bounds for full-screen size (keeping some margin if needed)
    const targetBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };

    // Apply smooth resize animation
    smoothResizeToTarget(this, targetBounds);
  }

  // Main method to handle content loading with fallback
  private loadContent(): void {
    // Always try to load from remote first (unless explicitly offline mode)
    if (!this.isOffline) {
      this.loadRemoteURL(this.route);

      // Set up error handler for failed remote loading. Only retry once —
      // otherwise loadLocalContent's index_offline.html autoreloads to
      // appUrl which fails again and we infinite-loop into a blank screen.
      // Also: only fire on TOP-frame failures (validatedURL = the URL we
      // tried to load), not on subresource failures.
      let alreadyFellBack = false;
      this.webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          if (!isMainFrame || alreadyFellBack) return;
          alreadyFellBack = true;
          log.error(
            `Failed to load (${errorCode}) ${validatedURL}: ${errorDescription}. ` +
              `Falling back to bundled local renderer.`
          );
          this.loadLocalRenderer();
        }
      );
    } else {
      this.loadLocalRenderer();
    }
  }

  /**
   * Load the bundled React renderer from disk (no Firebase Hosting fetch).
   * This is used both as the success path for standalone builds with no
   * real auth domain configured, AND as the fallback when the remote
   * load fails.
   */
  private loadLocalRenderer(route: string = '/'): void {
    // Load through our custom `monomail-app://` scheme rather than file://.
    // file:// loading breaks because the bundled `index.html` has
    // `<base href="/">` which resolves relative URLs to filesystem root.
    // Routing through a custom-protocol origin gives us a stable base for
    // `./assets/...` lookups and avoids file:// CORS quirks for ES-module
    // scripts with `crossorigin`/`integrity` attributes.
    const cleanRoute = route.startsWith('/') ? route : '/' + route;
    const target = `monomail-app://app${cleanRoute}`;
    log.info(`[AppWindow] Loading local renderer from ${target}`);
    this.loadURL(target);
  }

  // Helper method to load remote URL based on environment
  private loadRemoteURL(route: string): void {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.loadURL(process.env['ELECTRON_RENDERER_URL'] + route);
      return;
    }

    // Standalone-build path. The original architecture loads the renderer
    // from `https://${MONO_ENV_FIREBASE_AUTH_DOMAIN}` (Firebase Hosting),
    // which requires a deployed web frontend. When that env var is unset
    // or points at an unreachable host, the load fails → did-fail-load
    // falls back to index_offline.html → auto-reload loops → blank
    // screen. For a self-contained .app the bundled `index.html` already
    // contains everything the renderer needs, so prefer the local bundle
    // whenever the auth domain isn't a real reachable host.
    const authDomain = import.meta.env.MONO_ENV_FIREBASE_AUTH_DOMAIN;
    const isRealAuthDomain =
      typeof authDomain === 'string' &&
      authDomain.length > 0 &&
      authDomain !== 'localhost' &&
      !authDomain.startsWith('stub') &&
      authDomain.includes('.');

    if (isRealAuthDomain) {
      log.info(`[AppWindow] Loading remote URL https://${authDomain}${route}`);
      this.loadURL(`https://${authDomain}${route}`);
    } else {
      log.info(
        `[AppWindow] No real auth domain ("${authDomain}") — loading bundled renderer locally`
      );
      this.loadLocalRenderer(route);
    }
  }

  // Helper method to load content from local filesystem
  private loadLocalContent(route: string = '/'): void {
    const localPath = path.join(__dirname, '../renderer', 'index_offline.html');

    // Use Electron's loadFile method with proper options for query parameters
    this.loadFile(localPath, {
      query: {
        appUrl: `https://${import.meta.env.MONO_ENV_FIREBASE_AUTH_DOMAIN}${route}`
      }
    });
  }

  private throttleSaveBounds() {
    if (!this.isDestroyed()) {
      // Clear existing timeout
      if (this.saveBoundsTimeout) {
        clearTimeout(this.saveBoundsTimeout);
      }

      // Set new timeout to save bounds after 500ms of inactivity
      this.saveBoundsTimeout = setTimeout(() => {
        if (!this.isDestroyed()) {
          const bounds = this.getBounds();
          systemManager.saveWindowBounds(bounds);
        }
        this.saveBoundsTimeout = null;
      }, 500);
    }
  }

  public dispose() {
    // Clear any pending save timeout
    if (this.saveBoundsTimeout) {
      clearTimeout(this.saveBoundsTimeout);
      this.saveBoundsTimeout = null;
    }
    this.destroy();
  }

  public markRendererReady() {
    this.rendererReady = true;
    this.triggerCommandQueue();
    this.triggerMessageQueue();
  }

  private sendCommand(command: CommandType) {
    this.webContents.send('renderer:command:trigger', command);
  }

  private sendMessage(message: { channel: string; args: any[] }) {
    this.webContents.send(message.channel, ...message.args);
  }

  public triggerCommand(command: CommandType) {
    this.show();
    if (!this.rendererReady || this.webContents.isLoadingMainFrame()) {
      this.commands.push(command);
      return;
    }
    this.sendCommand(command);
  }

  public triggerMessage(message: { channel: string; args: any[] }) {
    this.show();
    if (!this.rendererReady || this.webContents.isLoadingMainFrame()) {
      this.messages.push(message);
      return;
    }
    this.sendMessage(message);
  }

  public triggerCommandQueue() {
    if (!this.rendererReady) return;
    this.show();
    const commands = this.commands.splice(0);
    for (const command of commands) {
      this.sendCommand(command);
    }
  }
  public triggerMessageQueue() {
    if (!this.rendererReady) return;
    this.show();
    const messages = this.messages.splice(0);
    for (const message of messages) {
      this.sendMessage(message);
    }
  }
}

export default AppWindow;
