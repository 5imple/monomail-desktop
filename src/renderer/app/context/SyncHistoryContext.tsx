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
import { UpdateType } from '@/renderer/app/context/MessageContext';
import { useAuth } from '@/renderer/app/context/AuthContext';

export const syncHistoryStateAtom = atom<
  Record<
    string,
    {
      isSyncing: boolean;
      syncComplete: boolean;
      lastSyncTime?: number;
      progress?: number;
    }
  >
>({});

interface SyncHistoryContextType {
  syncThreadHistory: (
    uid: string,
    onSyncComplete?: () => void,
    onSyncError?: (status: number) => void,
    onProgress?: (progress: number, changes: UpdateType[]) => void
  ) => Promise<void>;
  subscribe: (callback: (changedThreadIds: UpdateType[]) => void) => () => void; // Returns unsubscribe function
  syncState: Record<
    string,
    { isSyncing: boolean; syncComplete: boolean; lastSyncTime?: number; progress?: number }
  >;
  aggregatedSyncState: { isSyncing: boolean; syncComplete: boolean };
  cleanupSync: () => void;
  exitWorker: () => void;
}

const SyncHistoryContext = createContext<SyncHistoryContextType | undefined>(undefined);
SyncHistoryContext.displayName = 'SyncHistoryContext';

export const SyncHistoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [syncState, setSyncState] = useAtom(syncHistoryStateAtom);
  const { idToken, getAccountByUid } = useAuth();
  const subscribers = useRef(new Set<(changedThreadIds: UpdateType[]) => void>());
  const workerRef = useRef<Worker | null>(null);
  const activeRequests = useRef<Map<string, { uid: string; callbacks: any }>>(new Map());

  // Initialize worker with better build compatibility
  useEffect(() => {
    const initWorker = async () => {
      try {
        const WorkerConstructor = await import('../workers/historySyncWorker.ts?worker');
        workerRef.current = new WorkerConstructor.default();

        workerRef.current.onmessage = (event) => {
          const { type, payload } = event.data;
          handleWorkerMessage(type, payload);
        };

        workerRef.current.onerror = (error) => {
          console.error('Worker error:', error);
        };
      } catch (error) {
        console.error('Failed to initialize worker:', error);
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

    // 3. Clear all subscribers
    subscribers.current.clear();

    // 4. Reset all sync states
    setSyncState((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((uid) => {
        updated[uid] = {
          isSyncing: false,
          syncComplete: false,
          progress: 0,
          lastSyncTime: undefined
        };
      });
      return updated;
    });

    // 5. Terminate the worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    console.log('History sync worker exit completed - all operations stopped');
  }, [setSyncState]);

  // Rest of your implementation...
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
    }
  };

  const handleSyncProgress = (payload: any) => {
    const { requestId, progress, changedThreadIds } = payload;
    const request = activeRequests.current.get(requestId);

    if (request) {
      setSyncState((prev) => ({
        ...prev,
        [request.uid]: {
          ...prev[request.uid],
          progress
        }
      }));

      if (changedThreadIds.length > 0) {
        subscribers.current.forEach((callback) => callback(changedThreadIds));
      }

      if (request.callbacks.onProgress) {
        request.callbacks.onProgress(progress, changedThreadIds);
      }
    }
  };

  const handleSyncComplete = (payload: any) => {
    const { requestId, success, lastSyncTime } = payload;
    const request = activeRequests.current.get(requestId);

    if (request) {
      setSyncState((prev) => ({
        ...prev,
        [request.uid]: {
          isSyncing: false,
          syncComplete: success,
          lastSyncTime,
          progress: undefined
        }
      }));

      if (request.callbacks.onSyncComplete) {
        request.callbacks.onSyncComplete();
      }

      activeRequests.current.delete(requestId);
    }
  };

  const handleSyncError = (payload: any) => {
    const { requestId, status } = payload;
    const request = activeRequests.current.get(requestId);

    if (request) {
      setSyncState((prev) => ({
        ...prev,
        [request.uid]: {
          isSyncing: false,
          syncComplete: false,
          progress: undefined
        }
      }));

      if (request.callbacks.onSyncError) {
        request.callbacks.onSyncError(status);
      }

      activeRequests.current.delete(requestId);
    }
  };

  const subscribe = useCallback((callback: (changedThreadIds: UpdateType[]) => void) => {
    subscribers.current.add(callback);
    return () => {
      subscribers.current.delete(callback);
    };
  }, []);

  const syncThreadHistory = useCallback(
    async (
      uid: string,
      onSyncComplete?: () => void,
      onSyncError?: (status: number) => void,
      onProgress?: (progress: number, changes: UpdateType[]) => void,
      retryCount: number = 0
    ) => {
      if (!uid || !idToken) {
        console.warn('Missing required data for sync:', { uid: !!uid, idToken: !!idToken });
        return;
      }

      if (!workerRef.current) {
        console.warn('Worker not available, attempting to reinitialize...');

        // Try to reinitialize the worker
        try {
          const WorkerConstructor = await import('../workers/historySyncWorker.ts?worker');
          workerRef.current = new WorkerConstructor.default();

          workerRef.current.onmessage = (event) => {
            const { type, payload } = event.data;
            handleWorkerMessage(type, payload);
          };

          workerRef.current.onerror = (error) => {
            console.error('Worker error:', error);
          };

          // If worker was successfully reinitialized, retry the sync
          if (workerRef.current && retryCount < 3) {
            console.log(`Retrying history sync (attempt ${retryCount + 1})...`);
            return syncThreadHistory(uid, onSyncComplete, onSyncError, onProgress, retryCount + 1);
          }
        } catch (error) {
          console.error('Failed to reinitialize history sync worker:', error);
        }

        // If we've exhausted retries or reinitialization failed, abort
        if (!workerRef.current) {
          console.error('Failed to initialize history sync worker after retries');
          return;
        }
      }

      const requestId = `${uid}-${Date.now()}`;

      activeRequests.current.set(requestId, {
        uid,
        callbacks: { onSyncComplete, onSyncError, onProgress }
      });

      setSyncState((prev) => ({
        ...prev,
        [uid]: {
          isSyncing: true,
          syncComplete: false,
          progress: 0
        }
      }));

      // Get account provider for this uid
      const account = getAccountByUid(uid);
      const provider = account?.provider || 'google'; // Default to google for backward compatibility

      workerRef.current.postMessage({
        type: 'SYNC_START',
        payload: {
          uid,
          requestId,
          idToken,
          provider
        }
      });
    },
    [setSyncState, idToken, getAccountByUid]
  );

  const cleanupSync = useCallback(() => {
    activeRequests.current.forEach((_, requestId) => {
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'SYNC_ABORT',
          payload: { requestId }
        });
      }
    });
    activeRequests.current.clear();
  }, []);

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
      syncThreadHistory,
      subscribe,
      syncState,
      aggregatedSyncState: getAggregatedSyncState(),
      cleanupSync,
      exitWorker
    }),
    [syncThreadHistory, subscribe, syncState, getAggregatedSyncState, cleanupSync, exitWorker]
  );

  return <SyncHistoryContext.Provider value={contextValue}>{children}</SyncHistoryContext.Provider>;
};

export const useSyncHistory = (): SyncHistoryContextType => {
  const context = useContext(SyncHistoryContext);
  if (!context) {
    throw new Error('useSyncHistory must be used within a SyncHistoryProvider');
  }
  return context;
};
