import { apiClient } from '@/main/api/apiClient';
import { authManager } from '@/main/services/mangers/auth/AuthManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { createTray, setTrayContextMenu } from '@/main/services/tray';
import { ipcMain } from 'electron';

export function registerAuthHandlers() {
  ipcMain.handle('main:auth:set-id-token', (_, token: string | null) => {
    apiClient.setApiClientIdToken(token);
    authManager.setIdToken(token);
    setTrayContextMenu();

    const mainAppWindow = windowManager.getMainAppWindow();
    if (mainAppWindow) {
      createTray();
    }
  });

  ipcMain.handle('main:auth:set-active-uid', (_, id: string) => {
    authManager.setActiveUid(id);
  });
}
