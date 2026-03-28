// Enhanced worker with pause/resume functionality

import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { convertToAccurateQuery } from '@/renderer/app/lib/convertToAccurateQuery';
import { parseQueryFieldLabel } from '@/renderer/app/lib/queryUtils';
import { DBSaveSyncHistoryMeta } from '@/renderer/app/lib/db/history';
import { DBSaveThreads, ValidLabel, validLabels } from '@/renderer/app/lib/db/thread';
import { SplitCategoryPreferences } from '@/main/api/auth/types';

export type UserPlan = 'free' | 'plus' | 'plus_onetime' | 'pro';

interface SyncWorkerMessage {
  type:
    | 'SYNC_START'
    | 'SYNC_PROGRESS'
    | 'SYNC_COMPLETE'
    | 'SYNC_ERROR'
    | 'SYNC_ABORT'
    | 'SYNC_PAUSE'
    | 'SYNC_RESUME'
    | 'SYNC_PAUSED'
    | 'SYNC_RESUMED';
  payload?: any;
}

interface SyncRequest {
  uid: string;
  requestId: string;
  idToken: string;
  query: string;
  nextPageToken?: string;
  interval?: number;
  shouldPause?: boolean;
  userPlan?: UserPlan;
  categoryPreferences?: SplitCategoryPreferences;
}

// Track active sync operations, their pause state, and timeout IDs
const activeSyncs = new Map<string, AbortController>();
const activeRequests = new Map<string, SyncRequest>(); // Store active request data
const pausedSyncs = new Map<
  string,
  {
    request: SyncRequest;
    currentRetries: number;
  }
>();
const activeTimeouts = new Map<string, NodeJS.Timeout>();

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
    case 'SYNC_PAUSE':
      handleSyncPause(payload.requestId);
      break;
    case 'SYNC_RESUME':
      handleSyncResume(payload.requestId);
      break;
  }
});

