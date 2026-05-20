import { registerAppEventHandlers } from '@/main/services/app-events';
import { app, protocol } from 'electron';
import log from 'electron-log';
import path from 'path';

// Register the custom scheme used to serve the bundled renderer in
// standalone mode. Must be registered BEFORE app.ready so Electron knows
// the scheme is privileged (secure-context, fetch-API capable, etc.).
// Loading the renderer over this scheme — instead of file:// — gives us
// a stable origin so the bundled `<base href="/">` resolves correctly
// and ES-module scripts with `crossorigin`/`integrity` attributes work.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'monomail-app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      allowServiceWorkers: true
    }
  }
]);

log.initialize({
  includeFutureSessions: true
});

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.ipc.level = 'debug';

// Cap the on-disk log so a long-running session doesn't accumulate
// unbounded data (the previous default was unbounded). electron-log
// rotates the file once it exceeds maxSize; the old file is kept as
// `main.old.log` until the next rotation.
log.transports.file.maxSize = 2 * 1024 * 1024; // 2 MiB

log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');

log.info('===========================================================');
log.info('Booting...');
log.info('Client version: ', app.getVersion());

// Surface silent crashes so we don't get a "blank screen for unknown
// reasons" again. Without these handlers a rejected promise in any
// async path (auto-updater feed fetch, Firebase init, protocol handler,
// etc.) can take the main process down with no visible diagnostic.
process.on('uncaughtException', (err) => {
  log.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  log.error('[unhandledRejection]', reason);
});

registerAppEventHandlers();
