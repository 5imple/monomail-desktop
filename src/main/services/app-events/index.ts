import mailApi from '@/main/api/mail/mailApi';
import { setup as setupPushReceiver } from '@/main/api/message/electron-message-receiver';
import { registerIpcHandlers } from '@/main/services/ipc-handlers';
import { authManager } from '@/main/services/mangers/auth/AuthManager';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { updateManager } from '@/main/services/mangers/update/UpdateManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { protocols } from '@/main/utils/contants';
import { app, BrowserWindow, powerSaveBlocker, session } from 'electron';
import log from 'electron-log';
import path from 'path';

export function registerAppEventHandlers() {
  app.whenReady().then(() => {
    protocols.forEach((protocol) => {
      if (process.defaultApp) {
        if (process.argv.length >= 2) {
          app.setAsDefaultProtocolClient(protocol, process.execPath, [
            path.resolve(process.argv[1])
          ]);
        }
      } else {
        app.setAsDefaultProtocolClient(protocol);
      }
    });
  });
  app.on('ready', () => {
    registerIpcHandlers();
    // windowManager.createAppWindow();

    systemManager.initializeAutoStartSettings();

    updateManager.checkForUpdates();
    setupPushReceiver();
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      if (details.url.includes('lh3.googleusercontent.com')) {
        delete details.requestHeaders['Referer'];
        delete details.requestHeaders['Origin'];
      }
      callback({ requestHeaders: { ...details.requestHeaders } });
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp =
        "default-src 'self' *; script-src 'self' https://www.googletagmanager.com http://unpkg.com/react-scan/dist/auto.global.js 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src * data: blob: *;connect-src 'self' blob: *;object-src 'self' blob:;worker-src 'self' blob:;child-src 'self' blob:;frame-src 'self';";

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Headers': ['*'],
          'Content-Security-Policy': [csp],
          'X-Frame-Options': ['DENY']
        }
      });
    });
  });

  app.on('activate', () => {
    if (systemManager.getIsQuitting()) systemManager.setIsQuitting(false);
    if (updateManager.getUpdateAvailable()) {
      const updateWindow = windowManager.getUpdateWindow();
      if (updateWindow) {
        updateWindow.focus();
      } else {
        windowManager.createUpdateWindow();
      }
    } else {
      const mainWindow = windowManager.getMainAppWindow();
      if (!mainWindow) windowManager.createAppWindow();
      else {
        mainWindow.show();
      }
    }
  });

  app.on('window-all-closed', () => {
    if (systemManager.getTray()) {
      if (app.dock) app.dock.hide();
    }
    if (process.platform !== 'darwin' && !systemManager.getTray()) {
      app.quit();
    }
  });

  app.on('will-quit', (_) => {
    log.info('=== QUIT ===');
    const blockerId = systemManager.getBlockerId();
    if (blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      log.info('Power save blocker stopped on quit');
    }

    //
  });

  app.on('before-quit', async (event) => {
    if (systemManager.getIsQuitting()) {
      return;
    }
    systemManager.setIsQuitting(true);
    event.preventDefault();

    try {
      if (authManager.getIdToken() && systemManager.getStrictPubSub()) {
        await mailApi.stopAllCloudPubSub();
      }

      const cancellationToken = updateManager.getCancellationToken();
      if (cancellationToken) {
        cancellationToken.cancel();
      }
    } catch (error) {
      log.error('Error during cleanup:', error);
    } finally {
      app.quit(); // Call app.quit() after cleanup
    }
  });

  app.on('open-url', async (event, url) => {
    event.preventDefault();
    const mainWindow = windowManager.getMainAppWindow();
    handleDeepLinkingUrl(url, mainWindow);
  });
}

async function handleDeepLinkingUrl(url: string, mainWindow: BrowserWindow | null) {
  log.info('Handling deep link:', url);

  // Restore and focus the window
  if (mainWindow && mainWindow.isMinimized()) mainWindow.restore();
  if (mainWindow) mainWindow.focus();

  try {
    const isMailTo = url.startsWith('mailto:');

    if (isMailTo) {
      // Handle mailto: links
      const mailtoUrl = new URL(url);
      const email = decodeURIComponent(mailtoUrl.pathname); // Extract the email address
      const queryParams = new URLSearchParams(mailtoUrl.search);
      const paramsObject: Record<string, string> = {};

      queryParams.forEach((value, key) => {
        paramsObject[key] = value;
      });

      log.info('Handling mailto link:', email, paramsObject);

      if (!mainWindow) {
        windowManager.createAppWindow({
          messages: [
            {
              channel: 'renderer:mailto:compose',
              args: [
                {
                  email,
                  params: paramsObject
                }
              ]
            }
          ]
        });
      } else {
        mainWindow.webContents.send('renderer:mailto:compose', {
          email,
          params: paramsObject
        });
      }

      return; // ✅ Exit early to prevent further processing
    }

    // ✅ Handle mono-desktop:// deep links separately
    if (url.startsWith(`${import.meta.env.MONO_ENV_PROTOCOL}://`)) {
      const urlObj = new URL(url);
      const queryParams = new URLSearchParams(urlObj.search);
      const paramsObject: Record<string, string> = {};

      queryParams.forEach((value, key) => {
        paramsObject[key] = value;
      });

      const type = paramsObject['type'];
      log.info('Handling mono-desktop deep link:', type, paramsObject);

      if (!mainWindow) {
        return;
      }
      if (type) {
        switch (type) {
          case 'signIn':
            mainWindow.webContents.send('renderer:auth:sign-in', paramsObject['token']);
            return;
          case 'addAccount':
            mainWindow.webContents.send('renderer:auth:add-account', paramsObject['token']);
            return;
          case 'billingUpdated':
            mainWindow.webContents.send('renderer:auth:billing-updated', paramsObject);
            return;
          case 'scopeUpdated':
            mainWindow.webContents.send('renderer:auth:scope-updated', paramsObject);
            return;
        }
      }
      mainWindow.webContents.send('renderer:system:deeplink-query', paramsObject);
    }
  } catch (error) {
    log.error('Error handling deep link:', error);
  }
}
