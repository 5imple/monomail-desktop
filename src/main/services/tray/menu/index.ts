import { windowManager } from '@/main/services/mangers/window/WindowManager';

import { app, shell } from 'electron';

const appVersion = String(import.meta.env.MONO_ENV_APP_VERSION || app.getVersion());
const openAppLabel = appVersion.includes('dev') ? 'Open Mono Mail (Dev)' : 'Open Mono Mail';
const homepageDomain = String(
  import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN || import.meta.env.MONO_ENV_PUBLIC_DOMAIN || ''
).replace(/\/$/, '');

function openCommunity() {
  if (!homepageDomain) return;
  shell.openExternal(`${homepageDomain}/community`);
}

// With no homepage domain configured the community item does nothing on
// click, so leave it (and its separator) out instead of showing a dead entry.
const communityItems: Electron.MenuItemConstructorOptions[] = homepageDomain
  ? [{ label: 'Join our Community', click: openCommunity }, { type: 'separator' }]
  : [];

export const trayAppMenu = [
  {
    label: openAppLabel,
    click: () => {
      const mainWindow = windowManager.getMainAppWindow();
      if (!mainWindow) {
        windowManager.createAppWindow({ route: '/' });
      } else {
        mainWindow.show();
      }
    }
  },
  {
    label: 'Compose Message',
    click: () => {
      const mainWindow = windowManager.getMainAppWindow();
      if (!mainWindow) {
        windowManager.createAppWindow({ route: '/', commands: ['COMPOSE_NEW_MESSAGE'] });
      } else {
        mainWindow.triggerCommand('COMPOSE_NEW_MESSAGE');
      }
    }
  },
  { type: 'separator' as const }, // Explicitly type 'separator'
  {
    label: 'Send Feedback',
    click: () => {
      const mainWindow = windowManager.getMainAppWindow();
      if (!mainWindow) {
        windowManager.createAppWindow({ route: '/', commands: ['OPEN_FEEDBACK'] });
      } else {
        mainWindow.triggerCommand('OPEN_FEEDBACK');
      }
    }
  },
  { type: 'separator' as const }, // Explicitly type 'separator'
  // {
  //   label: 'Subscribe for Updates',
  //   click: () => {
  //     ipcRenderer.invoke('main:native:open-subscribe-window');
  //   }
  // },
  ...communityItems,
  {
    label: 'Settings…',
    click: () => {
      const mainWindow = windowManager.getMainAppWindow();
      if (!mainWindow) {
        windowManager.createAppWindow({ route: '/', commands: ['OPEN_PREFERENCES'] });
      } else {
        mainWindow.triggerCommand('OPEN_PREFERENCES');
      }
    }
  },
  { type: 'separator' as const }, // Explicitly type 'separator'
  {
    label: 'Quit Mono Mail completely',
    click: () => {
      app.quit();
    }
  }
];
export const trayDefaultMenu = [
  {
    label: openAppLabel,
    click: () => {
      const mainWindow = windowManager.getMainAppWindow();
      if (!mainWindow) {
        windowManager.createAppWindow({ route: '/' });
      } else {
        mainWindow.show();
      }
    }
  },
  { type: 'separator' as const }, // Explicitly type 'separator'
  ...communityItems,
  {
    label: 'Quit Mono Mail completely',
    click: () => {
      app.quit();
    }
  }
];
