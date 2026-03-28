import log from 'electron-log';
import { shell } from 'electron';
import path from 'path';

export function openLogFolder() {
  const logFolderPath = path.dirname(log.transports.file.getFile().path);

  shell.openPath(logFolderPath);
}
