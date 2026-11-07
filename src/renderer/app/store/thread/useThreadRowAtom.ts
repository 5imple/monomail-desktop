import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useMemo } from 'react';
import { activeThreadIdAtom, selectedThreadsAtom, threadsMapAtom } from './atoms';

/**
 * What one list row needs from the thread store, subscribed narrowly: the row
 * re-renders when ITS thread, its own selection or its own active state
 * changes, not when any thread anywhere does.
 *
 * Rows used useThreadAtom, which subscribes to every thread atom. Opening an
 * email (activeThreadId) or a body landing (threadsMap) then re-rendered every
 * row in the list: ~75 rows, around 200 ms on the main thread before the
 * reader could show the email.
 */
export function useThreadRowAtom(threadId: string) {
  const threadAtom = useMemo(
    () => atom((get) => get(threadsMapAtom)[threadId] ?? null),
    [threadId]
  );
  const isActiveAtom = useMemo(
    () => atom((get) => get(activeThreadIdAtom) === threadId),
    [threadId]
  );
  const isCheckedAtom = useMemo(
    () => atom((get) => get(selectedThreadsAtom).includes(threadId)),
    [threadId]
  );

  return {
    thread: useAtomValue(threadAtom),
    isActive: useAtomValue(isActiveAtom),
    isChecked: useAtomValue(isCheckedAtom),
    setSelectedThreads: useSetAtom(selectedThreadsAtom)
  };
}
