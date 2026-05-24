import mailApi from '@/main/api/mail/mailApi';
import { registerIpcHandlers } from '@/main/services/ipc-handlers';
import { webSocketPushClient } from '@/main/services/push/WebSocketPushClient';
import { gmailHistoryPoller } from '@/main/services/push/GmailHistoryPoller';
import { completeAccountLinkWithBackend } from '@/main/services/mangers/auth/accountLinking';
import { authManager } from '@/main/services/mangers/auth/AuthManager';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { updateManager } from '@/main/services/mangers/update/UpdateManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { protocols } from '@/main/utils/contants';
import {
  app,
  BrowserWindow,
  nativeImage,
  net,
  powerSaveBlocker,
  protocol,
  session
} from 'electron';
import log from 'electron-log';
import * as fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const stripResponseHeaders = (
  headers: Record<string, string[]> | undefined,
  namesToStrip: string[]
) => {
  const normalizedNames = new Set(namesToStrip.map((name) => name.toLowerCase()));

  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) => !normalizedNames.has(name.toLowerCase()))
  );
};

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

    // Set the dock icon in dev mode. In packaged builds, electron-builder
    // bakes the icon into the .app bundle (see electron-builder.yml); in
    // dev mode we're running Electron's stock executable, which would
    // otherwise show the default atom icon in the macOS dock.
    if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
      try {
        const dockIconPath = path.join(app.getAppPath(), 'resources/dev/dev-512.png');
        const dockIcon = nativeImage.createFromPath(dockIconPath);
        if (!dockIcon.isEmpty()) {
          app.dock.setIcon(dockIcon);
        } else {
          log.warn('[dock] Dev icon image is empty:', dockIconPath);
        }
      } catch (err) {
        log.warn('[dock] Failed to set dev dock icon:', err);
      }
    }
  });
  app.on('ready', () => {
    // Serve the bundled renderer over a custom scheme so it has a stable
    // origin (file:// resolves `<base href="/">` to filesystem root, which
    // breaks every asset URL). Pages requested via this scheme are served
    // from `out/renderer/`; unknown SPA routes (anything without a file
    // extension that does not exist on disk) fall back to `index.html`.
    const rendererDir = path.join(__dirname, '../renderer');
    protocol.handle('monomail-app', async (request) => {
      try {
        const requestURL = new URL(request.url);
        let pathname = decodeURIComponent(requestURL.pathname);
        if (pathname === '' || pathname === '/') {
          pathname = '/index.html';
        }
        let filePath = path.join(rendererDir, pathname);
        // Guard against directory traversal — the resolved path must stay
        // inside the renderer dir.
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(rendererDir))) {
          return new Response('Forbidden', { status: 403 });
        }
        if (!fs.existsSync(resolved) && !path.extname(pathname)) {
          // SPA-style fallback: unknown route → serve the SPA shell.
          filePath = path.join(rendererDir, 'index.html');
        } else {
          filePath = resolved;
        }
        return await net.fetch(pathToFileURL(filePath).toString());
      } catch (err) {
        log.error('[protocol:monomail-app] handler error:', err);
        return new Response('Not found', { status: 404 });
      }
    });

    registerIpcHandlers();
    // windowManager.createAppWindow();

    systemManager.initializeAutoStartSettings();

    updateManager.checkForUpdates();
    webSocketPushClient.start();
    gmailHistoryPoller.start();
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      if (details.url.includes('lh3.googleusercontent.com')) {
        delete details.requestHeaders['Referer'];
        delete details.requestHeaders['Origin'];
      }
      callback({ requestHeaders: { ...details.requestHeaders } });
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // For Google API responses (Gmail, People, etc.), inject CORS headers so
      // web workers — which can't reach window.electronBridge — can fetch
      // directly. The main renderer thread goes through the IPC path instead.
      const isGoogleApi =
        details.url.startsWith('https://gmail.googleapis.com/') ||
        details.url.startsWith('https://www.googleapis.com/') ||
        details.url.startsWith('https://people.googleapis.com/') ||
        details.url.startsWith('https://oauth2.googleapis.com/');
      if (isGoogleApi) {
        const responseHeaders = stripResponseHeaders(details.responseHeaders, [
          'Access-Control-Allow-Origin',
          'Access-Control-Allow-Methods',
          'Access-Control-Allow-Headers',
          'Access-Control-Expose-Headers'
        ]);

        callback({
          responseHeaders: {
            ...responseHeaders,
            'Access-Control-Allow-Origin': ['*'],
            'Access-Control-Allow-Methods': ['GET, POST, PATCH, PUT, DELETE, OPTIONS'],
            'Access-Control-Allow-Headers': ['*'],
            'Access-Control-Expose-Headers': ['*']
          }
        });
        return;
      }

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
      const homepage = import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN;
      const apiOrigin = import.meta.env.MONO_ENV_API_URL;
      const backendOrigin = (import.meta.env.MONO_ENV_BACKEND_URL || '').trim();
      const publicDomain = (import.meta.env.MONO_ENV_PUBLIC_DOMAIN || '').trim();
      // Derive a wss:// origin from backendOrigin so the push WebSocket
      // works without a separate env var.
      const backendWs = backendOrigin
        ? backendOrigin.replace(/^https?:\/\//, 'wss://').replace(/^http:/, 'ws:')
        : '';
      // Derive ws:// from apiOrigin for Vite HMR WebSocket in dev mode.
      const apiWs = apiOrigin
        ? apiOrigin.replace(/^https?:\/\//, 'wss://').replace(/^http:/, 'ws:')
        : '';
      const connectAllow = [
        "'self'",
        'blob:',
        'data:',
        // homepage is already a full URL (e.g. "http://localhost:3030") — use as-is
        homepage || '',
        apiOrigin || '',
        apiWs,
        backendOrigin,
        backendWs,
        publicDomain,
        'https://*.amplitude.com',
        'https://api.mixpanel.com',
        'https://*.paddle.com',
        'https://status.cloud.google.com',
        // Google OAuth + Gmail direct API (Phase 1+)
        'https://accounts.google.com',
        'https://oauth2.googleapis.com',
        'https://www.googleapis.com',
        'https://gmail.googleapis.com',
        'https://people.googleapis.com',
        // Vite HMR WebSocket in dev mode
        !app.isPackaged ? 'ws://localhost:*' : ''
      ]
        .filter(Boolean)
        .join(' ');

      // In dev mode relax script-src so Vite HMR and inline React work.
      const scriptSrc = !app.isPackaged
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.amplitude.com"
        : "script-src 'self' https://*.amplitude.com";

      const csp = [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        // email images are sender-controlled hosts — keep open but stripped
        // schemes (no `*` for protocol). `'self'` covers the custom
        // `monomail-app://` scheme used for the bundled standalone build.
        "img-src 'self' https: data: blob:",
        'media-src https: blob:',
        `connect-src ${connectAllow}`,
        "object-src 'none'",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "frame-src 'self' https://*.paddle.com",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ');

      // Note: previously this also set X-Frame-Options: DENY. Combined with
      // `frame-src 'self'` in CSP it produced a contradictory policy and
      // blocked legitimate iframe-based email rendering (a common
      // sandboxing pattern). CSP is authoritative; XFO is no longer set.
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Headers': ['*'],
          'Content-Security-Policy': [csp]
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

    // Race cleanup against a short timeout. Without this, a stalled
    // network call (e.g. mailApi.stopAllCloudPubSub against an unreachable
    // server) blocks shutdown indefinitely — the user can only escape via
    // force-quit. Five seconds is plenty for an HTTP round-trip; if it
    // takes longer, we accept a slightly dirty shutdown.
    const SHUTDOWN_TIMEOUT_MS = 5000;
    const cleanup = (async () => {
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
      }
    })();

    await Promise.race([
      cleanup,
      new Promise<void>((resolve) =>
        setTimeout(() => {
          log.warn(`before-quit cleanup exceeded ${SHUTDOWN_TIMEOUT_MS}ms — quitting anyway`);
          resolve();
        }, SHUTDOWN_TIMEOUT_MS)
      )
    ]);

    app.quit();
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
        paramsObject[key] = String(value)
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 4096);
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

      // The action is encoded either as the URL host (`mono-desktop://signIn?…`,
      // the documented Phase-B shape) or as a `type` query param
      // (legacy). Accept both so existing redirect flows keep working.
      const type = paramsObject['type'] || urlObj.host || urlObj.hostname || '';
      log.info('Handling mono-desktop deep link:', type, redactParams(paramsObject));

      if (!mainWindow) {
        return;
      }
      if (type) {
        switch (type) {
          case 'signIn':
          case 'addAccount': {
            if (type === 'addAccount' && paramsObject['intent'] && paramsObject['code']) {
              const result = await completeAccountLinkWithBackend({
                intent: paramsObject['intent'],
                code: paramsObject['code']
              });
              if (!result.ok) {
                log.warn('Rejected addAccount completion deep-link:', result.error);
                return;
              }
              mainWindow.webContents.send('renderer:auth:add-account', result.accessToken);
              return;
            }

            const accessToken = paramsObject['token'];
            const refreshToken = paramsObject['refresh_token'];
            const expiresInRaw = paramsObject['expires_in'];
            if (!isPlausibleJwt(accessToken)) {
              log.warn(`Rejected ${type} deep-link: token is missing or malformed`);
              return;
            }
            if (!refreshToken || refreshToken.length < 16) {
              log.warn(`Rejected ${type} deep-link: refresh_token missing or too short`);
              return;
            }
            const expiresInSec = expiresInRaw ? Number.parseInt(expiresInRaw, 10) : NaN;
            tokenManager.saveTokens({
              accessToken,
              refreshToken,
              expiresInSec: Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : 3600
            });
            // The renderer side is informed via `renderer:auth:token-changed`
            // (fired by the TokenManager listener). The legacy sign-in /
            // add-account channels stay for back-compat with the AuthContext
            // dev-token path; pre-Phase-B they carried a Firebase custom
            // token, now they carry the access token directly.
            const channel =
              type === 'signIn' ? 'renderer:auth:sign-in' : 'renderer:auth:add-account';
            mainWindow.webContents.send(channel, accessToken);
            return;
          }
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
