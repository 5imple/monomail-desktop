import { ipcMain, net, powerMonitor, WebContents, app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';

import {
  FCM_MESSAGE_RECEIVED,
  FCM_SERVICE_ERROR,
  FCM_SERVICE_STARTED,
  FCM_START_SERVICE,
  FCM_STOP_SERVICE,
  FCM_TOKEN_UPDATED
} from '@/main/api/message/types';
import { systemManager } from '@/main/services/mangers/system/SystemManager';
import {
  createFcmECDH,
  FcmClient,
  FcmClientMessageData,
  generateFcmAuthSecret,
  registerToFCM
} from '@aracna/fcm';

interface ElectronPushReceiver {
  FCM_START_SERVICE: string;
  FCM_SERVICE_STARTED: string;
  FCM_SERVICE_ERROR: string;
  FCM_MESSAGE_RECEIVED: string;
  FCM_TOKEN_UPDATED: string;
  FCM_STOP_SERVICE: string;
  setup: (webContents: WebContents) => void;
}

export const electronPushReceiver: ElectronPushReceiver = {
  FCM_START_SERVICE,
  FCM_SERVICE_STARTED,
  FCM_SERVICE_ERROR,
  FCM_MESSAGE_RECEIVED,
  FCM_TOKEN_UPDATED,
  FCM_STOP_SERVICE,
  setup
};

interface StoreSchema {
  credentials?: any; // Adjust 'any' to the specific type if known
  appID?: string;
}
const store = new Store<StoreSchema>();

let client: FcmClient | null = null;
let retryIntervalId: NodeJS.Timeout | null = null;
let healthCheckIntervalId: NodeJS.Timeout | null = null;
let lastMessageTimestamp: number = 0;
let connectionAttempts: number = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_BASE = 5000; // 5 seconds
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 120000; // 2 minutes without messages

/**
 * Configuration for FCM retry behavior and connection monitoring
 *
 * This configuration handles:
 * - Automatic reconnection with exponential backoff
 * - Health monitoring to detect stale connections
 * - Network status monitoring
 * - App focus/blur event handling
 * - System suspend/resume handling
 */
const FCM_CONFIG = {
  maxRetryAttempts: MAX_RETRY_ATTEMPTS,
  retryDelayBase: RETRY_DELAY_BASE,
  healthCheckInterval: HEALTH_CHECK_INTERVAL,
  connectionTimeout: CONNECTION_TIMEOUT,
  heartbeatFrequency: 60000, // 1 minute
  networkCheckInterval: 10000 // 10 seconds
};

// Function to calculate exponential backoff delay
function getRetryDelay(attempt: number): number {
  return Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 60000); // Max 60 seconds
}

// Function to attempt reconnection when online
async function attemptReconnect() {
  if (!client || !net.isOnline()) {
    log.info('Cannot reconnect: client not available or network offline');
    return;
  }

  if (connectionAttempts >= FCM_CONFIG.maxRetryAttempts) {
    log.error('Max reconnection attempts reached. Stopping retry attempts.');
    stopRetrying();
    return;
  }

  connectionAttempts++;
  const delay = getRetryDelay(connectionAttempts);

  log.info(
    `Attempting FCM reconnection (attempt ${connectionAttempts}/${FCM_CONFIG.maxRetryAttempts}) in ${delay}ms`
  );

  setTimeout(async () => {
    try {
      systemManager.updateTrayIcon(true);
      await client!.connect();
      log.info('FCM client reconnected successfully after network became available.');
      connectionAttempts = 0; // Reset attempts on successful connection
      stopRetrying();
      startHealthMonitoring();
    } catch (error) {
      log.error(`FCM reconnection attempt ${connectionAttempts} failed:`, error);
      if (connectionAttempts < FCM_CONFIG.maxRetryAttempts) {
        attemptReconnect(); // Continue retrying
      } else {
        log.error('Max reconnection attempts reached. Stopping retry attempts.');
        stopRetrying();
      }
    }
  }, delay);
}

// Function to start retrying reconnection when the network comes online
function startRetrying() {
  if (!retryIntervalId) {
    retryIntervalId = setInterval(() => {
      if (net.isOnline()) {
        log.info('Network is back online. Attempting FCM reconnection...');
        attemptReconnect();
      }
    }, 10000); // Retry every 10 seconds
  }
}

