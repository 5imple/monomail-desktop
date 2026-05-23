import { useAtom } from 'jotai';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  selectedThreadsAtom,
  threadIdsAtom,
  threadsMapAtom
} from './atoms';

import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { useCallback } from 'react';
import { useThreadFilter } from './useThreadFilter';
import { useThreadOperationAtom } from './useThreadOperations';

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

  const focusThreadById = useCallback((threadId: string) => {
    const threadElement = document.querySelector(
      `[data-thread="${threadId}"] [role="button"]`
    ) as HTMLElement;
    if (threadElement) {
      threadElement.focus();

      // Ensure the element is in view
      threadElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const selectNextThread = useCallback(
    (keepPrevious = false) => {
      // Only consider thread IDs that exist in the threadsMap
      const validThreadIds = filteredThreadIds.filter((threadId) => threadsMap[threadId]);
      if (validThreadIds.length === 0) {
        setSelectedThreads([]);
        setActiveThreadId(null);
        return;
      }

      const lastSelectedThreadId = selectedThreads[selectedThreads.length - 1] ?? activeThreadId;
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

      const lastSelectedThreadId = selectedThreads[selectedThreads.length - 1] ?? activeThreadId;
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
