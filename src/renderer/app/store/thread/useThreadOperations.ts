import { withCachedBodies } from '@/main/models/message/bodyData';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { isThreadItemWithLabels } from '@/main/models/thread/ThreadItem';
import { DBUpdateMessageLabels } from '@/renderer/app/lib/db/message';
import {
  DBGetThread,
  DBRemoveThread,
  DBSaveThread,
  DBSaveThreads
} from '@/renderer/app/lib/db/thread';
import { useSetAtom, useStore } from 'jotai';
import { useCallback } from 'react';
import { activeThreadIdAtom, filteredThreadIdsAtom, threadIdsAtom, threadsMapAtom } from './atoms';

// A label change, each label once: an undo can add back a label that the
// action it reverses already restored (when that action failed and rolled back).
const withLabels = (labelIds: string[], add: string[], remove: string[]) =>
  Array.from(new Set([...add, ...labelIds.filter((id) => !remove.includes(id))])).sort();

// A copy of `value` (same prototype, so a MonoThread / MonoMessage stays one)
// with `patch` applied. List rows subscribe to their own thread object
// (useThreadRowAtom), so a label change must produce a new object: mutating
// the cached one in place leaves the row showing the old read/unread state.
// Every own property is copied as defined (search results carry accountId as a
// non-enumerable property, which a plain Object.assign would drop).
const copyWith = <T extends object>(value: T, patch: Partial<T>): T =>
  Object.assign(
    Object.create(Object.getPrototypeOf(value), Object.getOwnPropertyDescriptors(value)),
    patch
  );

/** `thread` and its labelled items with the label change applied, as new objects. */
export const relabelThread = (
  thread: MonoThread,
  addLabelIds: string[],
  removeLabelIds: string[]
): MonoThread =>
  copyWith(thread, {
    labelIds: withLabels(thread.labelIds, addLabelIds, removeLabelIds),
    items: thread.items.map((item) =>
      isThreadItemWithLabels(item)
        ? copyWith(item, { labelIds: withLabels(item.labelIds, addLabelIds, removeLabelIds) })
        : item
    )
  });