// Function to stop retrying once reconnected
function stopRetrying() {
  if (retryIntervalId) {
    clearInterval(retryIntervalId);
    retryIntervalId = null;
    log.info('FCM reconnection attempts stopped.');
  }
}

// Function to start health monitoring
function startHealthMonitoring() {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
  }

  healthCheckIntervalId = setInterval(() => {
    if (!client) return;

    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTimestamp;

    // If we haven't received any messages for a while and we're supposed to be connected
    if (timeSinceLastMessage > FCM_CONFIG.connectionTimeout && lastMessageTimestamp > 0) {
      log.warn(
        `No FCM messages received for ${timeSinceLastMessage}ms. Checking connection health...`
      );

      // Try to ping the connection or check if it's still alive
      checkConnectionHealth();
    }
  }, FCM_CONFIG.healthCheckInterval);

  log.info('FCM health monitoring started');
}

// Function to stop health monitoring
function stopHealthMonitoring() {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
    log.info('FCM health monitoring stopped');
  }
}

// Function to check connection health
async function checkConnectionHealth() {
  if (!client || !net.isOnline()) return;

  try {
    // Try to reconnect if we suspect the connection is dead
    log.info('FCM connection appears stale, attempting reconnection...');
    await client.disconnect();
    await client.connect();
    log.info('FCM connection health check completed successfully');
    lastMessageTimestamp = Date.now(); // Reset the timestamp
  } catch (error) {
    log.error('FCM connection health check failed:', error);
    // Start retry process
    connectionAttempts = 0;
    attemptReconnect();
  }
}

// Function to handle app focus/blur events for better connection management
function handleAppFocusChange(isFocused: boolean) {
  if (!client) return;

  if (isFocused) {
    log.info('App focused, checking FCM connection...');
    // When app comes to foreground, check if connection is still alive
    const timeSinceLastMessage = Date.now() - lastMessageTimestamp;
    if (timeSinceLastMessage > FCM_CONFIG.connectionTimeout && lastMessageTimestamp > 0) {
      log.info('App focused but FCM connection appears stale, reconnecting...');
      checkConnectionHealth();
    }
  } else {
    log.info('App blurred, continuing FCM monitoring in background...');
    // Keep the connection alive but monitor it more closely
    lastMessageTimestamp = Date.now(); // Reset timestamp to give some grace period
  }
}

// Function to handle FCM client events
function setupFcmEventHandlers(client: FcmClient) {
  client.on('message-data', (data: FcmClientMessageData) => {
    lastMessageTimestamp = Date.now();
    log.debug('FCM message received, updating timestamp');
    ipcMain.emit(FCM_MESSAGE_RECEIVED, null, data);
  });

  // Handle connection events if available
  client.on('connect', () => {
    log.info('FCM client connected');
    lastMessageTimestamp = Date.now();
    connectionAttempts = 0;
    systemManager.updateTrayIcon(true);
  });

  client.on('disconnect', () => {
    log.info('FCM client disconnected');
    systemManager.updateTrayIcon(false);
    // Start retry process if we're still online
    if (net.isOnline()) {
      connectionAttempts = 0;
      attemptReconnect();
    }
  });

  client.on('error', (error: any) => {
    log.error('FCM client error:', error);
    systemManager.updateTrayIcon(false);
    // Start retry process on error
    if (net.isOnline()) {
      connectionAttempts = 0;
      attemptReconnect();
    }
  });

  // Handle any other connection-related events that might be available
  client.on('close', () => {
    log.info('FCM client connection closed');
    systemManager.updateTrayIcon(false);
    if (net.isOnline()) {
      connectionAttempts = 0;
      attemptReconnect();
    }
  });

  // Log all available events for debugging
  log.info('FCM event handlers set up successfully');
}

// Function to cleanup FCM resources
function cleanupFcmResources() {
  stopRetrying();
  stopHealthMonitoring();

  if (client) {
    try {
      client.disconnect();
    } catch (error) {
      log.error('Error disconnecting FCM client during cleanup:', error);
    }
    client = null;
  }

  log.info('FCM resources cleaned up');
}

