import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { GmailHistory } from '@/main/api/gmail/types';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { UpdateType } from '@/renderer/app/context/MessageContext';
import { DBGetSyncHistoryMeta, DBSaveSyncHistoryMeta } from '@/renderer/app/lib/db/history';
import {
  DBGetMessage,
  DBRemoveMessage,
  DBSaveMessage,
  DBUpdateMessageLabels,
  DBUpsertMessage
} from '@/renderer/app/lib/db/message';
import { DBGetLatestThread } from '@/renderer/app/lib/db/thread';
import {
  getOutlookWatermark,
  saveOutlookWatermark,
  clearOutlookWatermark
} from '@/renderer/app/lib/db/outlookWatermark';

// Enhanced message types with authentication
interface SyncWorkerMessage {
  type: 'SYNC_START' | 'SYNC_PROGRESS' | 'SYNC_COMPLETE' | 'SYNC_ERROR' | 'SYNC_ABORT';
  payload?: any;
}

interface SyncRequest {
  uid: string;
  requestId: string;
  idToken: string;
  provider: 'google' | 'microsoft';
}

interface SyncProgress {
  requestId: string;
  progress: number;
  changedThreadIds: UpdateType[];
}

interface SyncComplete {
  requestId: string;
  success: boolean;
  lastSyncTime: number;
}

interface SyncError {
  requestId: string;
  status: number;
  error: string;
}

// Track active sync operations
const activeSyncs = new Map<string, AbortController>();

// Listen for messages from main thread
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SYNC_START':
      await handleSyncStart(payload as SyncRequest);
      break;
    case 'SYNC_ABORT':
      handleSyncAbort(payload.requestId);
      break;
  }
});

