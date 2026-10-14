import { useAtom } from 'jotai';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  selectedThreadsAtom,
  threadIdsAtom,
  threadsMapAtom
} from './atoms';

import { useCallback } from 'react';
import { useThreadFilter } from './useThreadFilter';

export function useThreadAtom() {
  const [selectedThreads, setSelectedThreads] = useAtom(selectedThreadsAtom);
  const [activeThreadId, setActiveThreadId] = useAtom(activeThreadIdAtom);
  const [threadIds, setThreadIds] = useAtom(threadIdsAtom);
  const [threadsMap, setThreadsMap] = useAtom(threadsMapAtom);
  const [filteredThreadIds, setFilteredThreadIds] = useAtom(filteredThreadIdsAtom);
  const { filterThreadIds, activeFilters, setActiveFilters } = useThreadFilter();

  // Then, apply any custom filters from the activeFilters state
  const applyFilters = useCallback(() => {
    // Apply custom filters if there are any
    if (activeFilters.length > 0) {
      const filteredIds = filterThreadIds(threadIds);
      setFilteredThreadIds(filteredIds);
    } else {
      // Otherwise just use the thread IDs directly
      setFilteredThreadIds(threadIds);
    }
  }, [threadIds, filterThreadIds, activeFilters, setFilteredThreadIds]);

  const selectNextThread = useCallback(
    (keepPrevious = false) => {
      // Only consider thread IDs that exist in the threadsMap
      const validThreadIds = filteredThreadIds.filter((threadId) => threadsMap[threadId]);
      if (validThreadIds.length === 0) {
        setSelectedThreads([]);
        setActiveThreadId(null);
        return;
      }

      // Move from the open thread when there is one: the list is hidden
      // behind the reader, so a leftover checked row (e.g. from a right-click)
      // must not decide where next/previous is after trashing/archiving.
      const lastSelectedThreadId = activeThreadId ?? selectedThreads[selectedThreads.length - 1];
      const selectedIndex = validThreadIds.findIndex(
        (threadId) => threadId === lastSelectedThreadId
      );

      if (selectedIndex === -1) {
        // If nothing is selected or the selected thread is not valid, select the first valid thread
        setActiveThreadId(validThreadIds[0]);
      } else if (selectedIndex < validThreadIds.length - 1) {
        const nextThreadId = validThreadIds[selectedIndex + 1];
        if (keepPrevious) {
          // Add next thread to the selected threads if keepPrevious is true
          setSelectedThreads([...selectedThreads, nextThreadId]);
        } else {
          setActiveThreadId(nextThreadId);
          // focusThreadById(nextThreadId);
        }
      } else if (!keepPrevious) {
        // The current thread is the last one in the list. When it is removed
        // (e.g. trashed/archived from the reader) there is no "next", so land
        // on the previous thread instead of leaving the reader stuck on the
        // just-removed thread; if it was the only thread, clear the reader.
        if (selectedIndex > 0) {
          setActiveThreadId(validThreadIds[selectedIndex - 1]);
        } else {
          setActiveThreadId(null);
          setSelectedThreads([]);
        }
      }
    },
    [
      activeThreadId,
      filteredThreadIds,
      selectedThreads,
      setActiveThreadId,
      setSelectedThreads,
      threadsMap
    ]
  );

  const selectPreviousThread = useCallback(
    (keepPrevious = false) => {
      // Only consider thread IDs that exist in the threadsMap
      const validThreadIds = filteredThreadIds.filter((threadId) => threadsMap[threadId]);
      if (validThreadIds.length === 0) {
        setSelectedThreads([]);
        setActiveThreadId(null);
        return;
      }

      // Move from the open thread when there is one: the list is hidden
      // behind the reader, so a leftover checked row (e.g. from a right-click)
      // must not decide where next/previous is after trashing/archiving.
      const lastSelectedThreadId = activeThreadId ?? selectedThreads[selectedThreads.length - 1];
      const selectedIndex = validThreadIds.findIndex(
        (threadId) => threadId === lastSelectedThreadId
      );

      if (selectedIndex === -1) {
        // If nothing is selected or the selected thread is not valid, select the first valid thread
        setActiveThreadId(validThreadIds[0]);
      } else if (selectedIndex > 0) {
        const prevThreadId = validThreadIds[selectedIndex - 1];
        if (keepPrevious) {
          // Add previous thread to the selected threads if keepPrevious is true
          setSelectedThreads([...selectedThreads, prevThreadId]);
        } else {
          setActiveThreadId(prevThreadId);
          // focusThreadById(prevThreadId);
        }
      }
    },
    [
      activeThreadId,
      filteredThreadIds,
      selectedThreads,
      setActiveThreadId,
      setSelectedThreads,
      threadsMap
    ]
  );

  return {
    activeFilters,
    setActiveFilters,
    selectedThreads,
    setSelectedThreads,
    activeThreadId,
    setActiveThreadId,
    threadsMap,
    setThreadsMap,
    threadIds,
    filteredThreadIds,
    setThreadIds,
    selectNextThread,
    selectPreviousThread,
    applyFilters
  };
}
