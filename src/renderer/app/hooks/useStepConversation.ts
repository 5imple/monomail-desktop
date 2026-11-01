import { stepConversation } from '@/renderer/app/lib/commands/readerNavigation';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  threadsMapAtom
} from '@/renderer/app/store/thread/atoms';
import { useSetAtom, useStore } from 'jotai';
import { pendingAdvanceAtom } from '@/renderer/app/store/thread/readerAdvance';
import { useCallback } from 'react';

/**
 * Open the next (1) or previous (-1) conversation in the list from the one in
 * the reader. Reads the list when called, so the caller subscribes to nothing.
 * Returns whether it moved.
 */
export const useStepConversation = () => {
  const store = useStore();
  const setActiveThreadId = useSetAtom(activeThreadIdAtom);
  return useCallback(
    (direction: 1 | -1): boolean => {
      const threadsMap = store.get(threadsMapAtom);
      const ids = store.get(filteredThreadIdsAtom).filter((id) => threadsMap[id]);
      const activeId = store.get(activeThreadIdAtom);
      // Done on the last loaded email, the next page still coming
      // (usePendingReaderAdvance): the open email has left the list. Next
      // waits for that page; Previous goes to the email that was above it.
      const pending = store.get(pendingAdvanceAtom);
      if (pending && pending.leavingId === activeId) {
        if (direction === 1 || !pending.after || !ids.includes(pending.after)) return false;
        store.set(pendingAdvanceAtom, null);
        setActiveThreadId(pending.after);
        return true;
      }
      const next = stepConversation(ids, activeId, direction);
      if (!next) return false;
      setActiveThreadId(next);
      return true;
    },
    [store, setActiveThreadId]
  );
};
