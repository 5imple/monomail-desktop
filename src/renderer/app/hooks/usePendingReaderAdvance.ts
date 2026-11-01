import { atom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { useEffect, useRef } from 'react';
import { nearLoadedEnd, resolvePendingAdvance } from '@/renderer/app/lib/commands/readerNavigation';
import { threadListActions } from '@/renderer/app/lib/threadListActions';
import { loadingStatusAtom } from '@/renderer/app/store/layout/threadList/useThreadListAtom';
import { pendingAdvanceAtom } from '@/renderer/app/store/thread/readerAdvance';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  threadListHasMoreAtom,
  threadsMapAtom
} from '@/renderer/app/store/thread/atoms';

// Give up waiting for the next page after this long: back to the email above.
const WAIT_LIMIT_MS = 10_000;

const listedIdsAtom = atom((get) => {
  const threadsMap = get(threadsMapAtom);
  return get(filteredThreadIdsAtom).filter((id) => threadsMap[id]);
});

// What the waiting reader should do now, as a string so this re-renders only
// when the answer changes: 'idle' | 'wait' | 'cancel' | 'open:<id>' | 'open:'.
const pendingStepAtom = atom((get) => {
  const pending = get(pendingAdvanceAtom);
  if (!pending) return 'idle';
  const step = resolvePendingAdvance(
    get(listedIdsAtom),
    pending,
    get(activeThreadIdAtom),
    get(threadListHasMoreAtom)
  );
  return typeof step === 'string' ? step : `open:${step.open ?? ''}`;
});

// The open email is among the last few loaded (fetch the next page early).
// The list length is part of the key, so each new page can ask again.
const nearEndKeyAtom = atom((get) => {
  const ids = get(listedIdsAtom);
  return nearLoadedEnd(ids, get(activeThreadIdAtom)) ? ids.length : 0;
});

/**
 * Keeps Done / Trash / Later going past the last loaded email: fetches the
 * next page a few emails before the end, and resolves a reader waiting at the
 * end (advanceReaderFrom). Mounted once, with the reader.
 */
export const usePendingReaderAdvance = () => {
  const store = useStore();
  const step = useAtomValue(pendingStepAtom);
  const loadingStatus = useAtomValue(loadingStatusAtom);
  const hasMore = useAtomValue(threadListHasMoreAtom);
  const nearEndKey = useAtomValue(nearEndKeyAtom);
  const setPending = useSetAtom(pendingAdvanceAtom);

  useEffect(() => {
    if (step === 'idle' || step === 'wait') return;
    setPending(null);
    if (step.startsWith('open:')) store.set(activeThreadIdAtom, step.slice(5) || null);
  }, [step, setPending, store]);

  // Keep paging while waiting: a load may have been busy when asked, or the
  // page held nothing for this view (the Unread tab, a label). Each page is
  // awaited, not inferred from the loading status (Microsoft's paging doesn't
  // set it). 'none' clears hasMore, which resolves to the email above.
  const waiting = step === 'wait';
  useEffect(() => {
    if (!waiting) return undefined;
    let cancelled = false;
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    void (async () => {
      while (!cancelled) {
        const load = threadListActions.loadMore();
        if (load.state === 'none') return;
        await (load.state === 'busy' ? pause(400) : load.done);
        // Let the list's filters apply the new page before deciding again.
        await pause(50);
        if (cancelled || store.get(pendingStepAtom) !== 'wait') return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [waiting, store]);

  // Don't wait forever (a load that fails quietly): the email above.
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => {
      const pending = store.get(pendingAdvanceAtom);
      if (!pending || store.get(activeThreadIdAtom) !== pending.leavingId) return;
      setPending(null);
      store.set(activeThreadIdAtom, pending.after);
    }, WAIT_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, setPending, store]);

  // A few emails from the end: fetch the next page now, so Done rarely waits.
  const askedForRef = useRef(0);
  useEffect(() => {
    if (!nearEndKey || !hasMore || loadingStatus !== 'DONE') return;
    if (askedForRef.current === nearEndKey) return;
    askedForRef.current = nearEndKey;
    threadListActions.loadMore();
  }, [nearEndKey, hasMore, loadingStatus]);
};
