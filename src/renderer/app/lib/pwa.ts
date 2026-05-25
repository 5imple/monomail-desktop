import { registerSW } from 'virtual:pwa-register';

// Create a custom event dispatcher for PWA updates
const PWA_UPDATE_EVENT = 'pwa-update-available';

// Enhanced logging for development
const logPWA = (level: 'info' | 'warn' | 'error', message: string, ...args: any[]) => {
  const emoji = level === 'info' ? '🔧' : level === 'warn' ? '⚠️' : '❌';
  console[level](`${emoji} ${message}`, ...args);
};

export const initializeServiceWorker = () => {
  if (!isServiceWorkerSupported()) {
    logPWA('warn', 'Service Workers not supported in this browser');
    return () => Promise.resolve();
  }

  // In development, service worker might not be available
  if (import.meta.env.DEV) {
    // logPWA('info', 'Development mode - Service Worker disabled for now');
    // logPWA('info', 'Network First strategy will be active in production build');
    return () => Promise.resolve();
  }

  // logPWA('info', 'Initializing Service Worker with Network First strategy...');

  const updateSW = registerSW({
    immediate: true, // Register immediately for faster startup
    onNeedRefresh() {
      logPWA('info', 'New app version available! Update will be applied after user confirms.');

      // Emit a custom event that components can listen to
      window.dispatchEvent(
        new CustomEvent(PWA_UPDATE_EVENT, {
          detail: { updateFunction: updateSW }
        })
      );
    },
    onOfflineReady() {
      logPWA('info', 'App ready to work offline! Cached content available when network fails.');

      // Dispatch offline ready event
      window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
    },
    onRegisterError(error) {
      logPWA('error', 'Service Worker registration failed:', error);
    },
    onRegistered(registration) {
      logPWA('info', 'Service Worker registered successfully');

      if (registration) {
        // Enhanced update checking with proper intervals
        // checkForUpdates(registration);

        // Monitor service worker state changes
        monitorServiceWorkerUpdates(registration);

        // Set up periodic update checks (every 60 seconds)
        // setInterval(() => {
        //   checkForUpdates(registration);
        // }, 60000);
      }
    }
  });

  return updateSW;
};

// Enhanced update checking function
const checkForUpdates = async (registration: ServiceWorkerRegistration) => {
  try {
    logPWA('info', 'Checking for updates...');

    // Force update check by calling update() method
    await registration.update();

    // Check the registration state after update
    if (registration.installing) {
      logPWA('info', 'Update found and installing...');
    } else if (registration.waiting) {
      logPWA('info', 'Update found and waiting...');
    } else {
      logPWA('info', 'No updates available');
    }
  } catch (error) {
    logPWA('error', 'Update check failed:', error);
  }
};

// Monitor service worker state changes for better debugging
const monitorServiceWorkerUpdates = (registration: ServiceWorkerRegistration) => {
  // Monitor the installing service worker
  if (registration.installing) {
    logPWA('info', 'Service worker installing...');
    registration.installing.addEventListener('statechange', (event) => {
      const sw = event.target as ServiceWorker;
      logPWA('info', `Installing service worker state changed to: ${sw.state}`);
    });
  }

  // Monitor the waiting service worker
  if (registration.waiting) {
    logPWA('info', 'Service worker waiting...');
    registration.waiting.addEventListener('statechange', (event) => {
      const sw = event.target as ServiceWorker;
      logPWA('info', `Waiting service worker state changed to: ${sw.state}`);
    });
  }

  // Monitor the active service worker
  if (registration.active) {
    logPWA('info', 'Service worker active');
    registration.active.addEventListener('statechange', (event) => {
      const sw = event.target as ServiceWorker;
      logPWA('info', `Active service worker state changed to: ${sw.state}`);
    });
  }

  // Listen for new service workers
  registration.addEventListener('updatefound', () => {
    logPWA('info', 'New service worker found, installing...');
    const newWorker = registration.installing;
    if (newWorker) {
      newWorker.addEventListener('statechange', (event) => {
        const sw = event.target as ServiceWorker;
        logPWA('info', `New service worker state: ${sw.state}`);

        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          logPWA('info', 'New service worker installed and ready for activation');
        }
      });
    }
  });
};

