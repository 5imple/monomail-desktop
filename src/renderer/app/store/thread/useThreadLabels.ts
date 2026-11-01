import mailApi from '@/main/api/mail/mailApi';
import { useMessage } from '@/renderer/app/context/MessageContext';
import { useOffline } from '@/renderer/app/context/OfflineContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { useSetAtom } from 'jotai';
import { threadExitIntentAtom, ThreadExitIntent } from '@/renderer/app/store/thread/exitIntentAtom';
import { useCallback } from 'react';

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
  /** An undo: the action it reverses, which the server change waits for. */
  waitFor?: Promise<unknown>;
}

export function useThreadLabelAtom() {
  // No thread-store subscription: the callbacks below never read the map, and
  // subscribing re-rendered every caller (the reader, its header, commands) on
  // each thread update.
  // Tells the thread list how a leaving row should animate (see exitIntentAtom).
  const setExitIntents = useSetAtom(threadExitIntentAtom);
  const setExitIntent = useCallback(
    (threadIds: string[], intent: ThreadExitIntent | null) =>
      setExitIntents((prev) => {
        const next = { ...prev };
        threadIds.forEach((id) => {
          if (intent) next[id] = intent;
          else delete next[id];
        });
        return next;
      }),
    [setExitIntents]
  );
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
      afterStateUpdate,
      waitFor
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
        // An undo shows at once but reverses on the server only after the
        // action it undoes is through there; if that failed it was rolled back
        // already, so there is nothing left to undo.
        if (waitFor) {
          try {
            await waitFor;
          } catch {
            return;
          }
          // The server hears of it only now (archive-on-send waits out the
          // undo-send countdown): keep a refresh from re-listing it until
          // the change has had time to land.
          if (threadIds.length > 0) addThreadsToDebounce(threadIds);
        }
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
          // And again from when the server has it: its lists can lag a moment.
          if (threadIds.length > 0) addThreadsToDebounce(threadIds);

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
    [updateThreadsState, addThreadsToDebounce, isOnline, queueAction]
  );

  // Memoize all exposed functions to prevent recreating them on each render
  const markThreadAsDone = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) => {
      setExitIntent(threadIds, 'archive');
      return performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['INBOX'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      });
    },
    [performThreadsAction, setExitIntent]
  );

  const unmarkThreadAsDone = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) => {
      setExitIntent(threadIds, null);
      return performThreadsAction({
        uid,
        threadIds,
        addLabels: ['INBOX'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      });
    },
    [performThreadsAction, setExitIntent]
  );

  const markThreadAsSpam = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) => {
      setExitIntent(threadIds, 'trash');
      return performThreadsAction({
        uid,
        threadIds,
        addLabels: ['SPAM'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      });
    },
    [performThreadsAction, setExitIntent]
  );

  const unmarkThreadAsSpam = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) => {
      setExitIntent(threadIds, null);
      return performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['SPAM'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      });
    },
    [performThreadsAction, setExitIntent]
  );

  const unmarkThreadsAsUnread = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['UNREAD'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      }),
    [performThreadsAction]
  );

  const markThreadsAsUnread = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: ['UNREAD'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      }),
    [performThreadsAction]
  );

  const markThreadAsTrash = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) => {
      setExitIntent(threadIds, 'trash');
      return performThreadsAction({
        uid,
        threadIds,
        addLabels: ['TRASH'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      });
    },
    [performThreadsAction, setExitIntent]
  );

  const unmarkThreadAsTrash = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) => {
      setExitIntent(threadIds, null);
      return performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['TRASH'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      });
    },
    [performThreadsAction, setExitIntent]
  );

  const markThreadAsStar = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: ['STARRED'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      }),
    [performThreadsAction]
  );

  const unmarkThreadAsStar = useCallback(
    (
      uid: string,
      threadIds: string[],
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: ['STARRED'],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      }),
    [performThreadsAction]
  );

  const addLabelToThread = useCallback(
    (
      uid: string,
      threadIds: string[],
      labelId: string,
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels: [labelId],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      }),
    [performThreadsAction]
  );

  const removeLabelFromThread = useCallback(
    (
      uid: string,
      threadIds: string[],
      labelId: string,
      callApi = true,
      shouldRemoveThread: boolean = false,
      shouldRestoreThread: boolean = false,
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        removeLabels: [labelId],
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      }),
    [performThreadsAction]
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
      afterStateUpdate?: () => void,
      waitFor?: Promise<unknown>
    ) =>
      performThreadsAction({
        uid,
        threadIds,
        addLabels,
        removeLabels,
        callApi,
        shouldRemoveThread,
        shouldRestoreThread,
        afterStateUpdate,
        waitFor
      }),
    [performThreadsAction]
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
