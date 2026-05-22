import React, { createContext, useContext, useMemo, useEffect } from 'react';
import useThreadFetchHandler from '@/renderer/app/hooks/useThreadFetchHandler';
import {
  LoadingStatus,
  useThreadListAtom
} from '@/renderer/app/store/layout/threadList/useThreadListAtom';
import { useSyncHistory } from '@/renderer/app/context/SyncHistoryContext';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';

interface ThreadListContextType {
  fetchThreadsHandler: (loadMore?: boolean) => void;
  resetThreadsArray: () => void;
  loadingStatus: LoadingStatus;
  threadIds: string[];
  loadMore: () => void;
  hasMore: boolean;
  updateFromMessageSubscribe: (data: any) => void;
}

const ThreadListContext = createContext<ThreadListContextType | undefined>(undefined);

ThreadListContext.displayName = 'ThreadListContext';

export function ThreadListProvider({ children }: { children: React.ReactNode }) {
  const { threadsMap, setThreadIds } = useThreadAtom();
  const {
    fetchThreadsHandler,
    threadIds,
    resetThreadsArray,
    loadMore,
    hasMore,
    updateFromMessageSubscribe
  } = useThreadFetchHandler();

  const { loadingStatus } = useThreadListAtom();

  // Resort threadIds when threadsMap changes
  useEffect(() => {
    if (threadIds.length > 0 && Object.keys(threadsMap).length > 0) {
      // Only resort if we have both threadIds and threadsMap data
      const sortedThreadIds = [...threadIds].sort((idA, idB) => {
        const threadA = threadsMap[idA];
        const threadB = threadsMap[idB];

        // Handle cases where thread data might not be available yet
        if (!threadA && !threadB) return 0;
        if (!threadA) return 1; // Put threads without data at the end
        if (!threadB) return -1;

        // Sort by timestamp (descending order - newest first)
        return threadB.timestamp - threadA.timestamp;
      });

      // Only update if the order actually changed
      const orderChanged = sortedThreadIds.some((id, index) => id !== threadIds[index]);
      if (orderChanged) {
        setThreadIds(sortedThreadIds);
      }
    }
  }, [threadsMap, threadIds]);

  const value = useMemo(
    () => ({
      fetchThreadsHandler,
      loadingStatus,
      resetThreadsArray,
      threadIds,
      loadMore,
      hasMore,
      updateFromMessageSubscribe
    }),
    [
      fetchThreadsHandler,
      loadingStatus,
      resetThreadsArray,
      threadIds,
      loadMore,
      hasMore,
      updateFromMessageSubscribe
    ]
  );

  return <ThreadListContext.Provider value={value}>{children}</ThreadListContext.Provider>;
}

export function useThreadList() {
  const context = useContext(ThreadListContext);
  if (context === undefined) {
    throw new Error('useThreadList must be used within a ThreadListProvider');
  }
  return context;
}
