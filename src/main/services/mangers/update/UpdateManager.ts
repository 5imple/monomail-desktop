import { AppUpdater, autoUpdater, CancellationToken } from 'electron-updater';
import { app, dialog } from 'electron';
import log from 'electron-log';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { compareVersions } from '@/main/services/updater/utils';
import { systemManager } from '@/main/services/mangers/system/SystemManager';

export class UpdateManager {
  private static instance: UpdateManager;
  private autoUpdater: AppUpdater;
  private cancellationToken: CancellationToken | null = null;
  private updateAvailable = false;
  private isOffline = false;

  private constructor() {
    this.autoUpdater = autoUpdater;
    this.configureUpdater();
  }

  static getInstance(): UpdateManager {
    if (!UpdateManager.instance) {
      UpdateManager.instance = new UpdateManager();
    }
    return UpdateManager.instance;
  }

  private configureUpdater(): void {
    this.autoUpdater.logger = log;
    const version = app.getVersion();
    const channel: 'latest' | 'dev' | 'beta' = version.includes('dev')
      ? 'dev'
      : version.includes('beta')
        ? 'beta'
        : 'latest';

    // Refuse to configure an update feed without an explicit URL. Silently
    // falling back to a default would let `electron-updater` install
    // anything that 200s on that path — failing closed is the only safe
    // default for an auto-updater.
    //
    // Resolution order:
    //   1. MONO_ENV_UPDATE_FEED_URL — explicit, on-prem-friendly. Should be
    //      a full URL ending in `/` (e.g. https://updates.example.com/mac/).
    //   2. MONO_ENV_FIREBASE_STORAGE_BUCKET — legacy Firebase-hosted bucket.
    //      Kept so existing Firebase deployments still work; Phase B will
    //      drop this branch entirely.
    const explicitFeed = (import.meta.env.MONO_ENV_UPDATE_FEED_URL || '').trim();
    const legacyBucket = (import.meta.env.MONO_ENV_FIREBASE_STORAGE_BUCKET || '').trim();
    const feedUrl = explicitFeed
      ? explicitFeed.endsWith('/')
        ? explicitFeed
        : `${explicitFeed}/`
      : legacyBucket
        ? `https://storage.googleapis.com/${legacyBucket}/releases/`
        : '';
    if (!feedUrl) {
      log.error(
        '[UpdateManager] No update feed configured (MONO_ENV_UPDATE_FEED_URL ' +
          'or MONO_ENV_FIREBASE_STORAGE_BUCKET). Updates are disabled in this build.'
      );
      this.setupListeners();
      return;
    }

    this.autoUpdater.channel = channel;
    this.autoUpdater.setFeedURL({
      url: feedUrl,
      provider: 'generic',
      channel
    });

    if (!app.isPackaged) {
      this.autoUpdater.forceDevUpdateConfig = true;
      this.autoUpdater.allowPrerelease = true;
    }

    this.autoUpdater.allowDowngrade = false;
    this.autoUpdater.autoDownload = false;

    this.setupListeners();
  }

  private setupListeners(): void {
    this.autoUpdater.on('update-available', async (updateInfo) => {
      this.setUpdateAvailable(true);
      const window = windowManager.getMainAppWindow();
      if (window) {
        window.webContents.send('renderer:update:available');
      } else {
        if (!windowManager.getUpdateWindow()) {
          windowManager.createUpdateWindow();
        }
        await this.downloadUpdate();
      }
    });

    this.autoUpdater.on('download-progress', (info) => {
      log.info('Update downloading', info.percent);
      const updateWindow = windowManager.getUpdateWindow();
      if (updateWindow) {
        updateWindow.sendUpdateInfo(info);
      }
    });

    this.autoUpdater.on('update-downloaded', async () => {
      log.info('Update downloaded!');
      this.promptForInstallation();
    });

    this.autoUpdater.on('update-not-available', () => {
      log.info(`Latest version ${app.getVersion()}`);
      this.setUpdateAvailable(false);
      windowManager.closeUpdateWindow();
      if (!windowManager.getMainAppWindow()) {
        windowManager.createAppWindow({
          fullSizeOnCreation: systemManager.getIsFullSizeWindowOnCreation()
        });
      }
    });

    this.autoUpdater.on('error', (err) => {
      log.error('Error in auto-updater (name): ', err.name);
      log.error('Error in auto-updater (message): ', err.message);

      // Check if the error is related to network connectivity
      if (
        err.message.includes('net::') ||
        err.message.includes('network') ||
        err.message.includes('ENOTFOUND') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ECONNRESET')
      ) {
        this.isOffline = true;
        log.info('Network error detected, proceeding in offline mode');

        // Close update window if open
        windowManager.closeUpdateWindow();

        // Create main app window if it doesn't exist
        if (!windowManager.getMainAppWindow()) {
          windowManager.createAppWindow();
        }

        // Optionally inform the user they're in offline mode
        const window = windowManager.getMainAppWindow();
        if (window) {
          window.webContents.send('renderer:offline:mode');
        }
      } else {
        // For critical errors that aren't network-related, show error and quit
        windowManager.closeUpdateWindow();
        dialog.showErrorBox(err.name, err.message);
        app.quit();
      }
    });
  }

