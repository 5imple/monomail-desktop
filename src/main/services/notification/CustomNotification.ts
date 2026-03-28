/* eslint-disable @typescript-eslint/no-explicit-any */

import { ICustomNotificationOptions } from '@/main/services/notification/INotificationOptions';
import { BrowserWindow, BrowserWindowConstructorOptions, shell } from 'electron';
import EventEmitter from 'events';
import * as path from 'path';
// import NotificationHtml from '@/renderer/notification.html?asset';

class CustomNotification extends EventEmitter {
  public static CONTAINER_WIDTH: number = 400;
  private window: BrowserWindow | null;
  public id: string;

  constructor(options: ICustomNotificationOptions) {
    super();
    this.id = options.id; // Store the notification's id

    const display = require('electron').screen.getPrimaryDisplay();
    const displayWidth = display.workArea.x + display.workAreaSize.width;

    const windowOptions: BrowserWindowConstructorOptions = {
      height: 96,
      width: CustomNotification.CONTAINER_WIDTH,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      fullscreenable: false,
      focusable: false,
      show: false,
      frame: false,
      transparent: true,
      x: displayWidth - CustomNotification.CONTAINER_WIDTH,
      y: 0,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        devTools: false
      }
    };

    const window = new BrowserWindow(windowOptions);
    window.setVisibleOnAllWorkspaces(true);

    window.on('ready-to-show', () => {
      window.show();
    });

    const filepath = path.join(
      __dirname,
      `../renderer/notification.html?type=${options.type}&id=${options.id}&data=${options.data}&from=${options.from}`
    );
    window.loadURL(`file://${filepath}`);

    window.on('closed', () => {
      this.window = null;
    });

    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);

      return { action: 'deny' };
    });

    this.window = window;
  }

  public dispose() {
    this.window && this.window.close();
  }
}

export default CustomNotification;
