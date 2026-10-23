import { BrowserWindow } from 'electron';

// After the last change in a burst (archiving ten emails is ten requests):
// long enough for the server's lists to include it.
const SETTLE_MS = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;

/** A request changed the mailbox (mailMutation): tell the windows to refresh. */
export function noteMailChanged(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('renderer:mail:changed');
    }
  }, SETTLE_MS);
}