async function handleSyncStart(request: SyncRequest) {
  const {
    uid,
    requestId,
    idToken,
    query,
    nextPageToken,
    interval = 10000,
    shouldPause = false,
    userPlan = 'free',
    categoryPreferences = {
      showUpdates: true,
      showSocial: true,
      showPromotions: true,
      showForums: true
    }
  } = request;

  // Create abort controller for this sync
  const abortController = new AbortController();
  activeSyncs.set(requestId, abortController);

  console.log(`active requests set for ${requestId}:`, request);
  // Store the request data for potential pause operations
  activeRequests.set(requestId, request);

  try {
    // Initialize API client with authentication token in worker context
    apiClient.setApiActiveUid(uid);
    apiClient.setApiClientIdToken(idToken);

    // Validate query before starting sync
    if (!isValidQuery(query)) {
      postMessage({
        type: 'SYNC_ERROR',
        payload: {
          requestId,
          status: 400,
          error: 'Invalid query format'
        }
      });
      return;
    }

    await syncThreadsWithPagination(
      uid,
      idToken,
      requestId,
      query,
      nextPageToken,
      interval,
      abortController,
      3, // retries
      userPlan,
      categoryPreferences
    );
  } catch (error) {
    postMessage({
      type: 'SYNC_ERROR',
      payload: {
        requestId,
        status: 500,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

function handleSyncAbort(requestId: string) {
  const controller = activeSyncs.get(requestId);
  if (controller) {
    controller.abort();
    activeSyncs.delete(requestId);
  }

  // Clear any pending timeouts
  const timeoutId = activeTimeouts.get(requestId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    activeTimeouts.delete(requestId);
  }

  // Clean up all tracking data
  activeRequests.delete(requestId);
  pausedSyncs.delete(requestId);
}

function handleSyncPause(requestId: string) {
  const controller = activeSyncs.get(requestId);
  if (controller) {
    // Abort the current HTTP request
    controller.abort();
    activeSyncs.delete(requestId);
  }

  // Clear any pending timeouts to stop the loop
  const timeoutId = activeTimeouts.get(requestId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    activeTimeouts.delete(requestId);
  }

  // Get the stored request data
  const request = activeRequests.get(requestId);
  if (request) {
    pausedSyncs.set(requestId, {
      request,
      currentRetries: 3
    });
  }

  postMessage({
    type: 'SYNC_PAUSED',
    payload: { requestId }
  });
}

function handleSyncResume(requestId: string) {
  const pausedSync = pausedSyncs.get(requestId);
  if (pausedSync) {
    console.log(`Resuming sync for ${requestId}:`, pausedSync);

    const { request, currentRetries } = pausedSync;

    // Create new abort controller for the resumed sync
    const abortController = new AbortController();
    activeSyncs.set(requestId, abortController);
    console.log(`active sync set for ${request.requestId}`);

    // Restore the request data for tracking
    activeRequests.set(requestId, request);
    console.log(`active requests set for ${request.requestId}`);

    // Clear any existing timeout for this request
    const existingTimeout = activeTimeouts.get(requestId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      activeTimeouts.delete(requestId);
    }

    // Set new timeout and track it
    const timeoutId = setTimeout(() => {
      // Remove the timeout from tracking since it's about to execute
      activeTimeouts.delete(requestId);

      // Resume the sync from where it left off
      syncThreadsWithPagination(
        request.uid,
        request.idToken,
        request.requestId,
        request.query,
        request.nextPageToken,
        request.interval || 10000,
        abortController,
        currentRetries,
        request.userPlan || 'free',
        request.categoryPreferences || {
          showUpdates: true,
          showSocial: true,
          showPromotions: true,
          showForums: true
        }
      );
    }, request.interval || 10000);

    // Track the new timeout
    activeTimeouts.set(requestId, timeoutId);

    // Remove from paused syncs since it's now active again
    pausedSyncs.delete(requestId);

    postMessage({
      type: 'SYNC_RESUMED',
      payload: { requestId }
    });
  } else {
    console.warn(`No paused sync found for requestId: ${requestId}`);
    console.log('Current paused syncs:', Array.from(pausedSyncs.keys()));
  }
}

function isValidQuery(query: string): boolean {
  const { field, label } = parseQueryFieldLabel(query, true);
  return (
    (field === 'in' || field === 'is' || field === 'category') &&
    (validLabels.includes(label?.toUpperCase() as ValidLabel) || label?.toLowerCase() === 'all')
  );
}

function isThreadOver365Days(timestamp: number): boolean {
  const now = Date.now();
  const threadAge = now - timestamp;
  const days365InMs = 365 * 24 * 60 * 60 * 1000; // 365 days in milliseconds
  return threadAge > days365InMs;
}

function isThreadOver15Days(timestamp: number): boolean {
  const now = Date.now();
  const threadAge = now - timestamp;
  const days15InMs = 15 * 24 * 60 * 60 * 1000; // 15 days in milliseconds
  return threadAge > days15InMs;
}

function shouldLimitSyncFor365Days(userPlan: UserPlan): boolean {
  return userPlan === 'free';
}

function shouldLimitSyncFor15Days(userPlan: UserPlan): boolean {
  return userPlan === 'free';
}

async function syncThreadsWithPagination(
  uid: string,
  idToken: string,
  requestId: string,
  query: string,
  nextPageToken: string | undefined,
  interval: number,
  abortController: AbortController,
  retries: number = 3,
  userPlan: UserPlan = 'free',
  categoryPreferences: SplitCategoryPreferences = {
    showUpdates: true,
    showSocial: true,
    showPromotions: true,
    showForums: true
  }
) {
  if (!uid || !idToken || abortController.signal.aborted || !activeSyncs.get(requestId)) return;

  try {
    // Update sync metadata with current query
    await DBSaveSyncHistoryMeta(uid, {
      lastSyncQuery: query,
      lastUpdatedAt: Date.now()
    });

    const q = convertToAccurateQuery(query, categoryPreferences);

    const threadResponse = await mailApi.getThreads(
      uid,
      q,
      nextPageToken,
      '25',
      abortController.signal,
      idToken
    );

    // If request is aborted during this process, do not proceed
    // Before returning, save the current state to pausedSyncs if this was a pause operation
    const pausedSync = pausedSyncs.get(requestId);
    if (pausedSync) {
      // Update the paused sync with current pagination state
      // pausedSync.nextPageToken = nextPageToken;
      pausedSync.currentRetries = retries;
      console.log(`Saved pause state for ${requestId}:`, pausedSync);
      return;
    }

    const threads = threadResponse.threads.map((thread) => MonoThread.fromPlainObject(thread));

    // Check if sync should stop for no_sub users when first thread is over 15 days
    if (shouldLimitSyncFor15Days(userPlan) && threads.length > 0) {
      const firstThread = threads[0]; // Threads are typically ordered by date (newest first)

      if (isThreadOver15Days(firstThread.timestamp)) {
        console.log(`Sync stopped for user ${uid} - first thread is over 15 days old`);

        // Save the threads we already have
        await DBSaveThreads(uid, threads);

        // Update sync metadata
        if (threads.length > 0 && threads[0].historyId) {
          await DBSaveSyncHistoryMeta(uid, {
            historyId: threads[0].historyId,
            lastUpdatedAt: Date.now()
          });
        }

        // Send completion message with special flag indicating limit reached
        activeSyncs.delete(requestId);
        activeRequests.delete(requestId);
        activeTimeouts.delete(requestId);
        postMessage({
          type: 'SYNC_COMPLETE',
          payload: {
            requestId,
            success: true,
            lastSyncTime: Date.now(),
            finalThreadsCount: threads.length,
            limitReached: true,
            limitReason: '15_day_limit'
          }
        });
        return;
      }
    }

    // Check if sync should stop for no_sub or basic users when first thread is over 365 days
    if (shouldLimitSyncFor365Days(userPlan) && threads.length > 0) {
      const firstThread = threads[0]; // Threads are typically ordered by date (newest first)

      if (isThreadOver365Days(firstThread.timestamp)) {
        console.log(`Sync stopped for user ${uid} - first thread is over 365 days old`);

        // Save the threads we already have
        await DBSaveThreads(uid, threads);

        // Update sync metadata
        if (threads.length > 0 && threads[0].historyId) {
          await DBSaveSyncHistoryMeta(uid, {
            historyId: threads[0].historyId,
            lastUpdatedAt: Date.now()
          });
        }

        // Send completion message with special flag indicating limit reached
        activeSyncs.delete(requestId);
        activeRequests.delete(requestId);
        activeTimeouts.delete(requestId);
        postMessage({
          type: 'SYNC_COMPLETE',
          payload: {
            requestId,
            success: true,
            lastSyncTime: Date.now(),
            finalThreadsCount: threads.length,
            limitReached: true,
            limitReason: '365_day_limit'
          }
        });
        return;
      }
    }

    // Save the threads to the database
    await DBSaveThreads(uid, threads);

    // If we have threads, update the historyId from the first thread (most recent)
    if (threads.length > 0 && threads[0].historyId) {
      await DBSaveSyncHistoryMeta(uid, {
        historyId: threads[0].historyId,
        lastUpdatedAt: Date.now()
      });
    }

    // Send progress update
    postMessage({
      type: 'SYNC_PROGRESS',
      payload: {
        requestId,
        threadsCount: threads.length,
        hasMore: !!threadResponse.nextPageToken,
        nextPageToken: threadResponse.nextPageToken
      }
    });

    // Continue pagination if we have more
    if (threadResponse.nextPageToken && !abortController.signal.aborted) {
      // Store the timeout ID so we can cancel it if needed
      const timeoutId = setTimeout(() => {
        // Remove the timeout from tracking since it's about to execute
        activeTimeouts.delete(requestId);

        syncThreadsWithPagination(
          uid,
          idToken,
          requestId,
          query,
          threadResponse.nextPageToken,
          interval,
          abortController,
          retries,
          userPlan,
          categoryPreferences
        );
      }, interval);

      // Track this timeout so we can cancel it during pause/abort
      activeTimeouts.set(requestId, timeoutId);
    } else {
      // Send completion message
      if (!abortController.signal.aborted) {
        activeSyncs.delete(requestId);
        activeRequests.delete(requestId); // Clean up request tracking
        activeTimeouts.delete(requestId); // Clean up any timeout tracking
        postMessage({
          type: 'SYNC_COMPLETE',
          payload: {
            requestId,
            success: true,
            lastSyncTime: Date.now(),
            finalThreadsCount: threads.length
          }
        });
      }
    }
  } catch (error: any) {
    if (!abortController.signal.aborted) {
      const statusCode = error?.status || 500;
      let shouldRetry = false;

      switch (statusCode) {
        case 401:
          console.error(`Account ${uid} - Access Token Error (401):`, error);
          if (retries > 0) {
            shouldRetry = true;
          }
          break;
        case 402:
          console.error(`Account ${uid} - Payment Required (402):`, error);
          break;
        case 400:
          console.error(`Account ${uid} - Next Page Token Error (400):`, error);
          if (retries > 0) {
            shouldRetry = true;
          }
          break;
        case 429:
          console.error(`Account ${uid} - Too Many Requests Error (429), retrying...`);
          if (retries > 0) {
            shouldRetry = true;
          }
          break;
        case 500:
        default:
          console.error(`Account ${uid} - Server Error (500 or other):`, error);
          break;
      }

      if (shouldRetry && retries > 0) {
        const timeoutId = setTimeout(() => {
          // Remove the timeout from tracking since it's about to execute
          activeTimeouts.delete(requestId);

          syncThreadsWithPagination(
            uid,
            idToken,
            requestId,
            query,
            nextPageToken,
            interval,
            abortController,
            retries - 1,
            userPlan,
            categoryPreferences
          );
        }, interval);

        // Track this timeout so we can cancel it during pause/abort
        activeTimeouts.set(requestId, timeoutId);
      } else {
        activeSyncs.delete(requestId);
        activeRequests.delete(requestId); // Clean up request tracking
        activeTimeouts.delete(requestId); // Clean up any timeout tracking
        postMessage({
          type: 'SYNC_ERROR',
          payload: {
            requestId,
            status: statusCode,
            error: error.message || 'Sync failed',
            shouldRetry: false,
            nextPageToken
          }
        });
      }
    } else {
      // If aborted and this was a pause, save the error state for resume
      if (pausedSyncs.has(requestId)) {
        const pausedSync = pausedSyncs.get(requestId);
        if (pausedSync) {
          pausedSync.request.nextPageToken = nextPageToken;
          pausedSync.currentRetries = Math.max(0, retries - 1);
        }
      }
    }
  }
}
