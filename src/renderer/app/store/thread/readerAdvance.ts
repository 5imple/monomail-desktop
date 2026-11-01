import { atom, getDefaultStore } from 'jotai';
import {
  advanceAfterLeaving,
  type PendingAdvance
} from '@/renderer/app/lib/commands/readerNavigation';
import { threadListActions } from '@/renderer/app/lib/threadListActions';
import {
  filteredThreadIdsAtom,
  threadListHasMoreAtom,
  threadsMapAtom
} from '@/renderer/app/store/thread/atoms';

/** The reader waiting for the next page (usePendingReaderAdvance resolves it). */
export const pendingAdvanceAtom = atom<PendingAdvance | null>(null);

const listedIds = () => {
  const store = getDefaultStore();
  const threadsMap = store.get(threadsMapAtom);
  return store.get(filteredThreadIdsAtom).filter((id) => threadsMap[id]);
};

/**
 * Move the reader on from `leavingId` (Done / Trash / Spam / Later on the open
 * email). `ids` is the list as it was while the email was still in it. At the
 * end of what's loaded, with more on the server, the next page is fetched
 * and the reader stays on this email until it lands. `open` is the caller's
 * way to open an email (the reader's active thread).
 */
export const advanceReaderFrom = (
  leavingId: string,
  ids: readonly string[],
  open: (threadId: string | null) => void
) => {
  const store = getDefaultStore();
  const step = advanceAfterLeaving(ids, leavingId, store.get(threadListHasMoreAtom));
  if (step !== 'wait') {
    open(step.open);
    return;
  }
  const index = ids.indexOf(leavingId);
  const above = ids[index - 1] ?? null;
  // Nothing can load after all (a search that came in one go): the one above.
  if (threadListActions.loadMore().state === 'none') {
    open(above);
    return;
  }
  store.set(pendingAdvanceAtom, {
    leavingId,
    after: above,
    leavingListed: listedIds().includes(leavingId)
  });
};
