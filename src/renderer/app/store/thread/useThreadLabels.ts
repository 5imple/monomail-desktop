import mailApi from '@/main/api/mail/mailApi';
import { useMessage } from '@/renderer/app/context/MessageContext';
import { useOffline } from '@/renderer/app/context/OfflineContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import { threadsMapAtom } from './atoms';

async function applyThreadLabelsToGmail(
  uid: string,
  threadIds: string[],
  addLabels: string[],
  removeLabels: string[]
) {
  const shouldTrash = addLabels.includes('TRASH');
  const shouldUntrash = !shouldTrash && removeLabels.includes('TRASH');
  const remainingAddLabels = addLabels.filter((label) => label !== 'TRASH');
  const remainingRemoveLabels = removeLabels.filter((label) => label !== 'TRASH');

  if (shouldTrash) {
    await Promise.all(threadIds.map((threadId) => mailApi.trashThread(uid, threadId)));
  } else if (shouldUntrash) {
    await Promise.all(threadIds.map((threadId) => mailApi.untrashThread(uid, threadId)));
  }

  if (remainingAddLabels.length === 0 && remainingRemoveLabels.length === 0) return;

  if (threadIds.length > 1) {
    await mailApi.batchModifyThreads(uid, threadIds, remainingAddLabels, remainingRemoveLabels);
  } else if (threadIds.length === 1) {
    await mailApi.modifyThread(uid, threadIds[0], remainingAddLabels, remainingRemoveLabels);
  }
}

export interface IPerformThreadsAction {
  uid: string;
  threadIds: string[];
  addLabels?: string[];
  removeLabels?: string[];
  callApi?: boolean;
  shouldRemoveThread?: boolean;
  shouldRestoreThread?: boolean;
  afterStateUpdate?: () => void;
}

export function useThreadLabelAtom() {
  const [threadsMap] = useAtom(threadsMapAtom);
  const { updateThreadsState } = useThreadOperationAtom();
  const { addThreadsToDebounce } = useMessage();
  const { isOnline, queueAction } = useOffline();

  const performThreadsAction = useCallback(
    async <T>({
      uid,
      threadIds = [],
      addLabels = [],
      removeLabels = [],
      callApi = true,
      shouldRemoveThread = false,
      shouldRestoreThread = false,
      afterStateUpdate
    }: IPerformThreadsAction) => {
      // Update the thread state locally
      await updateThreadsState(uid, threadIds, addLabels, removeLabels, true, {
        shouldRemoveThreads: shouldRemoveThread,
        shouldRestoreThreads: shouldRestoreThread
      });

      // Only add to debounce if we have threads to process
      if (threadIds.length > 0) {
        addThreadsToDebounce(threadIds);
      }

      if (afterStateUpdate) afterStateUpdate();

      // Call the API if needed
      if (callApi) {
        if (!isOnline) {
          // Queue the action for offline sync
          await queueAction({
            type: 'THREAD_LABEL_ACTION',
            data: {
              uid,
              threadIds,
              addLabels,
              removeLabels
            }
          });

          // toast.info(
          //   `Action saved for offline sync (${threadIds.length} thread${threadIds.length !== 1 ? 's' : ''})`
          // );
          return;
        }

        try {
          await applyThreadLabelsToGmail(uid, threadIds, addLabels, removeLabels);

          if (addLabels.includes('UNREAD')) {
            electronApi.incrementBadge(threadIds.length);
          }
          if (removeLabels.includes('UNREAD')) {
            electronApi.decrementBadge(threadIds.length);
          }
        } catch (error) {
          const revertAddLabels = removeLabels; // What we removed, we now add back
          const revertRemoveLabels = addLabels; // What we added, we now remove

          await updateThreadsState(uid, threadIds, revertAddLabels, revertRemoveLabels, true, {
            shouldRemoveThreads: shouldRestoreThread, // Swap these
            shouldRestoreThreads: shouldRemoveThread
          });
          throw error;
          // Could add error handling here
        }
      }
    },
    [updateThreadsState, addThreadsToDebounce, threadsMap, isOnline, queueAction]
  );

  // Memoize all exposed functions to prevent recreating them on each render
  const markThreadAsDone = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['INBOX'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const unmarkThreadAsDone = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: ['INBOX'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const markThreadAsSpam = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: ['SPAM'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const unmarkThreadAsSpam = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['SPAM'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const unmarkThreadsAsUnread = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['UNREAD'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const markThreadsAsUnread = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) => {
      performThreadsAction({
        uid,
        threadIds,
        addLabels: ['UNREAD'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      });
    },
    [performThreadsAction, threadsMap]
  );

  const markThreadAsTrash = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: ['TRASH'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const unmarkThreadAsTrash = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['TRASH'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const markThreadAsStar = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: ['STARRED'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const unmarkThreadAsStar = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['STARRED'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const addLabelToThread = useCallback(
    (
      uid: string,
      threadIds: string[],
      labelId: string,
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: [labelId],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const removeLabelFromThread = useCallback(
    (
      uid: string,
      threadIds: string[],
      labelId: string,
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: [labelId],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  const updateLabelFromThread = useCallback(
    (
      uid: string,
      threadIds: string[],
      addLabels: string[],
      removeLabels: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels,
        removeLabels,
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate
      }),
    [performThreadsAction, threadsMap]
  );

  return {
    markThreadAsDone,
    unmarkThreadAsDone,
    markThreadAsSpam,
    unmarkThreadAsSpam,
    unmarkThreadsAsUnread,
    markThreadsAsUnread,
    markThreadAsTrash,
    unmarkThreadAsTrash,
    markThreadAsStar,
    unmarkThreadAsStar,
    addLabelToThread,
    removeLabelFromThread,
    updateLabelFromThread
  };
}
