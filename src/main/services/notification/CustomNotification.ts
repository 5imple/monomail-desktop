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

    // Build the notification URL with each option encoded individually.
    // FCM-controlled values (data, from, type) come from push payloads —
    // ultimately from sender-controlled content — so they were a script
    // injection vector when concatenated raw into a `file://` URL. The
    // notification window is sandbox:false, so any script that loads from
    // `file://` has elevated privileges.
    const filepath = path.join(__dirname, '../renderer/notification.html');
    const params = new URLSearchParams({
      type: String(options.type ?? ''),
      id: String(options.id ?? ''),
      data: String(options.data ?? ''),
      from: String(options.from ?? '')
    });
    window.loadURL(`file://${filepath}?${params.toString()}`);

    window.on('closed', () => {
      this.window = null;
    });

    window.webContents.setWindowOpenHandler((details) => {
      // Same hardening as AppWindow.setWindowOpenHandler — only allow safe
      // schemes through to shell.openExternal so a malicious notification
      // body can't launch `file://` / `smb://` / `vbscript:` URLs.
      const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
      try {
        const parsed = new URL(details.url);
        if (ALLOWED_PROTOCOLS.has(parsed.protocol)) {
          shell.openExternal(parsed.toString());
        }
      } catch {
        // ignore unparseable URLs
      }
      return { action: 'deny' };
    });

    this.window = window;
  }

  public dispose() {
    this.window && this.window.close();
  }
}

export default CustomNotification;