// Network status monitoring for better offline/online detection
export const initializeNetworkMonitoring = () => {
  const logNetworkStatus = () => {
    const status = navigator.onLine ? 'ONLINE' : 'OFFLINE';
    const strategy = navigator.onLine
      ? 'Network First (server → cache)'
      : 'Cache Only (offline mode)';
    // logPWA('info', `Network Status: ${status} | Strategy: ${strategy}`);
  };

  // Log initial status
  logNetworkStatus();

  // Monitor network changes
  window.addEventListener('online', () => {
    logPWA('info', '🌐 Network restored - switching to Network First strategy');
    logNetworkStatus();
  });

  window.addEventListener('offline', () => {
    logPWA('warn', '📱 Network lost - switching to Cache Only strategy');
    logNetworkStatus();
  });
};

// Force refresh with bypass cache (for debugging)
export const forceAppUpdate = async () => {
  if (import.meta.env.DEV) {
    logPWA('info', 'Force updating app (bypass cache)...');

    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      logPWA('info', 'All caches cleared');
    }

    // Reload with hard refresh
    window.location.reload();
  } else {
    logPWA('warn', 'Force update only available in development mode');
  }
};

// Simple utility to check if service worker is available
export const isServiceWorkerSupported = (): boolean => {
  return 'serviceWorker' in navigator;
};

// Get service worker registration info (for debugging)
export const getServiceWorkerInfo = async () => {
  if (!isServiceWorkerSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      return {
        active: !!registration.active,
        installing: !!registration.installing,
        waiting: !!registration.waiting,
        scope: registration.scope,
        updateViaCache: registration.updateViaCache
      };
    }
  } catch (error) {
    logPWA('error', 'Failed to get service worker info:', error);
  }
  return null;
};

// Export the event name for components to use
export { PWA_UPDATE_EVENT };

// Helper function to check cache status (for debugging)
export const checkCacheStatus = async () => {
  if (!('caches' in window)) {
    logPWA('warn', 'Cache API not supported');
    return;
  }

  try {
    const cacheNames = await caches.keys();
    logPWA('info', `Found ${cacheNames.length} caches:`, cacheNames);

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      logPWA('info', `Cache "${cacheName}" contains ${keys.length} entries`);
    }
  } catch (error) {
    logPWA('error', 'Failed to check cache status:', error);
  }
};

// Helper function to handle PWA updates properly
export const handlePWAUpdate = async (updateFunction: () => Promise<void>) => {
  try {
    logPWA('info', 'Starting PWA update process...');

    // Check cache status before update
    await checkCacheStatus();

    // Apply the update - this activates the waiting service worker
    await updateFunction();

    logPWA('info', 'PWA update applied successfully');
    logPWA('info', 'New service worker will handle cache cleanup automatically');

    // Since we have skipWaiting: true and clientsClaim: true,
    // the new service worker will take control immediately
    logPWA('info', 'Reloading page to activate new service worker...');

    // Use a slight delay to ensure the update is fully processed
    // setTimeout(() => {
    //   window.location.reload();
    // }, 100);
  } catch (error) {
    logPWA('error', 'PWA update failed:', error);

    // If update fails, reload to try again
    logPWA('info', 'Reloading to retry update...');
    // setTimeout(() => {
    //   window.location.reload();
    // }, 100);
  }
};

// Alternative: Manual service worker activation (if skipWaiting is false)
export const handlePWAUpdateWithManualActivation = async (updateFunction: () => Promise<void>) => {
  try {
    logPWA('info', 'Starting PWA update process with manual activation...');

    // Check cache status before update
    await checkCacheStatus();

    // Get the current registration
    const registration = await navigator.serviceWorker.getRegistration();

    if (!registration) {
      throw new Error('No service worker registration found');
    }

    // Apply the update function first
    await updateFunction();

    // If there's a waiting service worker, manually activate it
    if (registration.waiting) {
      logPWA('info', 'Manually activating waiting service worker...');

      // Listen for the controlling service worker to change
      const controllerChangePromise = new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            logPWA('info', 'Service worker controller changed');
            resolve();
          },
          { once: true }
        );
      });

      // Send skip waiting message to the waiting service worker
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // Wait for the controller to change
      await controllerChangePromise;

      logPWA('info', 'New service worker is now in control');
    }

    logPWA('info', 'PWA update applied successfully');

    // Reload the page to use the new service worker
    // setTimeout(() => {
    //   window.location.reload();
    // }, 100);
  } catch (error) {
    logPWA('error', 'PWA update failed:', error);

    // If update fails, reload to try again
    logPWA('info', 'Reloading to retry update...');
    // setTimeout(() => {
    //   window.location.reload();
    // }, 100);
  }
};
