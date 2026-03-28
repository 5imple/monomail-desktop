import { authManager } from '@/main/services/mangers/auth/AuthManager';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import { trayAppMenu, trayDefaultMenu } from '@/main/services/tray/menu';
import { onlineTrayIcon } from '@/main/utils/contants';

import { Menu, Tray } from 'electron';

export function createTray() {
  if (systemManager.getTray()) return;
  onlineTrayIcon.setTemplateImage(true);
  const tray = new Tray(onlineTrayIcon);

  tray.on('right-click', () => {
    setTrayContextMenu();
  });

  systemManager.setTray(tray);

  setTrayContextMenu();
}

export async function setTrayContextMenu() {
  const tray = systemManager.getTray();
  if (!tray) return;

  // Check if idToken exists
  const menuItems: Electron.MenuItemConstructorOptions[] = authManager.getIdToken()
    ? trayAppMenu
    : trayDefaultMenu;

  const contextMenu = Menu.buildFromTemplate(menuItems);

  tray.setContextMenu(contextMenu);
}
