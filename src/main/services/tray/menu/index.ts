import { windowManager } from '@/main/services/mangers/window/WindowManager';

import { app, shell } from 'electron';
export const trayAppMenu = [
  {
    label: import.meta.env.MONO_ENV_APP_VERSION.includes('dev')
      ? 'Open Mono Mail (Dev)'
      : 'Open Mono Mail',
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
  {
    label: 'Join our Community',
    click: () => {
      shell.openExternal(import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN + '/community');
      // ipcRenderer.invoke('main:native:open-community-window');
    }
  },
  { type: 'separator' as const }, // Explicitly type 'separator'
  {
    label: 'Settings..',
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
    label: import.meta.env.MONO_ENV_APP_VERSION.includes('dev')
      ? 'Open Mono Mail (Dev)'
      : 'Open Mono Mail',
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
  {
    label: 'Join our Community',
    click: () => {
      shell.openExternal(import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN + '/community');
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
