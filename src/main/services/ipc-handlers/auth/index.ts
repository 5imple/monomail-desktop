import { apiClient } from '@/main/api/apiClient';
import { completeAccountLinkWithBackend } from '@/main/services/mangers/auth/accountLinking';
import { authManager } from '@/main/services/mangers/auth/AuthManager';
import { googleOAuthServer } from '@/main/services/mangers/auth/GoogleOAuthServer';
import { resolveBackendUrl, tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { createTray, setTrayContextMenu } from '@/main/services/tray';
import { ipcMain, net } from 'electron';
import log from 'electron-log';

function isPlausibleAccessToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 32 &&
    value.length <= 8192 &&
    value.split('.').length === 3
  );
}

function isPlausibleRefreshToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 8192;
}

function parseJsonSafely(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function registerAuthHandlers() {
  // Legacy channel — pre-Phase-B the renderer pushed Firebase-issued ID
  // tokens into main here. Now tokens originate in main (via the OAuth
  // deep-link), so the renderer no longer drives this. Kept as a no-op
  // until the renderer-side caller is fully removed.
  ipcMain.handle('main:auth:set-id-token', () => {
    /* no-op (see TokenManager) */
  });

  ipcMain.handle('main:auth:set-active-uid', (_, id: string) => {
    authManager.setActiveUid(id);
  });

  /**
   * Read the current auth state from the main-process TokenManager.
   * Returns null when signed out; otherwise the access token plus a
   * shallow profile snapshot the renderer can hydrate from instantly.
   */
  ipcMain.handle('main:auth:get-state', () => {
    const state = tokenManager.getState();
    if (!state) return null;
    return {
      accessToken: state.accessToken,
      expiresAt: state.expiresAt,
      member: state.member ?? null,
      provider: state.provider ?? 'backend',
      googleAccounts: tokenManager.getGoogleAccounts()
    };
  });

  ipcMain.handle('main:auth:sign-out', () => {
    tokenManager.clearTokens('renderer:sign-out');
  });

  ipcMain.handle('main:auth:refresh', async () => {
    try {
      const state = await tokenManager.refresh();
      return { ok: true, accessToken: state.accessToken, expiresAt: state.expiresAt };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // Dev-only bypass for the OS protocol handler. In packaged builds, the
  // sign-in tokens land via `mono-desktop://signIn?token=…` which Electron
  // receives through `app.on('open-url')` and routes through
  // `handleDeepLinkingUrl`. In `npm run dev`, the Electron binary isn't a
  // registered macOS .app, so the protocol handoff is unreliable. This
  // channel lets the renderer hand pre-parsed tokens (typically scraped
  // from the local mock backend's sign-in HTML) straight to TokenManager
  // — same `saveTokens` call, same downstream events. Production never
  // hits this because SignInLayout only invokes it when the configured
  // homepage points at localhost.
  ipcMain.handle(
    'main:auth:dev-sign-in',
    async (
      _,
      args: { accessToken: string; refreshToken: string; expiresInSec?: number }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const { accessToken, refreshToken, expiresInSec } = args ?? ({} as typeof args);
      if (!isPlausibleAccessToken(accessToken)) {
        return { ok: false, error: 'access token is missing or malformed' };
      }
      if (!isPlausibleRefreshToken(refreshToken)) {
        return { ok: false, error: 'refresh_token missing or too short' };
      }
      const expSec =
        typeof expiresInSec === 'number' && Number.isFinite(expiresInSec) && expiresInSec > 0
          ? expiresInSec
          : 3600;
      tokenManager.saveTokens({
        accessToken,
        refreshToken,
        expiresInSec: expSec,
        provider: 'backend'
      });
      return { ok: true };
    }
  );

  ipcMain.handle(
    'main:auth:remove-google-account',
    async (
      _,
      uid: string
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (typeof uid !== 'string' || !uid) {
        return { ok: false, error: 'uid is required' };
      }
      const removed = tokenManager.removeGoogleAccount(uid);
      if (!removed) {
        return { ok: false, error: 'Account not found in local token store' };
      }
      const mainAppWindow = windowManager.getMainAppWindow();
      if (mainAppWindow) {
        mainAppWindow.webContents.send('renderer:auth:add-account', null);
      }
      return { ok: true };
    }
  );

  ipcMain.handle(
    'main:auth:get-google-account-token',
    async (
      _,
      uid: string
    ): Promise<
      { ok: true; accessToken: string; expiresAt: number } | { ok: false; error: string }
    > => {
      try {
        const token = await tokenManager.getGoogleAccountAccessToken(uid);
        return { ok: true, ...token };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
  );

  ipcMain.handle(
    'main:auth:create-account-link-intent',
    async (
      _,
      args?: { provider?: string; client?: string }
    ): Promise<
      | { ok: true; intent: string; expiresAt?: string }
      | { ok: false; error: string; status?: number }
    > => {
      const backend = resolveBackendUrl();
      if (!backend) return { ok: false, error: 'MONO_ENV_BACKEND_URL is not configured' };

      const accessToken = tokenManager.getAccessToken();
      if (!accessToken) return { ok: false, error: 'You must be signed in before adding Gmail.' };

      try {
        const response = await net.fetch(`${backend}/desktop/account-link-intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            provider: args?.provider ?? 'gmail',
            client: args?.client ?? 'web-electron'
          })
        });

        const raw = await response.text();
        const body = parseJsonSafely(raw) as {
          intent?: unknown;
          expiresAt?: unknown;
          error?: unknown;
        };

        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            error:
              typeof body.error === 'string'
                ? body.error
                : `Account linking is unavailable (${response.status})`
          };
        }

        if (typeof body.intent !== 'string' || body.intent.length < 16) {
          return { ok: false, error: 'Account-link intent response is malformed' };
        }

        return {
          ok: true,
          intent: body.intent,
          expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Account linking failed'
        };
      }
    }
  );

  ipcMain.handle(
    'main:auth:complete-account-link',
    async (
      _,
      args?: { intent?: string; code?: string }
    ): Promise<
      | { ok: true; accessToken: string; expiresAt: number }
      | { ok: false; error: string; status?: number }
    > => {
      const result = await completeAccountLinkWithBackend({
        intent: args?.intent ?? '',
        code: args?.code ?? ''
      });

      if (result.ok) {
        const mainAppWindow = windowManager.getMainAppWindow();
        if (mainAppWindow) {
          mainAppWindow.webContents.send('renderer:auth:add-account', result.accessToken);
        }
      }

      return result;
    }
  );

  ipcMain.handle(
    'main:auth:initiate-sign-in',
    async (): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const tokens = await googleOAuthServer.startFlow();
        tokenManager.saveTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresInSec: tokens.expiresInSec,
          member: {
            uid: tokens.sub,
            email: tokens.email,
            displayName: tokens.name,
            photoURL: tokens.picture
          },
          provider: 'google'
        });
        return { ok: true };
      } catch (e) {
        log.error('[auth:initiate-sign-in]', (e as Error).message);
        return { ok: false, error: (e as Error).message };
      }
    }
  );

  ipcMain.handle(
    'main:auth:initiate-add-account',
    async (): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> => {
      try {
        const tokens = await googleOAuthServer.startFlow({ prompt: 'select_account consent' });
        tokenManager.saveGoogleAccountTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresInSec: tokens.expiresInSec,
          member: {
            uid: tokens.sub,
            email: tokens.email,
            displayName: tokens.name,
            photoURL: tokens.picture
          }
        });
        const mainAppWindow = windowManager.getMainAppWindow();
        if (mainAppWindow) {
          mainAppWindow.webContents.send('renderer:auth:add-account', tokens.accessToken);
        }
        return { ok: true, accessToken: tokens.accessToken };
      } catch (e) {
        log.error('[auth:initiate-add-account]', (e as Error).message);
        return { ok: false, error: (e as Error).message };
      }
    }
  );

  ipcMain.handle(
    'main:auth:dev-add-account',
    async (
      _,
      args: { accessToken: string; refreshToken: string; expiresInSec?: number }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const { accessToken, refreshToken, expiresInSec } = args ?? ({} as typeof args);
      if (!isPlausibleAccessToken(accessToken)) {
        return { ok: false, error: 'access token is missing or malformed' };
      }
      if (!isPlausibleRefreshToken(refreshToken)) {
        return { ok: false, error: 'refresh_token missing or too short' };
      }

      const expSec =
        typeof expiresInSec === 'number' && Number.isFinite(expiresInSec) && expiresInSec > 0
          ? expiresInSec
          : 3600;
      tokenManager.saveTokens({
        accessToken,
        refreshToken,
        expiresInSec: expSec,
        provider: 'backend'
      });

      const mainAppWindow = windowManager.getMainAppWindow();
      if (mainAppWindow) {
        mainAppWindow.webContents.send('renderer:auth:add-account', accessToken);
      }

      return { ok: true };
    }
  );

  // Bridge TokenManager events → renderer.
  tokenManager.on('token-changed', () => {
    apiClient.setApiClientIdToken(tokenManager.getAccessToken());
    setTrayContextMenu();
    const mainAppWindow = windowManager.getMainAppWindow();
    if (mainAppWindow) {
      createTray();
      mainAppWindow.webContents.send('renderer:auth:token-changed', {
        accessToken: tokenManager.getAccessToken(),
        expiresAt: tokenManager.getState()?.expiresAt ?? 0
      });
    }
  });

  tokenManager.on('signed-out', () => {
    apiClient.setApiClientIdToken(null);
    setTrayContextMenu();
    const mainAppWindow = windowManager.getMainAppWindow();
    if (mainAppWindow) {
      mainAppWindow.webContents.send('renderer:auth:signed-out', {});
    }
  });
}
