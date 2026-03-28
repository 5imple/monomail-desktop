import { atom, useAtom } from 'jotai';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef
} from 'react';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import useWindowFocus from '@/renderer/app/hooks/useWindowFocus';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { ValidLabel, validLabels } from '@/renderer/app/lib/db/thread';
import { parseQueryFieldLabel } from '@/renderer/app/lib/queryUtils';

export const tokenCacheAtom = atom<Record<string, Record<string, string>>>({});

export const syncThreadStateAtom = atom<
  Record<
    string,
    {
      isSyncing: boolean;
      syncComplete: boolean;
      lastSyncTime?: number;
      progress?: number;
      threadsCount?: number;
    }
  >
>({});

interface SyncThreadContextType {
  syncThreads: (
    uid: string,
    subscriptionTrigger?: () => void,
    onError?: (status: number) => void,
    interval?: number
  ) => Promise<void>;
  abortSync: (accountIds?: string[]) => void;
  exitWorker: () => void;
  cleanupSync: () => void;
  updateTokenCache: (uid: string, query: string, token: string | null) => void;
  syncState: Record<
    string,
    {
      isSyncing: boolean;
      syncComplete: boolean;
      lastSyncTime?: number;
      progress?: number;
      threadsCount?: number;
    }
  >;
  aggregatedSyncState: { isSyncing: boolean; syncComplete: boolean };
  tokenCache: Record<string, Record<string, string>>;
}

const SyncThreadContext = createContext<SyncThreadContextType | undefined>(undefined);
SyncThreadContext.displayName = 'SyncThreadContext';

