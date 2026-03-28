/* eslint-disable @typescript-eslint/no-explicit-any */

import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { darkBackgroundColor, lightBackgroundColor } from '@/main/utils/contants';
import { BrowserWindow, BrowserWindowConstructorOptions, nativeTheme } from 'electron';
import { ProgressInfo } from 'electron-updater';
import * as path from 'path';

export interface IUpdateWindowOptions {
  options?: Partial<BrowserWindowConstructorOptions>;
}

class UpdateWindow extends BrowserWindow {
  constructor({ options }: IUpdateWindowOptions) {
    const windowOptions: BrowserWindowConstructorOptions = {
      width: 360,
      height: 320,
      // alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      fullscreenable: false,
      // focusable: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? darkBackgroundColor : lightBackgroundColor,
      show: false,
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        devTools: false,
        nodeIntegration: false
      },
      ...options
    };
    super(windowOptions);
    this.on('ready-to-show', () => {
      this.show();
    });

    this.on('close', () => {
      windowManager.closeUpdateWindow();
    });

    const filepath = path.join(__dirname, `../renderer/update.html`);
    this.loadURL(`file://${filepath}`);
  }

  public dispose() {
    this.destroy();
  }

  public sendUpdateInfo(info: ProgressInfo) {
    if (this) {
      this.webContents.send('renderer:update:info', info);
    }
  }
}

export default UpdateWindow;
