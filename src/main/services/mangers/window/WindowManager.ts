import { systemManager } from '@/main/services/mangers/system/SystemManager';
import AppWindow, { IAppWindowOptions } from '@/main/services/mangers/window/AppWindow';
import UpdateWindow, { IUpdateWindowOptions } from '@/main/services/mangers/window/UpdateWindow';
import log from 'electron-log';
class WindowManager {
  private static instance: WindowManager;
  private mainAppWindow: AppWindow | null;
  private updateWindow: UpdateWindow | null;
  private appWindows: Map<number, AppWindow>;

  constructor() {
    this.appWindows = new Map<number, AppWindow>();
    this.mainAppWindow = null;
    this.updateWindow = null;
  }

  /**
   * Get the singleton instance of WindowManager.
   * @returns {WindowManager} The singleton instance
   */
  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  /**
   * Creates a new app window using the id from options.
   * @param options The window options with an id
   * @returns {number} The ID of the created window
   */
  public createAppWindow(options: IAppWindowOptions = {}): number {
    const window = new AppWindow(options);
    if (!this.mainAppWindow) {
      this.mainAppWindow = window;
    }

    // Store the window in the manager
    this.appWindows.set(window.id, window);
    return window.id; // Return the ID so it can be used elsewhere
  }

  /**
   * Creates a new update window using the id from options.
   * @param options The window options with an id
   * @returns {number} The ID of the created window
   */
  public createUpdateWindow(options: IUpdateWindowOptions = {}): number {
    if (this.updateWindow) {
      this.closeUpdateWindow();
    }
    const window = new UpdateWindow(options);
    if (!this.updateWindow) {
      this.updateWindow = window;
    }

    return window.id; // Return the ID so it can be used elsewhere
  }

  /**
   * Closes a window by its ID.
   * @param id The ID of the window to remove
   */
  public closeAppWindow(id: number): void {
    const window = this.appWindows.get(id);
    if (window) {
      window.dispose(); // Close and dispose the window
      this.appWindows.delete(id); // Remove from the manager

      if (this.mainAppWindow && this.mainAppWindow.id === id) {
        this.mainAppWindow.dispose();
        this.mainAppWindow = null;
        systemManager.setMainLayoutReady(false);
        log.debug(`Main Window ${id} removed`);
      }
      log.debug(`Window ${id} removed`);
    } else {
      log.debug(`Window ${id} not found`);
    }
  }

  /**
   * Closes a update window
   */
  public closeUpdateWindow(): void {
    if (this.updateWindow) {
      this.updateWindow.dispose();
      this.updateWindow = null;
    }
  }

  /**
   * Get the window by ID.
   * @param id The ID of the window
   * @returns {AppWindow | null} The window instance
   */
  public getAppWindow(id: number): AppWindow | null {
    return this.appWindows.get(id) || null;
  }

  public getMainAppWindow() {
    return this.mainAppWindow;
  }
  public getUpdateWindow() {
    return this.updateWindow;
  }
  public closeAll() {
    // Close all AppWindows
    for (const [id] of this.appWindows.entries()) {
      this.closeAppWindow(id);
    }

    // Close Update Window if it exists
    if (this.updateWindow) {
      this.updateWindow.dispose();
      this.updateWindow = null;
    }
  }
}

export const windowManager = WindowManager.getInstance();