export async function setup(): Promise<void> {
  // Handle FCM service stop
  ipcMain.handle(FCM_STOP_SERVICE, async () => {
    log.info('Stopping FCM service...');
    cleanupFcmResources();
  });

  ipcMain.handle(
    FCM_START_SERVICE,
    async (_, appID: string, projectID: string, apiKey: string, vapidKey: string, uid: string) => {
      let credentials = store.get('credentials') as any;

      const authSecret = generateFcmAuthSecret();
      const ecdh = createFcmECDH();
      credentials = null;
      const tray = systemManager.getTray();

      try {
        [credentials] = await Promise.all([
          registerToFCM(
            {
              appID,
              ece: {
                authSecret,
                publicKey: ecdh.getPublicKey()
              },
              firebase: {
                apiKey,
                appID,
                projectID
              },
              vapidKey
            },
            {
              acg: {
                register: {
                  retry: {
                    delay: 3000
                  }
                }
              }
            }
          )
        ]).catch((error) => {
          log.error('Messaging::Registration error: ' + (error as Error).message);
          throw error;
        });

        if (!credentials || !credentials.token) {
          log.error('Messaging::Registration failed - No token received.');
          throw new Error('Messaging::Registration failed - No token received.');
        }

        const credentialsStringify = { ...credentials };
        credentialsStringify.acg.id = credentialsStringify.acg.id.toString();
        credentialsStringify.acg.securityToken = credentialsStringify.acg.securityToken.toString();
        store.set('credentials', credentialsStringify);
        store.set('appID', appID);

        ipcMain.emit(FCM_TOKEN_UPDATED, _, uid, credentials.token);

        credentials.acg.id = BigInt(credentials.acg.id);
        credentials.acg.securityToken = BigInt(credentials.acg.securityToken);

        client = new FcmClient({
          acg: credentials.acg,
          ece: {
            authSecret,
            privateKey: ecdh.getPrivateKey()
          },
          heartbeat: { frequency: FCM_CONFIG.heartbeatFrequency }
        });

        // Setup comprehensive event handlers
        setupFcmEventHandlers(client);

        const checkNetworkStatus = () => {
          const isOnline = net.isOnline();
          systemManager.updateTrayIcon(isOnline);
          if (!isOnline && client) {
            client.disconnect();
          }
        };

        const startNetworkMonitoring = (interval = FCM_CONFIG.networkCheckInterval) => {
          checkNetworkStatus(); // Initial check
          setInterval(() => {
            checkNetworkStatus();
          }, interval);
        };

        startNetworkMonitoring();

        if (net.isOnline()) {
          await client.connect();
          systemManager.updateTrayIcon(true);
          log.debug('Messaging client connected.');
          startHealthMonitoring();
        } else {
          systemManager.updateTrayIcon(false);
          log.debug('Network is offline. Waiting for reconnection...');
          startRetrying();
        }

        ipcMain.emit(FCM_SERVICE_STARTED, _, credentials.token, uid);

        // Handle app focus/blur events
        app.on('browser-window-focus', () => {
          handleAppFocusChange(true);
        });

        app.on('browser-window-blur', () => {
          handleAppFocusChange(false);
        });

        // Handle system suspend (sleep)
        powerMonitor.on('suspend', async () => {
          log.debug('System is going to sleep...');
          try {
            stopHealthMonitoring();
            if (client) {
              await client.disconnect();
            }
            log.debug('Messaging client disconnected during suspend.');
          } catch (error) {
            log.error('Error disconnecting FCM client:', error);
          }
        });

        // Handle system resume (wake up)
        powerMonitor.on('resume', async () => {
          log.debug('System resumed. Checking network connectivity...');
          if (net.isOnline()) {
            if (tray) {
              systemManager.updateTrayIcon(true);
            }
            if (client) {
              await client.connect();
              startHealthMonitoring();
            }
            log.debug('Messaging client reconnected after resume.');
          } else {
            if (tray) {
              systemManager.updateTrayIcon(false);
            }
            log.debug('Network is offline after resume. Starting reconnection attempts...');
            startRetrying();
          }
        });
      } catch (e) {
        log.error('MESSAGE_RECEIVER:::Error while starting the service: ' + (e as Error).message);
        ipcMain.emit(FCM_SERVICE_ERROR, _, (e as Error).message);
      }
    }
  );
}

export default electronPushReceiver;
