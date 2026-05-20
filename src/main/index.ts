import { registerAppEventHandlers } from '@/main/services/app-events';
import { app } from 'electron';
import log from 'electron-log';
import path from 'path';

log.initialize({
  includeFutureSessions: true,
  spyRendererConsole: !app.isPackaged // Only spy in development
});

log.transports.file.level = 'info';
log.transports.console.level = !app.isPackaged ? 'debug' : 'warn';
log.transports.ipc.level = !app.isPackaged ? 'debug' : 'warn';

// Cap the on-disk log so a long-running session doesn't accumulate
// unbounded data (the previous default was unbounded). electron-log
// rotates the file once it exceeds maxSize; the old file is kept as
// `main.old.log` until the next rotation.
log.transports.file.maxSize = 2 * 1024 * 1024; // 2 MiB

log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');

log.info('===========================================================');
log.info('Booting...');
log.info('Client version: ', app.getVersion());

registerAppEventHandlers();
