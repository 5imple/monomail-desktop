import { apiClient } from '@/main/api/apiClient';
import { authManager } from '@/main/services/mangers/auth/AuthManager';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { createTray, setTrayContextMenu } from '@/main/services/tray';
import { ipcMain } from 'electron';

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
      member: state.member ?? null
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
