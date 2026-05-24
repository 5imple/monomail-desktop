import { apiClient } from '@/main/api/apiClient';
import { authManager } from '@/main/services/mangers/auth/AuthManager';
import { googleOAuthServer } from '@/main/services/mangers/auth/GoogleOAuthServer';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { createTray, setTrayContextMenu } from '@/main/services/tray';
import { ipcMain } from 'electron';
import log from 'electron-log';

export function registerAuthHandlers() {
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
      provider: state.provider ?? 'google',
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

  ipcMain.handle(
    'main:auth:remove-google-account',
    async (_, uid: string): Promise<{ ok: true } | { ok: false; error: string }> => {
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