  /** Check for updates manually */
  async checkForUpdates(retries = 0, delay = 3000): Promise<void> {
    // Skip update check if we know we're offline
    await systemManager.checkNetworkConnectivity();
    if (systemManager.getIsOffline()) {
      if (!windowManager.getMainAppWindow()) {
        windowManager.createAppWindow({ isOffline: true });
      }
      return;
    }

    this.autoUpdater.checkForUpdates().catch((err) => {
      log.error('Failed to check for updates:', err);

      // Handle network errors by creating the app window
      if (
        err.message.includes('net::') ||
        err.message.includes('network') ||
        err.message.includes('ENOTFOUND') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ECONNRESET')
      ) {
        systemManager.setIsOffline(true);
        log.info('Network error during update check, proceeding in offline mode');

        if (!windowManager.getMainAppWindow()) {
          windowManager.createAppWindow({ isOffline: true });
        }
      }
    });
  }

  /** Downloads the update */
  async downloadUpdate(): Promise<void> {
    if (!this.updateAvailable || systemManager.getIsOffline()) {
      this.setUpdateAvailable(false);
      windowManager.closeUpdateWindow();
      if (!windowManager.getMainAppWindow()) {
        windowManager.createAppWindow();
      }
      return;
    }

    try {
      const cancellationToken = new CancellationToken();
      this.setCancellationToken(cancellationToken);
      log.info('Starting update download...');
      await this.autoUpdater.downloadUpdate(cancellationToken);
    } catch (e) {
      if ((e as Error).message === 'cancelled') {
        app.quit();
        log.info('Update download cancelled');
      } else {
        log.error('Error during update download:', e);

        // Check if download failed due to network issues
        if (
          (e as Error).message.includes('net::') ||
          (e as Error).message.includes('network') ||
          (e as Error).message.includes('ENOTFOUND') ||
          (e as Error).message.includes('ETIMEDOUT') ||
          (e as Error).message.includes('ECONNREFUSED') ||
          (e as Error).message.includes('ECONNRESET')
        ) {
          systemManager.setIsOffline(true);
          windowManager.closeUpdateWindow();
          if (!windowManager.getMainAppWindow()) {
            windowManager.createAppWindow();
          }
        }
      }
    }
  }

  /** Prompt the user to install the update */
  async promptForInstallation(): Promise<void> {
    const updateWindow = windowManager.getUpdateWindow();
    if (updateWindow) {
      updateWindow.focus();
    }

    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart & Install', 'Later'],
      defaultId: 0,
      title: 'Update Ready',
      message: 'A new update has been downloaded. Restart now to install?'
    });

    if (response === 0) {
      this.installUpdate();
    } else {
      windowManager.closeUpdateWindow();
      if (!windowManager.getMainAppWindow()) {
        windowManager.createAppWindow();
      }
    }
  }

  /** Installs the update */
  installUpdate(): void {
    log.info('Restarting and installing the update...');
    windowManager.closeUpdateWindow();
    this.autoUpdater.quitAndInstall();
  }

  setUpdateAvailable(value: boolean): void {
    this.updateAvailable = value;
  }

  getUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  setCancellationToken(token: CancellationToken): void {
    this.cancellationToken = token;
  }

  getCancellationToken(): CancellationToken | null {
    return this.cancellationToken;
  }
}

export const updateManager = UpdateManager.getInstance();
