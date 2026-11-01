import React, { createContext, useContext, useMemo, useEffect, useRef } from 'react';
import electronApi from '@/renderer/app/lib/electronApi';
import { useSetAtom } from 'jotai';
import { threadListHasMoreAtom } from '@/renderer/app/store/thread/atoms';
import { threadListActions, type LoadMoreResult } from '@/renderer/app/lib/threadListActions';
import useThreadFetchHandler from '@/renderer/app/hooks/useThreadFetchHandler';
import {
  LoadingStatus,
  useThreadListAtom
} from '@/renderer/app/store/layout/threadList/useThreadListAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';

interface ThreadListContextType {
  fetchThreadsHandler: (loadMore?: boolean) => void;
  resetThreadsArray: () => void;
  loadingStatus: LoadingStatus;
  threadIds: string[];
  loadMore: () => LoadMoreResult;
  hasMore: boolean;
  /** Checks every account for new mail now; false when none could be reached. */
  refresh: () => Promise<boolean>;
  updateFromMessageSubscribe: (data: any) => void;
}

const ThreadListContext = createContext<ThreadListContextType | undefined>(undefined);

ThreadListContext.displayName = 'ThreadListContext';

export function ThreadListProvider({ children }: { children: React.ReactNode }) {
  const {
    threadsMap,
    setThreadIds,
    threadIds: rawThreadIds,
    activeFilters,
    applyFilters,
    refreshFilters,
    splitKey
  } = useThreadAtom();
  const {
    fetchThreadsHandler,
    threadIds,
    resetThreadsArray,
    loadMore,
    hasMore,
    refresh,
    updateFromMessageSubscribe
  } = useThreadFetchHandler();

  const { loadingStatus } = useThreadListAtom();

  // For the reader's position ("3 of 42+"): it lives outside this provider.
  const setHasMoreAtom = useSetAtom(threadListHasMoreAtom);
  useEffect(() => {
    setHasMoreAtom(hasMore);
  }, [hasMore, setHasMoreAtom]);
  useEffect(() => {
    threadListActions.loadMore = loadMore;
  }, [loadMore]);

  // A send, reply, delete or move went through (main's mailChangeNotifier):
  // refresh quietly, as the refresh button does, so the list shows it without
  // a click. One at a time; a change during a refresh runs one more after it.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let running = false;
    let again = false;
    const run = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          await refreshRef.current().catch(() => false);
        } while (again);
      } finally {
        running = false;
      }
    };
    threadListActions.refreshNow = () => void run();
    return electronApi.on('renderer:mail:changed', () => {
      if (threadListActions.autoRefreshHolds === 0) void run();
    });
  }, []);

  // Sync the rendered filteredThreadIds from the raw threadIds + active filters.
  // This MUST live in the always-mounted provider, not in FilterOptionDropdownMenu:
  // that dropdown is only rendered when the list is non-empty, so hosting the sync
  // there deadlocked an empty list (no sync runs → filteredThreadIds stays empty →
  // list never populates).
  useEffect(() => {
    applyFilters();
  }, [activeFilters, rawThreadIds, splitKey]);

  // A conversation's labels changed without the list changing (a refresh
  // tagged it Other, it was read…): the tabs must follow, or a cached thread
  // that became Other never reached the Others tab.
  useEffect(() => {
    refreshFilters();
  }, [threadsMap]);

  // Resort the RAW threadIds when threadsMap changes. Sorting the filtered list
  // (what useThreadFetchHandler returns) and writing it back as the raw list
  // dropped every thread the Unread / With-attachments tab was hiding — after
  // switching back to "All" they were gone until a refresh. The filter effect
  // above re-derives the visible list from the re-sorted raw ids.
  useEffect(() => {
    if (rawThreadIds.length > 0 && Object.keys(threadsMap).length > 0) {
      // Only resort if we have both threadIds and threadsMap data
      const sortedThreadIds = [...rawThreadIds].sort((idA, idB) => {
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
      const orderChanged = sortedThreadIds.some((id, index) => id !== rawThreadIds[index]);
      if (orderChanged) {
        setThreadIds(sortedThreadIds);
      }
    }
  }, [threadsMap, rawThreadIds]);

  const value = useMemo(
    () => ({
      fetchThreadsHandler,
      loadingStatus,
      resetThreadsArray,
      threadIds,
      loadMore,
      hasMore,
      refresh,
      updateFromMessageSubscribe
    }),
    [
      fetchThreadsHandler,
      loadingStatus,
      resetThreadsArray,
      threadIds,
      loadMore,
      hasMore,
      refresh,
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