export function useThreadOperationAtom() {
  // Setters and on-demand reads only. Subscribing to threadsMap here re-rendered
  // every consumer of this hook (and recreated every callback below) on each
  // thread update; the callbacks read the current map from the store instead.
  const store = useStore();
  const setThreadsMap = useSetAtom(threadsMapAtom);
  const setActiveThreadId = useSetAtom(activeThreadIdAtom);
  // useSetAtom — setters only, WITHOUT subscribing to the value. Subscribing here
  // (via useAtom) made every consumer of this hook — AuthContext, the fetch
  // handler, command hooks — re-render on every threadIds/filteredThreadIds
  // change, which storms during load and stalls it.
  const setThreadIds = useSetAtom(threadIdsAtom);
  const setFilteredThreadIds = useSetAtom(filteredThreadIdsAtom);

  const setThreads = useCallback(
    async (
      uid: string,
      newThreads: MonoThread[],
      replace: boolean = true,
      saveToLocal: boolean = true
    ) => {
      setThreadsMap((prev) => {
        // A listing is metadata-only; keep the bodies already loaded for the
        // same messages, or every refresh would make the next open of a read
        // email fetch its body again.
        const threads = newThreads.map((thread) => withCachedBodies(thread, prev[thread.id]));
        const updatedMap = replace
          ? Object.fromEntries(threads.map((thread) => [thread.id, thread]))
          : {
              ...prev,
              ...Object.fromEntries(threads.map((thread) => [thread.id, thread]))
            };

        if (saveToLocal) {
          // Group threads by their actual accountId to ensure proper database
          // isolation. Persist only the incoming `threads` — the rest of
          // `updatedMap` was already saved by earlier calls, so re-writing the
          // whole accumulated map on every page turned paginated load into
          // O(n^2) IndexedDB writes.
          const threadsByAccount: Record<string, MonoThread[]> = {};

          threads.forEach((thread) => {
            // Use thread's accountId if available, otherwise fall back to uid
            const accountId =
              Object.getOwnPropertyDescriptor(thread, 'accountId')?.value ||
              thread.accountId ||
              uid;

            if (!threadsByAccount[accountId]) {
              threadsByAccount[accountId] = [];
            }
            threadsByAccount[accountId].push(thread);
          });

          // Save threads to their respective account databases
          Object.entries(threadsByAccount).forEach(([accountId, threads]) => {
            DBSaveThreads(accountId, threads);
          });
        }

        return updatedMap;
      });
    },
    [setThreadsMap]
  );

  const addThreads = useCallback(
    async (uid: string, newThreads: MonoThread[], saveToLocal: boolean = true) => {
      setThreadsMap((prev) => {
        const threads = newThreads.map((thread) => withCachedBodies(thread, prev[thread.id]));
        const updatedMap = {
          ...prev,
          ...Object.fromEntries(threads.map((thread) => [thread.id, thread]))
        };
        if (saveToLocal) {
          // Persist only the incoming batch, not the whole accumulated map.
          DBSaveThreads(uid, threads);
        }
        return updatedMap;
      });
    },
    [setThreadsMap]
  );

  const addThread = useCallback(
    async (uid: string, newThread: MonoThread, saveToLocal: boolean = true) => {
      let thread = newThread;
      setThreadsMap((prev) => {
        thread = withCachedBodies(newThread, prev[newThread.id]);
        return { ...prev, [newThread.id]: thread };
      });
      if (saveToLocal) {
        await DBSaveThread(uid, thread);
      }
    },
    [setThreadsMap]
  );

  const addThreadsFromIds = useCallback(
    async (uid: string, threadIds: string[]) => {
      const loaded: Record<string, MonoThread> = {};
      for (const threadId of threadIds) {
        const thread = await DBGetThread(uid, threadId);
        if (thread) {
          loaded[threadId] = thread;
        }
      }
      // Merge into the map as it is now, not as it was before the awaits.
      setThreadsMap((prev) => ({ ...prev, ...loaded }));
    },
    [setThreadsMap]
  );

  const updateThread = useCallback(
    async (uid: string, updatedThread: MonoThread, saveToLocal: boolean = true) => {
      // Memory first: the reader shows a body the moment it lands, not once the
      // IndexedDB write (and its contact bookkeeping) has gone through.
      let thread = updatedThread;
      setThreadsMap((prev) => {
        thread = withCachedBodies(updatedThread, prev[updatedThread.id]);
        return { ...prev, [updatedThread.id]: thread };
      });
      if (saveToLocal) {
        // Use the thread's accountId if available, otherwise fall back to the provided uid
        await DBSaveThread(updatedThread.accountId || uid, thread);
      }
    },
    [setThreadsMap]
  );

  const updateThreads = useCallback(
    async (uid: string, newThreads: MonoThread[], saveToLocal: boolean = true) => {
      setThreadsMap((prev) => {
        const updatedMap = { ...prev };
        const threads = newThreads.map((thread) => withCachedBodies(thread, prev[thread.id]));
        threads.forEach((thread) => {
          updatedMap[thread.id] = thread;
        });

        if (saveToLocal) {
          // Group threads by accountId
          const threadsByAccount: Record<string, MonoThread[]> = {};

          threads.forEach((thread) => {
            const accountId = thread.accountId || uid;
            if (!threadsByAccount[accountId]) {
              threadsByAccount[accountId] = [];
            }
            threadsByAccount[accountId].push(thread);
          });

          // Save threads for each account
          Object.entries(threadsByAccount).forEach(([accountId, threads]) => {
            DBSaveThreads(accountId, threads);
          });
        }

        return updatedMap;
      });
    },
    [setThreadsMap]
  );

  const resetThreadsMap = () => {
    setThreadsMap({});
    setActiveThreadId(null);
  };

  const removeThreadFromMap = useCallback(
    async (threadId: string) => {
      if (store.get(activeThreadIdAtom) === threadId) {
        setActiveThreadId(null);
      }

      setThreadsMap((prev) => {
        const updatedMap = { ...prev };
        delete updatedMap[threadId];
        return updatedMap;
      });
    },
    [store, setActiveThreadId, setThreadsMap]
  );

  const removeThreadsFromMap = useCallback(
    async (threadIds: string[]) => {
      const activeThreadId = store.get(activeThreadIdAtom);
      if (activeThreadId && threadIds.includes(activeThreadId)) {
        setActiveThreadId(null);
      }

      setThreadsMap((prev) => {
        const updatedMap = { ...prev };
        for (const threadId of threadIds) {
          delete updatedMap[threadId];
        }
        return updatedMap;
      });
    },
    [store, setActiveThreadId, setThreadsMap]
  );

  const removeThread = useCallback(
    async (uid: string, threadId: string, saveToLocal: boolean = true) => {
      // Get the thread to determine its accountId before removing it
      const thread = store.get(threadsMapAtom)[threadId];
      const accountToUse = thread?.accountId || uid;

      if (saveToLocal) {
        await DBRemoveThread(accountToUse, threadId);
      }
      await removeThreadFromMap(threadId);
    },
    [store, removeThreadFromMap]
  );

  // Helper function to group threads by accountId
  const groupThreadsByAccount = useCallback(
    (threadIds: string[]): Record<string, string[]> => {
      const threadsByAccount: Record<string, string[]> = {};
      const threadsMap = store.get(threadsMapAtom);

      threadIds.forEach((threadId) => {
        const thread = threadsMap[threadId];
        if (thread && thread.accountId) {
          if (!threadsByAccount[thread.accountId]) {
            threadsByAccount[thread.accountId] = [];
          }
          threadsByAccount[thread.accountId].push(threadId);
        }
      });

      return threadsByAccount;
    },
    [store]
  );

  const updateThreadState = useCallback(
    async (
      uid: string,
      threadId: string,
      addLabelIds: string[],
      removeLabelIds: string[],
      saveToLocal: boolean = true
    ) => {
      // Get the thread and determine the correct accountId
      const existingThread = store.get(threadsMapAtom)[threadId];
      const accountToUse = existingThread?.accountId || uid;

      const stored = existingThread || (await DBGetThread(accountToUse, threadId));

      if (stored) {
        const thread = relabelThread(stored, addLabelIds, removeLabelIds);
        // Update thread in state
        setThreadsMap((prev) => ({ ...prev, [threadId]: thread }));

        // Update labels of the stored messages
        if (saveToLocal) {
          thread.items.forEach(async (item) => {
            if (isThreadItemWithLabels(item) && item.type === 'message') {
              await DBUpdateMessageLabels(accountToUse, item.id, addLabelIds, removeLabelIds);
            }
          });
        }

        if (saveToLocal) {
          await DBSaveThread(accountToUse, thread);
        }
      } else {
        console.error(`Conversation with ID ${threadId} not found`);
      }
    },
    [store, setThreadsMap]
  );

  const updateThreadsState = useCallback(
    async (
      uid: string,
      threadIds: string[],
      addLabelIds: string[],
      removeLabelIds: string[],
      saveToLocal: boolean = true,
      options: {
        shouldRemoveThreads?: boolean;
        shouldRestoreThreads?: boolean;
        skipUIUpdate?: boolean;
      } = {}
    ) => {
      const { shouldRemoveThreads = false, shouldRestoreThreads = false } = options;

      // Use functional state update to work with current state
      setThreadsMap((currentThreadsMap) => {
        const updatedMap = { ...currentThreadsMap };

        // Group threads by account using CURRENT data
        const threadsByAccount: Record<string, string[]> = {};
        threadIds.forEach((threadId) => {
          const thread = updatedMap[threadId];
          const accountId = thread?.accountId || uid;
          if (!threadsByAccount[accountId]) {
            threadsByAccount[accountId] = [];
          }
          threadsByAccount[accountId].push(threadId);
        });

        // If no threads with accountId found, use provided uid
        if (Object.keys(threadsByAccount).length === 0 && threadIds.length > 0) {
          threadsByAccount[uid] = threadIds;
        }

        // Schedule DB operations to run after state update
        const dbOperations: Array<() => Promise<void>> = [];

        // Process threads for each account
        for (const [accountId, accountThreadIds] of Object.entries(threadsByAccount)) {
          for (const threadId of accountThreadIds) {
            const thread = updatedMap[threadId];

            // If thread not found and we need to restore it, try to load from DB
            if (!thread && shouldRestoreThreads) {
              dbOperations.push(async () => {
                const dbThread = await DBGetThread(accountId, threadId);

                if (dbThread) {
                  // Apply label updates to the restored thread
                  dbThread.labelIds = withLabels(dbThread.labelIds, addLabelIds, removeLabelIds);

                  // Update thread items
                  dbThread.items.forEach((item) => {
                    if (isThreadItemWithLabels(item)) {
                      item.labelIds = withLabels(item.labelIds, addLabelIds, removeLabelIds);

                      // Schedule DB operations for message labels
                      if (saveToLocal && item.type === 'message') {
                        dbOperations.push(() =>
                          DBUpdateMessageLabels(accountId, item.id, addLabelIds, removeLabelIds)
                        );
                      }
                    }
                  });

                  // Save the updated thread
                  if (saveToLocal) {
                    await DBSaveThread(accountId, dbThread);
                  }

                  // Update state with the restored and updated thread
                  setThreadsMap((prev) => ({ ...prev, [threadId]: dbThread }));
                }
              });
              continue;
            }
            if (!thread) {
              console.error(`Thread ${threadId} not found and shouldRestoreThreads is false`);
              continue;
            }

            // New objects, so the row and the reader see the change.
            const relabeled = relabelThread(thread, addLabelIds, removeLabelIds);
            updatedMap[threadId] = relabeled;

            if (saveToLocal) {
              relabeled.items.forEach((item) => {
                if (isThreadItemWithLabels(item) && item.type === 'message') {
                  dbOperations.push(() =>
                    DBUpdateMessageLabels(accountId, item.id, addLabelIds, removeLabelIds)
                  );
                }
              });
              dbOperations.push(() => DBSaveThread(accountId, relabeled));
            }
          }
        }

        // Handle thread removal (if requested)
        if (shouldRemoveThreads) {
          threadIds.forEach((threadId) => {
            delete updatedMap[threadId];
          });
        }

        // Execute DB operations asynchronously
        if (dbOperations.length > 0) {
          setTimeout(() => {
            Promise.all(dbOperations.map((op) => op())).catch((error) => {
              console.error('Error in DB operations:', error);
            });
          }, 0);
        }

        return updatedMap;
      });

      // Keep the rendered id lists consistent with threadsMap. The map update
      // above (shouldRemoveThreads) deletes the thread object, but the id stays
      // in threadIds/filteredThreadIds — a "dangling id" that points at a missing
      // map entry. The thread rows then have to defensively render null, and any
      // unguarded consumer of that id throws mid-render and unmounts the whole
      // list. Prune the ids here so map and lists never drift. On restore (undo)
      // add them back so the thread reappears in the list, not just the map.
      if (threadIds.length > 0 && (shouldRemoveThreads || shouldRestoreThreads)) {
        const targetIds = new Set(threadIds);
        if (shouldRemoveThreads) {
          const prune = (prev: string[]) => prev.filter((id) => !targetIds.has(id));
          setThreadIds(prune);
          setFilteredThreadIds(prune);
        } else {
          // restore: append any missing ids; the list re-sorts by timestamp once
          // the map entry is present.
          const merge = (prev: string[]) => {
            const present = new Set(prev);
            const next = [...prev];
            threadIds.forEach((id) => {
              if (!present.has(id)) next.push(id);
            });
            return next;
          };
          setThreadIds(merge);
          setFilteredThreadIds(merge);
        }
      }
    },
    [setThreadsMap, setThreadIds, setFilteredThreadIds]
  );

  return {
    setThreads,
    addThread,
    addThreads,
    addThreadsFromIds,
    updateThread,
    updateThreads,
    removeThread,
    resetThreadsMap,
    removeThreadFromMap,
    removeThreadsFromMap,
    updateThreadState,
    updateThreadsState,
    // Expose the group helper for command usage
    groupThreadsByAccount
  };
}