export const SyncThreadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [syncState, setSyncState] = useAtom(syncThreadStateAtom);
  const [tokenCache, setTokenCache] = useAtom(tokenCacheAtom);
  const { idToken, preference } = useAuth();
  const { t } = useTranslation();
  const { globalSearchQuery, setGmailStatusInvalid } = useGlobalAtom();
  const { isWindowFocused } = useWindowFocus();
  const { getUserPlan } = useBillingAtom();
  const workerRef = useRef<Worker | null>(null);
  const activeRequests = useRef<
    Map<
      string,
      {
        uid: string;
        callbacks: any;
        query: string;
        subscriptionTrigger?: () => void;
      }
    >
  >(new Map());
  const lastQueries = useRef<Record<string, string>>({});
  const globalSearchQueryRef = useRef(globalSearchQuery);

  const isWindowFocusedRef = useRef(isWindowFocused);
  const pausedRequests = useRef<Set<string>>(new Set());

  // Update global search query ref
  useEffect(() => {
    globalSearchQueryRef.current = globalSearchQuery;
  }, [globalSearchQuery]);

  useEffect(() => {
    isWindowFocusedRef.current = isWindowFocused;

    if (isWindowFocused) {
      // Window regained focus - resume paused syncs
      resumePausedSyncs();
    } else {
      // Window lost focus - pause active syncs
      pauseActiveSyncs();
    }
  }, [isWindowFocused]);

  // Initialize worker with better build compatibility
  useEffect(() => {
    const initWorker = async () => {
      try {
        const WorkerConstructor = await import('../workers/threadSyncWorker.ts?worker');
        workerRef.current = new WorkerConstructor.default();

        workerRef.current.onmessage = (event) => {
          const { type, payload } = event.data;
          handleWorkerMessage(type, payload);
        };

        workerRef.current.onerror = (error) => {
          console.error('Thread sync worker error:', error);
        };
      } catch (error) {
        console.error('Failed to initialize thread sync worker:', error);
        // Fallback: run sync in main thread if worker fails
      }
    };

    initWorker();

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const pauseActiveSyncs = useCallback(() => {
    activeRequests.current.forEach((request, requestId) => {
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'SYNC_PAUSE',
          payload: { requestId }
        });
        pausedRequests.current.add(requestId);
      }
    });

    console.log('Paused active syncs due to window losing focus');
  }, []);

  const resumePausedSyncs = useCallback(() => {
    pausedRequests.current.forEach((requestId) => {
      const request = activeRequests.current.get(requestId);
      if (request && workerRef.current) {
        workerRef.current.postMessage({
          type: 'SYNC_RESUME',
          payload: { requestId }
        });
      }
    });

    pausedRequests.current.clear();
    console.log('Resumed paused syncs due to window regaining focus');
  }, []);

  const handleWorkerMessage = (type: string, payload: any) => {
    switch (type) {
      case 'SYNC_PROGRESS':
        handleSyncProgress(payload);
        break;
      case 'SYNC_COMPLETE':
        handleSyncComplete(payload);
        break;
      case 'SYNC_ERROR':
        handleSyncError(payload);
        break;
      case 'SYNC_PAUSED':
        handleSyncPaused(payload);
        break;
      case 'SYNC_RESUMED':
        handleSyncResumed(payload);
        break;
    }
  };

  const handleSyncPaused = (payload: any) => {
    const { requestId } = payload;
    console.log(`Sync paused for request: ${requestId}`);
  };

  const handleSyncResumed = (payload: any) => {
    const { requestId } = payload;
    console.log(`Sync resumed for request: ${requestId}`);
  };

  const exitWorker = useCallback(() => {
    // 1. Abort all active sync requests
    activeRequests.current.forEach((request, requestId) => {
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'SYNC_ABORT',
          payload: { requestId }
        });
      }
    });

    // 2. Clear all active requests
    activeRequests.current.clear();

    // 3. Reset all sync states
    setSyncState((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((uid) => {
        updated[uid] = {
          ...updated[uid],
          isSyncing: false,
          syncComplete: false,
          progress: 0,
          threadsCount: 0
        };
      });
      return updated;
    });

    // 4. Clear token cache
    setTokenCache({});

    // 5. Clear last queries tracking
    lastQueries.current = {};

    // 6. Terminate the worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    // 7. Optional: Show completion message
    // toast.success('Sync operations stopped and cleaned up');

    console.log('Worker exit completed - all sync operations stopped');
  }, [setSyncState, setTokenCache]);

  const handleSyncProgress = (payload: any) => {
    const { requestId, threadsCount, hasMore, nextPageToken } = payload;
    const request = activeRequests.current.get(requestId);

    if (request) {
      setSyncState((prev) => ({
        ...prev,
        [request.uid]: {
          ...prev[request.uid],
          threadsCount: (prev[request.uid]?.threadsCount || 0) + threadsCount,
          isSyncing: hasMore
        }
      }));

      // Update token cache with next page token
      if (nextPageToken) {
        updateTokenCache(request.uid, request.query, nextPageToken);
      }

      // Trigger subscription callback
      if (request.subscriptionTrigger) {
        request.subscriptionTrigger();
      }
    }
  };

  const handleSyncComplete = (payload: any) => {
    const { requestId, success, lastSyncTime, limitReached, limitReason } = payload;
    const request = activeRequests.current.get(requestId);

    if (request) {
      setSyncState((prev) => ({
        ...prev,
        [request.uid]: {
          ...prev[request.uid],
          isSyncing: false,
          syncComplete: success,
          lastSyncTime
        }
      }));

      // Show notification if sync was limited due to billing
      if (limitReached && limitReason === '365_day_limit') {
        toast.info(t('toast.info.sync_limited_365_days'), {
          description: t('toast.info.sync_limited_365_days_description')
        });
      }

      // Clear token cache for completed sync
      updateTokenCache(request.uid, request.query, null);
      activeRequests.current.delete(requestId);
    }
  };

  const handleSyncError = (payload: any) => {
    const { requestId, status, nextPageToken } = payload;
    const request = activeRequests.current.get(requestId);

    if (request) {
      setSyncState((prev) => ({
        ...prev,
        [request.uid]: {
          ...prev[request.uid],
          isSyncing: false,
          syncComplete: false
        }
      }));

      // Handle specific error cases
      switch (status) {
        case 402:
        case 500:
          updateTokenCache(request.uid, request.query, null);
          break;
        case 429:
          setGmailStatusInvalid(true);
          toast.error(t('toast.error.sync_failed', { account: request.uid }));
          break;
        default:
          break;
      }

      if (request.callbacks.onError) {
        request.callbacks.onError(status);
      }

      activeRequests.current.delete(requestId);
    }
  };

  const updateTokenCache = useCallback(
    (uid: string, query: string, token: string | null) => {
      setTokenCache((prev) => {
        const updated = { ...prev };
        if (!updated[uid]) updated[uid] = {};

        if (token) {
          updated[uid][query] = token;
        } else {
          delete updated[uid][query];
        }
        return updated;
      });
    },
    [setTokenCache]
  );

  const abortSync = useCallback(
    (accountIds?: string[]) => {
      if (accountIds && accountIds.length > 0) {
        // Abort only specific accounts
        accountIds.forEach((uid) => {
          const requestsToAbort = Array.from(activeRequests.current.entries()).filter(
            ([_, request]) => request.uid === uid
          );

          requestsToAbort.forEach(([requestId, _]) => {
            if (workerRef.current) {
              workerRef.current.postMessage({
                type: 'SYNC_ABORT',
                payload: { requestId }
              });
            }
            activeRequests.current.delete(requestId);
          });

          // Update sync state to show that sync was aborted
          setSyncState((prev) => ({
            ...prev,
            [uid]: {
              ...prev[uid],
              isSyncing: false,
              syncComplete: false
            }
          }));
        });
      } else {
        // Abort all pending API calls
        activeRequests.current.forEach((_, requestId) => {
          if (workerRef.current) {
            workerRef.current.postMessage({
              type: 'SYNC_ABORT',
              payload: { requestId }
            });
          }
        });

        // Update sync state for all accounts
        setSyncState((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((uid) => {
            updated[uid] = {
              ...updated[uid],
              isSyncing: false,
              syncComplete: false
            };
          });
          return updated;
        });

        activeRequests.current.clear();
      }
    },
    [setSyncState]
  );

  const syncThreads = useCallback(
    async (
      uid: string,
      subscriptionTrigger?: () => void,
      onError?: (status: number) => void,
      interval: number = 6000,
      retryCount: number = 0
    ) => {
      const query = globalSearchQueryRef.current;

      const { field, label } = parseQueryFieldLabel(query, true);
      const isValidLabel =
        field &&
        label &&
        (field === 'in' || field === 'is' || field === 'category') &&
        (validLabels.includes(label.toUpperCase() as ValidLabel) || label.toLowerCase() === 'all');

      if (!isValidLabel || !uid || !idToken) {
        console.warn('Invalid query or missing required data for sync:', {
          query,
          uid: !!uid,
          idToken: !!idToken
        });

        if (uid) {
          abortSync([uid]);
        }
        return;
      }

      if (!workerRef.current) {
        console.warn('Worker not available, attempting to reinitialize...');

        // Try to reinitialize the worker
        try {
          const WorkerConstructor = await import('../workers/threadSyncWorker.ts?worker');
          workerRef.current = new WorkerConstructor.default();

          workerRef.current.onmessage = (event) => {
            const { type, payload } = event.data;
            handleWorkerMessage(type, payload);
          };

          workerRef.current.onerror = (error) => {
            console.error('Thread sync worker error:', error);
          };

          // If worker was successfully reinitialized, retry the sync
          if (workerRef.current && retryCount < 3) {
            console.log(`Retrying sync (attempt ${retryCount + 1})...`);
            return syncThreads(uid, subscriptionTrigger, onError, interval, retryCount + 1);
          }
        } catch (error) {
          console.error('Failed to reinitialize worker:', error);
        }

        // If we've exhausted retries or reinitialization failed, abort
        console.error('Failed to initialize worker after retries');
        if (uid) {
          abortSync([uid]);
        }
        return;
      }

      const requestId = `${uid}-${Date.now()}`;

      // Abort previous requests for this account if query changed
      if (lastQueries.current[uid] !== query) {
        const previousRequests = Array.from(activeRequests.current.entries()).filter(
          ([_, request]) => request.uid === uid
        );

        previousRequests.forEach(([prevRequestId, _]) => {
          if (workerRef.current) {
            workerRef.current.postMessage({
              type: 'SYNC_ABORT',
              payload: { requestId: prevRequestId }
            });
          }
          activeRequests.current.delete(prevRequestId);
          pausedRequests.current.delete(prevRequestId);
        });

        setSyncState((prev) => ({
          ...prev,
          [uid]: {
            isSyncing: true,
            syncComplete: false,
            threadsCount: 0
          }
        }));
        lastQueries.current[uid] = query;
      }

      activeRequests.current.set(requestId, {
        uid,
        query,
        callbacks: { onError },
        subscriptionTrigger
      });

      const cachedToken = tokenCache[uid]?.[query] || '';
      const userPlan = getUserPlan();

      // Get category preferences for this specific account
      const categoryPreferences = preference.display.inbox.category?.[uid] || {
        showUpdates: true,
        showSocial: true,
        showPromotions: true,
        showForums: true
      };

      workerRef.current.postMessage({
        type: 'SYNC_START',
        payload: {
          uid,
          requestId,
          idToken,
          query,
          nextPageToken: cachedToken,
          interval,
          shouldPause: !isWindowFocusedRef.current, // Pass initial focus state
          userPlan, // Pass user plan to worker
          categoryPreferences // Pass category preferences to worker
        }
      });

      // If window is not focused, immediately pause this sync
      if (!isWindowFocusedRef.current) {
        pausedRequests.current.add(requestId);
        workerRef.current.postMessage({
          type: 'SYNC_PAUSE',
          payload: { requestId }
        });
      }
    },
    [
      setSyncState,
      idToken,
      preference,
      tokenCache,
      globalSearchQueryRef,
      updateTokenCache,
      abortSync,
      getUserPlan
    ]
  );

  const cleanupSync = useCallback(() => {
    abortSync();
  }, [abortSync]);

  // Add a cleanup effect
  useEffect(() => {
    return () => {
      cleanupSync();
    };
  }, [cleanupSync]);

  // Get aggregated sync state (for backward compatibility)
  const getAggregatedSyncState = useCallback(() => {
    const syncValues = Object.values(syncState);
    if (syncValues.length === 0) {
      return { isSyncing: false, syncComplete: false };
    }

    return {
      isSyncing: syncValues.some((state) => state.isSyncing),
      syncComplete: syncValues.every((state) => state.syncComplete)
    };
  }, [syncState]);

  const contextValue = useMemo(
    () => ({
      syncThreads,
      abortSync,
      cleanupSync,
      exitWorker,
      updateTokenCache,
      syncState,
      aggregatedSyncState: getAggregatedSyncState(),
      tokenCache
    }),
    [
      syncThreads,
      abortSync,
      cleanupSync,
      exitWorker,
      updateTokenCache,
      syncState,
      getAggregatedSyncState,
      tokenCache
    ]
  );

  return <SyncThreadContext.Provider value={contextValue}>{children}</SyncThreadContext.Provider>;
};

export const useSyncThread = (): SyncThreadContextType => {
  const context = useContext(SyncThreadContext);
  if (!context) {
    throw new Error('useSyncThread must be used within a SyncThreadProvider');
  }
  return context;
};
