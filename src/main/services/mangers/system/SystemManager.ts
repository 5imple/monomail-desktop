import { SplitCategoryPreferences } from '@/main/api/auth/types';
import { offlineTrayIcon, onlineTrayIcon } from '@/main/utils/contants';
import { AudioType } from '@/renderer/app/lib/soundManager';
import { Tray, app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';

// Create a schema for application settings
interface SettingsSchema {
  autoStartEnabled: boolean;
  firstRun: boolean;
  notificationPreferences: Record<string, string>;
  splitCategoryPreferences: Record<string, SplitCategoryPreferences>; // uid -> category preferences
  windowBounds?: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
}

class SystemManager {
  private static instance: SystemManager;
  private isMainLayoutReady = false;
  private isQuitting = false;
  private isOffline = false;
  private alertSound: AudioType = 'Mono';
  private blockerId: number | null = null;
  private tray: Tray | null = null;
  private settingsStore: Store<SettingsSchema>;
  private isFullSizeWindowOnCreation = false;
  private strictPubSub = false;

  private constructor() {
    // Initialize the settings store
    this.settingsStore = new Store<SettingsSchema>({
      name: 'app-settings',
      defaults: {
        autoStartEnabled: true, // Default value
        firstRun: true, // Track first run
        notificationPreferences: {}, // Store user notification preferences
        splitCategoryPreferences: {} // Store split category preferences per user
      }
    });
  }

  static getInstance(): SystemManager {
    if (!SystemManager.instance) {
      SystemManager.instance = new SystemManager();
    }
    return SystemManager.instance;
  }

  // New methods for split category preferences
  setSplitCategoryPreferences(uid: string, preferences: SplitCategoryPreferences): void {
    const allPreferences = this.settingsStore.get('splitCategoryPreferences') || {};
    allPreferences[uid] = preferences;
    this.settingsStore.set('splitCategoryPreferences', allPreferences);
    log.info(`Split category preferences set for ${uid}:`, preferences);
  }

  getSplitCategoryPreferences(uid: string): SplitCategoryPreferences | undefined {
    const allPreferences = this.settingsStore.get('splitCategoryPreferences') || {};
    return allPreferences[uid];
  }

  updateSplitCategoryPreference(
    uid: string,
    category: keyof SplitCategoryPreferences,
    value: boolean
  ): void {
    const allPreferences = this.settingsStore.get('splitCategoryPreferences') || {};
    if (!allPreferences[uid]) {
      allPreferences[uid] = {
        showUpdates: true,
        showSocial: true,
        showPromotions: true,
        showForums: true
      };
    }
    allPreferences[uid][category] = value;
    this.settingsStore.set('splitCategoryPreferences', allPreferences);
    log.info(`Split category preference updated for ${uid}: ${category} = ${value}`);
  }

  getAllSplitCategoryPreferences(): Record<string, SplitCategoryPreferences> {
    return this.settingsStore.get('splitCategoryPreferences') || {};
  }

  // Check if a specific category should be shown for a user
  shouldShowCategory(uid: string, category: keyof SplitCategoryPreferences): boolean {
    const preferences = this.getSplitCategoryPreferences(uid);
    if (!preferences) {
      // Default values if no preferences are set
      const defaults: SplitCategoryPreferences = {
        showUpdates: true,
        showSocial: true,
        showPromotions: true,
        showForums: true
      };
      return defaults[category];
    }
    return preferences[category];
  }

  // Existing notification preference methods
  setNotificationPreference(uid: string, preference: string): void {
    const preferences = this.settingsStore.get('notificationPreferences') || {};
    preferences[uid] = preference;
    this.settingsStore.set('notificationPreferences', preferences);
    log.info(`Notification preference set for ${uid}: ${preference}`);
  }

  getNotificationPreference(uid: string): string | undefined {
    const preferences = this.settingsStore.get('notificationPreferences') || {};
    return preferences[uid];
  }

  getAllNotificationPreferences(): Record<string, string> {
    return this.settingsStore.get('notificationPreferences') || {};
  }

  // Existing methods
  setAlertSound(sound: AudioType): void {
    this.alertSound = sound;
  }

  getAlertSound(): AudioType {
    return this.alertSound;
  }

  setBlockerId(id: number | null): void {
    this.blockerId = id;
  }

  getBlockerId(): number | null {
    return this.blockerId;
  }

  setMainLayoutReady(value: boolean): void {
    this.isMainLayoutReady = value;
  }

  getMainLayoutReady(): boolean {
    return this.isMainLayoutReady;
  }

  setIsQuitting(value: boolean): void {
    this.isQuitting = value;
  }

  getIsQuitting(): boolean {
    return this.isQuitting;
  }

  setStrictPubSub(value: boolean): void {
    this.strictPubSub = value;
  }

  getStrictPubSub(): boolean {
    return this.strictPubSub;
  }

  getIsOffline(): boolean {
    return this.isOffline;
  }

  setIsOffline(value: boolean): void {
    this.isOffline = value;
  }

  getIsFullSizeWindowOnCreation(): boolean {
    return this.isFullSizeWindowOnCreation;
  }

  setIsFullSizeWindowOnCreation(value: boolean): void {
    this.isFullSizeWindowOnCreation = value;
  }

  setTray(tray: Tray): void {
    this.tray = tray;
  }

  getTray(): Tray | null {
    return this.tray;
  }

  updateTrayIcon(isOnline: boolean) {
    this.isOffline = !isOnline;
    if (this.tray) {
      if (isOnline) {
        onlineTrayIcon.setTemplateImage(true);
        this.tray.setImage(onlineTrayIcon);
      } else {
        offlineTrayIcon.setTemplateImage(true);
        this.tray.setImage(offlineTrayIcon);
      }
    }
  }

  setTrayContextMenu(menu: Electron.Menu): void {
    if (this.tray) {
      this.tray.setContextMenu(menu);
    }
  }

  // Get the user preference, but also sync with system setting if it has changed
  getUserAutoStartPreference(): boolean {
    if ((process.platform === 'darwin' || process.platform === 'win32') && app.isPackaged) {
      const currentSystemSettings = app.getLoginItemSettings();
      const storedPreference = this.settingsStore.get('autoStartEnabled');

      // If the system setting doesn't match our stored preference,
      // update our stored preference to match the system (user changed it outside the app)
      if (currentSystemSettings.openAtLogin !== storedPreference) {
        this.settingsStore.set('autoStartEnabled', currentSystemSettings.openAtLogin);
        log.info(
          'Updated auto-start preference to match system setting:',
          currentSystemSettings.openAtLogin
        );
      }
    }

    // Return current preference
    return this.settingsStore.get('autoStartEnabled');
  }

  // Update the stored preference only, without changing system setting
  setUserAutoStartPreference(enabled: boolean): void {
    this.settingsStore.set('autoStartEnabled', enabled);
    log.info('Auto-start preference set to:', enabled);
  }

  // This initializes auto-start settings only on first run
  initializeAutoStartSettings(): void {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      log.warn('Auto-startup not implemented for this platform:', process.platform);
      return;
    }

    const isFirstRun = this.settingsStore.get('firstRun');

    if (isFirstRun) {
      // Only on first run, set login items according to default
      // if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true
      });
      log.info('First run: Auto-start initialized to true');
      // }

      // Mark first run complete
      this.settingsStore.set('firstRun', false);
    } else {
      // On subsequent runs, sync our preference with the system
      // but don't change the system setting
      this.getUserAutoStartPreference();
      log.info('Auto-start preference synced with system setting');
    }
  }

  // Toggle auto-start explicitly when requested by user
  toggleAutoStart(): boolean {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      log.warn('Auto-startup not implemented for this platform:', process.platform);
      return false;
    }

    // First sync with system setting
    this.getUserAutoStartPreference();

    // Now toggle the preference
    const currentState = this.settingsStore.get('autoStartEnabled');
    const newState = !currentState;

    // Update both our preference and the system setting
    this.setUserAutoStartPreference(newState);

    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: newState,
        openAsHidden: newState
      });
      log.info('Auto-start toggled to:', newState);
    }

    return newState;
  }

  // Explicitly get current system auto-start status
  getSystemAutoStartStatus(): boolean {
    if ((process.platform === 'darwin' || process.platform === 'win32') && app.isPackaged) {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    }
    return false;
  }

  async checkNetworkConnectivity(): Promise<boolean> {
    try {
      // Simple network check
      await fetch('https://www.google.com', { mode: 'no-cors', cache: 'no-store' });
      this.isOffline = false;
      return true;
    } catch (e) {
      this.isOffline = true;
      return false;
    }
  }

  // Window bounds management methods
  saveWindowBounds(bounds: { width: number; height: number; x?: number; y?: number }): void {
    this.settingsStore.set('windowBounds', bounds);
    log.info('Window bounds saved:', bounds);
  }

  getWindowBounds(): { width: number; height: number; x?: number; y?: number } | undefined {
    return this.settingsStore.get('windowBounds');
  }

  hasStoredWindowBounds(): boolean {
    return this.settingsStore.has('windowBounds');
  }
}

export const systemManager = SystemManager.getInstance();
