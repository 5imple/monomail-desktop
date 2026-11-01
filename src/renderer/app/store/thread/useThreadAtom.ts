import { useAtom } from 'jotai';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  selectedThreadsAtom,
  threadIdsAtom,
  threadsMapAtom
} from './atoms';

import { useCallback } from 'react';
import { advanceReaderFrom } from '@/renderer/app/store/thread/readerAdvance';
import { useThreadFilter } from './useThreadFilter';

export function useThreadAtom() {
  const [selectedThreads, setSelectedThreads] = useAtom(selectedThreadsAtom);
  const [activeThreadId, setActiveThreadId] = useAtom(activeThreadIdAtom);
  const [threadIds, setThreadIds] = useAtom(threadIdsAtom);
  const [threadsMap, setThreadsMap] = useAtom(threadsMapAtom);
  const [filteredThreadIds, setFilteredThreadIds] = useAtom(filteredThreadIdsAtom);
  const {
    filterThreadIds,
    activeFilters,
    setActiveFilters,
    applyFilters: threadPassesFilters,
    isHiddenBySplit,
    isFiltering,
    splitKey
  } = useThreadFilter();

  // Then, apply any custom filters from the activeFilters state (and the
  // "only show here" labels, see useThreadFilter).
  const applyFilters = useCallback(() => {
    setFilteredThreadIds(filterThreadIds(threadIds));
  }, [threadIds, filterThreadIds, setFilteredThreadIds]);

  /**
   * After a conversation's labels change (a refresh tagged it Other, it was
   * read…): add the ones that now match, and drop the ones a split label now
   * claims. One that merely stopped matching stays until the tab or list
   * changes, so reading mail on Unread doesn't pull it out from under you.
   */
  const refreshFilters = useCallback(() => {
    if (!isFiltering) return;
    setFilteredThreadIds((prev) => {
      const shown = new Set(prev);
      const next = threadIds.filter((id) => {
        const thread = threadsMap[id];
        if (!thread) return shown.has(id);
        if (isHiddenBySplit(thread)) return false;
        return shown.has(id) || threadPassesFilters(thread);
      });
      const same = next.length === prev.length && next.every((id, i) => id === prev[i]);
      return same ? prev : next;
    });
  }, [
    isFiltering,
    threadIds,
    threadsMap,
    isHiddenBySplit,
    threadPassesFilters,
    setFilteredThreadIds
  ]);

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
      } else if (!keepPrevious && activeThreadId) {
        // The open email is the last one loaded (Later on it): fetch the next
        // page and continue there, or the one above at the real end.
        advanceReaderFrom(activeThreadId, validThreadIds, setActiveThreadId);
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
    applyFilters,
    refreshFilters,
    splitKey
  };
}