async function handleSyncStart(request: SyncRequest) {
  const { uid, requestId, idToken, provider } = request;

  // Create abort controller for this sync
  const abortController = new AbortController();
  activeSyncs.set(requestId, abortController);

  try {
    // Initialize API client with authentication token in worker context
    await initializeApiClient(uid, idToken);

    await syncThreadHistory(uid, requestId, abortController, provider);
  } catch (error) {
    postMessage({
      type: 'SYNC_ERROR',
      payload: {
        requestId,
        status: 500,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as SyncError
    });
  } finally {
    activeSyncs.delete(requestId);
  }
}

// Initialize API client with authentication
async function initializeApiClient(uid: string, idToken: string) {
  try {
    // Set the bearer token for API calls
    apiClient.setApiActiveUid(uid);
    apiClient.setApiClientIdToken(idToken);

    console.log(`API client initialized for uid: ${uid}`);
  } catch (error) {
    console.error('Failed to initialize API client:', error);
    throw error;
  }
}

function handleSyncAbort(requestId: string) {
  const controller = activeSyncs.get(requestId);
  if (controller) {
    controller.abort();
    activeSyncs.delete(requestId);
  }
}

async function syncThreadHistory(
  uid: string,
  requestId: string,
  abortController: AbortController,
  provider: 'google' | 'microsoft' = 'google'
) {
  if (!uid) {
    postMessage({
      type: 'SYNC_COMPLETE',
      payload: { requestId, success: true, lastSyncTime: Date.now() } as SyncComplete
    });
    return;
  }

  try {
    if (provider === 'microsoft') {
      // Outlook History Sync Flow
      await syncOutlookHistory(uid, requestId, abortController);
    } else {
      // Gmail History Sync Flow (default)
      await syncGmailHistory(uid, requestId, abortController);
    }
  } catch (error: any) {
    console.error(`Error initializing thread history sync for account ${uid}:`, error);

    if (!abortController.signal.aborted) {
      postMessage({
        type: 'SYNC_ERROR',
        payload: {
          requestId,
          status: error?.status || 500,
          error: error.message || 'Sync failed'
        } as SyncError
      });
    }
  }
}

/**
 * Gmail History Sync - Uses historyId from latest thread as baseline
 */
async function syncGmailHistory(uid: string, requestId: string, abortController: AbortController) {
  // Get stored historyId first from our syncHistoryMeta store
  const syncHistoryMeta = await DBGetSyncHistoryMeta(uid);
  let historyId = syncHistoryMeta?.historyId || null;

  // If we don't have a stored historyId, get it from the latest thread
  if (!historyId) {
    historyId = await getHistoryIdFromLatestThread(uid);

    // If we couldn't get a historyId, need a full sync
    if (!historyId) {
      postMessage({
        type: 'SYNC_ERROR',
        payload: { requestId, status: 404, error: 'Need full sync' } as SyncError
      });
      return;
    }
  }

  if (historyId && !abortController.signal.aborted) {
    await fetchHistory(uid, historyId, requestId, abortController);
  } else {
    // No historyId available, need a full sync
    postMessage({
      type: 'SYNC_ERROR',
      payload: { requestId, status: 404, error: 'Need full sync' } as SyncError
    });
  }
}

/**
 * Outlook History Sync - Uses server-issued watermark stored in localStorage
 */
async function syncOutlookHistory(
  uid: string,
  requestId: string,
  abortController: AbortController
) {
  try {
    // Get the cached watermark for this Outlook account
    const watermark = await getOutlookWatermark(uid);
    const historyId = watermark?.historyId || null;

    console.log(
      `Starting Outlook history sync for account ${uid}, watermark: ${historyId || 'none'}`
    );

    // Call the history API with the cached historyId (or null for initial sync)
    await fetchOutlookHistory(uid, historyId, requestId, abortController);
  } catch (error: any) {
    console.error(`Error in Outlook history sync for account ${uid}:`, error);

    if (!abortController.signal.aborted) {
      postMessage({
        type: 'SYNC_ERROR',
        payload: {
          requestId,
          status: error?.status || 500,
          error: error.message || 'Outlook sync failed'
        } as SyncError
      });
    }
  }
}

async function fetchHistory(
  uid: string,
  historyId: string,
  requestId: string,
  abortController: AbortController,
  retries = 3
) {
  if (abortController.signal.aborted) return;

  try {
    let nextPageToken: string | undefined;

    do {
      if (abortController.signal.aborted) return;

      const historyResponse = await mailApi.getHistoryList(uid, historyId, nextPageToken);

      if (abortController.signal.aborted) return;

      if (historyResponse.history && historyResponse.history.length > 0) {
        const changes = await processHistoryItems(uid, historyResponse.history);

        // Send progress update with changes
        postMessage({
          type: 'SYNC_PROGRESS',
          payload: {
            requestId,
            progress: 1, // Can be enhanced to track actual progress
            changedThreadIds: changes
          } as SyncProgress
        });
      }

      // Update our stored historyId
      if (historyResponse.historyId) {
        historyId = historyResponse.historyId;
        await DBSaveSyncHistoryMeta(uid, {
          historyId: historyResponse.historyId,
          lastUpdatedAt: Date.now()
        });
      }

      nextPageToken = historyResponse.nextPageToken;
    } while (nextPageToken && !abortController.signal.aborted);

    // Update sync state on successful completion
    const currentTime = Date.now();
    postMessage({
      type: 'SYNC_COMPLETE',
      payload: {
        requestId,
        success: true,
        lastSyncTime: currentTime
      } as SyncComplete
    });
  } catch (error: any) {
    if (abortController.signal.aborted) return;

    const statusCode = error?.status || 500;

    // Handle 404 error (historyId too old) by trying to get a fresh historyId
    if (statusCode === 404) {
      console.warn(`HistoryId too old for account ${uid}, getting fresh historyId`);

      // Try to get a fresh historyId from the latest thread
      const freshHistoryId = await getHistoryIdFromLatestThread(uid);

      if (freshHistoryId) {
        console.log(`Got fresh historyId ${freshHistoryId}, trying sync again`);

        // Try the sync again with the fresh historyId
        if (!abortController.signal.aborted) {
          await fetchHistory(uid, freshHistoryId, requestId, abortController, retries);
        }
      } else {
        console.error(`Could not get fresh historyId for account ${uid}, need full sync`);

        // Clear the stored historyId to force a full sync next time
        await DBSaveSyncHistoryMeta(uid, {
          historyId: '',
          lastUpdatedAt: Date.now()
        });

        // Let the app know we need a full sync
        postMessage({
          type: 'SYNC_ERROR',
          payload: { requestId, status: 404, error: 'Need full sync' } as SyncError
        });
      }
      return;
    }

    if (retries > 0) {
      await fetchHistory(uid, historyId, requestId, abortController, retries - 1);
    } else {
      console.error(`Error syncing thread history for account ${uid} after retries:`, error);

      postMessage({
        type: 'SYNC_ERROR',
        payload: {
          requestId,
          status: statusCode,
          error: error.message || 'Sync failed after retries'
        } as SyncError
      });
    }
  }
}

/**
 * Fetch Outlook history with watermark-based sync
 */
async function fetchOutlookHistory(
  uid: string,
  historyId: string | null,
  requestId: string,
  abortController: AbortController,
  retries = 3
) {
  try {
    let nextPageToken: string | undefined;

    do {
      if (abortController.signal.aborted) return;

      // For Outlook, we pass the historyId as a parameter, even if null (for initial sync)
      const params = new URLSearchParams();
      if (historyId) {
        params.append('historyId', historyId);
      }
      if (nextPageToken) {
        params.append('pageToken', nextPageToken);
      }

      const historyResponse = await mailApi.getHistoryList(uid, historyId || '', nextPageToken);

      if (abortController.signal.aborted) return;

      if (historyResponse.history && historyResponse.history.length > 0) {
        const changes = await processOutlookHistoryItems(uid, historyResponse.history);

        // Send progress update with changes
        postMessage({
          type: 'SYNC_PROGRESS',
          payload: {
            requestId,
            progress: 1, // Can be enhanced to track actual progress
            changedThreadIds: changes
          } as SyncProgress
        });
      }

      // CRITICAL: Always update the Outlook watermark after every successful call
      if (historyResponse.historyId) {
        await saveOutlookWatermark(uid, historyResponse.historyId);
        console.log(`Updated Outlook watermark for account ${uid}: ${historyResponse.historyId}`);
      }

      nextPageToken = historyResponse.nextPageToken;
    } while (nextPageToken && !abortController.signal.aborted);

    // Update sync state on successful completion
    const currentTime = Date.now();
    postMessage({
      type: 'SYNC_COMPLETE',
      payload: {
        requestId,
        success: true,
        lastSyncTime: currentTime
      } as SyncComplete
    });
  } catch (error: any) {
    if (abortController.signal.aborted) return;

    const statusCode = error?.status || 500;

    // Handle 404 error (historyId too old) by clearing the watermark and forcing initial sync
    if (statusCode === 404) {
      console.warn(
        `Outlook historyId too old for account ${uid}, clearing watermark for fresh sync`
      );

      // Clear the stored watermark to force an initial sync next time
      await clearOutlookWatermark(uid);

      // Let the app know we need a full sync
      postMessage({
        type: 'SYNC_ERROR',
        payload: { requestId, status: 404, error: 'Need full sync' } as SyncError
      });
      return;
    }

    if (retries > 0) {
      await fetchOutlookHistory(uid, historyId, requestId, abortController, retries - 1);
    } else {
      console.error(`Error syncing Outlook history for account ${uid} after retries:`, error);

      postMessage({
        type: 'SYNC_ERROR',
        payload: {
          requestId,
          status: statusCode,
          error: error.message || 'Outlook sync failed after retries'
        } as SyncError
      });
    }
  }
}

// Gmail-specific history processing
async function processHistoryItems(uid: string, history: GmailHistory[]): Promise<UpdateType[]> {
  const result = await history.reduce(
    async (prev, historyItem) => {
      const { messagesAdded, messagesDeleted, labelsAdded, labelsRemoved } = historyItem;

      const added = await messagesAdded.reduce(
        async (p, added) => {
          try {
            const messageResponse = await mailApi.getMessage(uid, added.id);
            if (messageResponse) {
              const message = MonoMessage.fromGmailMessage(messageResponse);

              if (!message.labelIds.includes('DRAFT')) {
                await DBSaveMessage(uid, message);

                return (await p).concat({
                  type: 'added',
                  threadId: messageResponse.threadId,
                  accountId: uid
                  // labelIds: messageResponse.labelIds // Include full labels for category detection
                });
              }
            }
          } catch (error) {
            console.error('Error processing added message:', error);
          }

          return await p;
        },
        Promise.resolve([] as UpdateType[])
      );

      const deleted = await messagesDeleted.reduce(
        async (p, deleted) => {
          try {
            const message = await DBGetMessage(uid, deleted.id);
            if (message) {
              await DBRemoveMessage(uid, deleted.id);
              return (await p).concat({
                type: 'removed',
                threadId: deleted.threadId,
                accountId: uid
              });
            }
          } catch (error) {
            console.error('Error processing deleted message:', error);
          }
          return await p;
        },
        Promise.resolve([] as UpdateType[])
      );

      const labelChanges = await Promise.all([
        ...labelsAdded.map(async (added) => {
          try {
            // Since we're focusing on thread-level updates, just get the message
            const messageId = added.id;
            const threadId = added.threadId;
            const message = await DBGetMessage(uid, messageId);

            // If the message exists, we can update it directly
            if (message) {
              await DBUpdateMessageLabels(uid, messageId, added.labelIds, []);
              return {
                type: 'updated',
                threadId: threadId,
                accountId: uid
                // labelIds: added.labelIds // Include labels for category detection
              } as UpdateType;
            } else {
              // If the message doesn't exist, try to fetch it
              const fetchedMessage = await mailApi.getMessage(uid, messageId);
              if (fetchedMessage) {
                const newMessage = MonoMessage.fromGmailMessage(fetchedMessage);
                await DBSaveMessage(uid, newMessage);
                return {
                  type: 'updated',
                  threadId: fetchedMessage.threadId,
                  accountId: uid
                  // labelIds: fetchedMessage.labelIds
                } as UpdateType;
              }
            }
          } catch (error) {
            console.error('Error processing label addition:', error);
          }
          return null;
        }),
        ...labelsRemoved.map(async (removed) => {
          try {
            // Since we're focusing on thread-level updates, just get the message
            const messageId = removed.id;
            const threadId = removed.threadId;
            const message = await DBGetMessage(uid, messageId);

            // If the message exists, we can update it directly
            if (message) {
              await DBUpdateMessageLabels(uid, messageId, [], removed.labelIds);
              return {
                type: 'updated',
                threadId: threadId,
                accountId: uid
                // labelIds: removed.labelIds // Include labels for category detection
              } as UpdateType;
            } else {
              // If the message doesn't exist, try to fetch it
              const fetchedMessage = await mailApi.getMessage(uid, messageId);
              if (fetchedMessage) {
                const newMessage = MonoMessage.fromGmailMessage(fetchedMessage);
                await DBSaveMessage(uid, newMessage);
                return {
                  type: 'updated',
                  threadId: fetchedMessage.threadId,
                  accountId: uid
                  // labelIds: fetchedMessage.labelIds
                } as UpdateType;
              }
            }
          } catch (error) {
            console.error('Error processing label removal:', error);
          }
          return null;
        })
      ]);

      const validLabelChanges = labelChanges.filter(
        (change): change is UpdateType => change !== null
      );

      return (await prev).concat(added, deleted, validLabelChanges);
    },
    Promise.resolve([] as UpdateType[])
  );

  return result;
}

// Outlook-specific history processing - uses upsert for all messages
async function processOutlookHistoryItems(uid: string, history: GmailHistory[]): Promise<UpdateType[]> {
  const result = await history.reduce(
    async (prev, historyItem) => {
      const { messagesAdded, messagesDeleted, labelsAdded, labelsRemoved } = historyItem;

      const added = await messagesAdded.reduce(
        async (p, added) => {
          try {
            const messageResponse = await mailApi.getMessage(uid, added.id);
            if (messageResponse) {
              const message = MonoMessage.fromGmailMessage(messageResponse);

              if (!message.labelIds.includes('DRAFT')) {
                // Use upsert instead of save for Outlook - handles both add and update cases
                await DBUpsertMessage(uid, message);

                return (await p).concat({
                  type: 'updated', // Always treat as updated for Outlook
                  threadId: messageResponse.threadId,
                  accountId: uid
                });
              }
            }
          } catch (error) {
            console.error('Error processing Outlook message:', error);
          }

          return await p;
        },
        Promise.resolve([] as UpdateType[])
      );

      const deleted = await messagesDeleted.reduce(
        async (p, deleted) => {
          try {
            const message = await DBGetMessage(uid, deleted.id);
            if (message) {
              await DBRemoveMessage(uid, deleted.id);
              return (await p).concat({
                type: 'removed',
                threadId: deleted.threadId,
                accountId: uid
              });
            }
          } catch (error) {
            console.error('Error processing deleted Outlook message:', error);
          }
          return await p;
        },
        Promise.resolve([] as UpdateType[])
      );

      const labelChanges = await Promise.all([
        ...labelsAdded.map(async (added) => {
          try {
            const messageId = added.id;
            const threadId = added.threadId;
            const message = await DBGetMessage(uid, messageId);

            if (message) {
              await DBUpdateMessageLabels(uid, messageId, added.labelIds, []);
              return {
                type: 'updated',
                threadId: threadId,
                accountId: uid
              } as UpdateType;
            } else {
              const fetchedMessage = await mailApi.getMessage(uid, messageId);
              if (fetchedMessage) {
                const newMessage = MonoMessage.fromGmailMessage(fetchedMessage);
                // Use upsert for Outlook
                await DBUpsertMessage(uid, newMessage);
                return {
                  type: 'updated',
                  threadId: fetchedMessage.threadId,
                  accountId: uid
                } as UpdateType;
              }
            }
          } catch (error) {
            console.error('Error processing Outlook label addition:', error);
          }
          return null;
        }),
        ...labelsRemoved.map(async (removed) => {
          try {
            const messageId = removed.id;
            const threadId = removed.threadId;
            const message = await DBGetMessage(uid, messageId);

            if (message) {
              await DBUpdateMessageLabels(uid, messageId, [], removed.labelIds);
              return {
                type: 'updated',
                threadId: threadId,
                accountId: uid
              } as UpdateType;
            } else {
              const fetchedMessage = await mailApi.getMessage(uid, messageId);
              if (fetchedMessage) {
                const newMessage = MonoMessage.fromGmailMessage(fetchedMessage);
                // Use upsert for Outlook
                await DBUpsertMessage(uid, newMessage);
                return {
                  type: 'updated',
                  threadId: fetchedMessage.threadId,
                  accountId: uid
                } as UpdateType;
              }
            }
          } catch (error) {
            console.error('Error processing Outlook label removal:', error);
          }
          return null;
        })
      ]);

      const validLabelChanges = labelChanges.filter(
        (change): change is UpdateType => change !== null
      );

      return (await prev).concat(added, deleted, validLabelChanges);
    },
    Promise.resolve([] as UpdateType[])
  );

  return result;
}

async function getHistoryIdFromLatestThread(uid: string): Promise<string | null> {
  try {
    // Get the latest thread from database
    const latestThread = await DBGetLatestThread(uid);

    if (!latestThread) {
      console.warn(`No latest thread found for account ${uid}`);
      return null;
    }

    // Fetch the thread from Gmail API to get fresh historyId
    // Use unified mail endpoint if available; fallback happens within client
    const threadResponse = await mailApi.getThread(uid, latestThread.id);

    if (threadResponse && (threadResponse as any).historyId) {
      // Save this fresh historyId for future use
      await DBSaveSyncHistoryMeta(uid, {
        historyId: (threadResponse as any).historyId,
        lastUpdatedAt: Date.now()
      });

      console.log(
        `Retrieved fresh historyId ${(threadResponse as any).historyId} from thread ${latestThread.id}`
      );
      return threadResponse.historyId;
    } else {
      console.warn(`Could not get historyId from thread ${latestThread.id}`);
      return null;
    }
  } catch (error) {
    console.error(`Error getting historyId from latest thread for account ${uid}:`, error);
    return null;
  }
}
