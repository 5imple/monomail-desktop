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
      // Tightened CSP:
      //   - dropped `default-src *` and `connect-src *` (every directive
      //     fell back to wildcard — the original CSP was effectively off).
      //   - dropped `http://unpkg.com/react-scan/dist/auto.global.js` — a
      //     plaintext-HTTP script source lets a Wi-Fi attacker inject JS
      //     into the renderer.
      //   - kept `'unsafe-inline'` for script and style (removing it
      //     breaks Tiptap + Firebase Auth inline scripts; revisit with a
      //     nonce-based scheme as a follow-up).
      //   - kept `img-src *` because email images come from arbitrary
      //     hosts; the proxy-image strategy is a future hardening step.
      const authDomain = import.meta.env.MONO_ENV_FIREBASE_AUTH_DOMAIN;
      const homepage = import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN;
      const apiOrigin = import.meta.env.MONO_ENV_API_URL;
      const connectAllow = [
        "'self'",
        'blob:',
        'data:',
        authDomain ? `https://${authDomain}` : '',
        homepage ? `https://${homepage}` : '',
        apiOrigin || '',
        'https://*.googleapis.com',
        'https://*.firebaseio.com',
        'https://*.firebasedatabase.app',
        'https://*.cloudfunctions.net',
        'https://storage.googleapis.com',
        'https://fcm.googleapis.com',
        'https://*.amplitude.com',
        'https://api.mixpanel.com',
        'https://*.paddle.com',
        'wss://*.firebaseio.com',
        'wss://*.googleapis.com'
      ]
        .filter(Boolean)
        .join(' ');

      const csp = [
        "default-src 'self'",
        "script-src 'self' https://www.googletagmanager.com https://*.amplitude.com 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        // email images are sender-controlled hosts — keep open but stripped
        // schemes (no `*` for protocol).
        'img-src https: http: data: blob:',
        'media-src https: blob:',
        `connect-src ${connectAllow}`,
        "object-src 'self' blob:",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "frame-src 'self' https://*.paddle.com",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ');

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

/* ---------- Deep-link helpers ---------- */

// Keys that should never appear in plaintext log files. Whenever we log a
// params object from a deep-link, we run it through this redactor first.
const SENSITIVE_DEEPLINK_KEYS = new Set([
  'token',
  'idtoken',
  'id_token',
  'access_token',
  'refresh_token',
  'access-token',
  'code',
  'state',
  'session',
  'sessionid',
  'auth'
]);

function redactParams(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SENSITIVE_DEEPLINK_KEYS.has(k.toLowerCase())) {
      out[k] = v ? `<redacted len=${v.length}>` : '';
    } else {
      out[k] = v;
    }
  }
  return out;
}

// A deep-link token must at minimum look like a JWT (three dot-separated
// base64url segments). We don't verify the signature here — that's the
// auth server's job — but we structurally validate so malformed payloads
// don't reach the renderer.
function isPlausibleJwt(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  if (token.length < 32 || token.length > 8192) return false;
  const segments = token.split('.');
  if (segments.length !== 3) return false;
  return segments.every((seg) => /^[A-Za-z0-9_-]+$/.test(seg));
}

async function handleDeepLinkingUrl(url: string, mainWindow: BrowserWindow | null) {
  // The full URL can contain a token in the query string — log only the
  // scheme + host so we don't write secrets to disk forever.
  let safeUrl: string;
  try {
    const parsed = new URL(url);
    safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    safeUrl = '<unparseable>';
  }
  log.info('Handling deep link:', safeUrl);

  // Restore and focus the window
  if (mainWindow && mainWindow.isMinimized()) mainWindow.restore();
  if (mainWindow) mainWindow.focus();

  try {
    const isMailTo = url.startsWith('mailto:');

    if (isMailTo) {
      // Handle mailto: links. Strip control chars + cap length so a malicious
      // URL handler can't smuggle scripts into renderer autocomplete UI.
      const mailtoUrl = new URL(url);
      const emailRaw = decodeURIComponent(mailtoUrl.pathname);
      const email = emailRaw.replace(/[\x00-\x1f\x7f<>]/g, '').slice(0, 320);
      const queryParams = new URLSearchParams(mailtoUrl.search);
      const paramsObject: Record<string, string> = {};

      queryParams.forEach((value, key) => {
        // Strip control chars from params too. The renderer is expected to
        // treat them as text, but defensive trimming is cheap.
        paramsObject[key] = String(value).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 4096);
      });

      log.info('Handling mailto link:', email, redactParams(paramsObject));

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

      return;
    }

    // mono-desktop:// deep links — used by the browser-side auth flow to
    // hand a token back to the desktop app.
    if (url.startsWith(`${import.meta.env.MONO_ENV_PROTOCOL}://`)) {
      const urlObj = new URL(url);
      const queryParams = new URLSearchParams(urlObj.search);
      const paramsObject: Record<string, string> = {};

      queryParams.forEach((value, key) => {
        paramsObject[key] = String(value).slice(0, 8192);
      });

      const type = paramsObject['type'];
      log.info('Handling mono-desktop deep link:', type, redactParams(paramsObject));

      if (!mainWindow) {
        return;
      }
      if (type) {
        switch (type) {
          case 'signIn':
          case 'addAccount': {
            const token = paramsObject['token'];
            if (!isPlausibleJwt(token)) {
              log.warn(
                `Rejected ${type} deep-link: token is missing or malformed`
              );
              return;
            }
            const channel =
              type === 'signIn' ? 'renderer:auth:sign-in' : 'renderer:auth:add-account';
            mainWindow.webContents.send(channel, token);
            return;
          }
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
