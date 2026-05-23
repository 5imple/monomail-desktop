import { MonoThread } from '@/main/models/thread/MonoThread';
import { isThreadItemWithLabels } from '@/main/models/thread/ThreadItem';
import { DBUpdateMessageLabels } from '@/renderer/app/lib/db/message';
import {
  DBGetThread,
  DBRemoveThread,
  DBSaveThread,
  DBSaveThreads
} from '@/renderer/app/lib/db/thread';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  threadIdsAtom,
  threadsMapAtom
} from './atoms';

export function useThreadOperationAtom() {
  const [threadsMap, setThreadsMap] = useAtom(threadsMapAtom);
  const [activeThreadId, setActiveThreadId] = useAtom(activeThreadIdAtom);
  const [, setThreadIds] = useAtom(threadIdsAtom);
  const [, setFilteredThreadIds] = useAtom(filteredThreadIdsAtom);

  const setThreads = useCallback(
    async (
      uid: string,
      newThreads: MonoThread[],
      replace: boolean = true,
      saveToLocal: boolean = true
    ) => {
      setThreadsMap((prev) => {
        const updatedMap = replace
          ? Object.fromEntries(newThreads.map((thread) => [thread.id, thread]))
          : {
              ...prev,
              ...Object.fromEntries(newThreads.map((thread) => [thread.id, thread]))
            };

        if (saveToLocal) {
          // Group threads by their actual accountId to ensure proper database isolation
          const threadsByAccount: Record<string, MonoThread[]> = {};

          Object.values(updatedMap).forEach((thread) => {
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
    [threadsMap]
  );

  const addThreads = useCallback(
    async (uid: string, newThreads: MonoThread[], saveToLocal: boolean = true) => {
      setThreadsMap((prev) => {
        const updatedMap = {
          ...prev,
          ...Object.fromEntries(newThreads.map((thread) => [thread.id, thread]))
        };
        if (saveToLocal) {
          DBSaveThreads(uid, Object.values(updatedMap));
        }
        return updatedMap;
      });
    },
    [threadsMap]
  );

  const addThread = useCallback(
    async (uid: string, newThread: MonoThread, saveToLocal: boolean = true) => {
      if (saveToLocal) {
        await DBSaveThread(uid, newThread);
      }
      setThreadsMap((prev) => ({ ...prev, [newThread.id]: newThread }));
    },
    []
  );

  const addThreadsFromIds = useCallback(
    async (uid: string, threadIds: string[]) => {
      const updatedMap = { ...threadsMap };
      for (const threadId of threadIds) {
        const thread = await DBGetThread(uid, threadId);
        if (thread) {
          updatedMap[threadId] = thread;
        }
      }
      setThreadsMap(updatedMap);
    },
    [threadsMap]
  );

  const updateThread = useCallback(
    async (uid: string, updatedThread: MonoThread, saveToLocal: boolean = true) => {
      if (saveToLocal) {
        // Use the thread's accountId if available, otherwise fall back to the provided uid
        const accountToUse = updatedThread.accountId || uid;
        await DBSaveThread(accountToUse, updatedThread);
      }

      setThreadsMap((prev) => ({ ...prev, [updatedThread.id]: updatedThread }));
    },
    [threadsMap]
  );

  const updateThreads = useCallback(
    async (uid: string, newThreads: MonoThread[], saveToLocal: boolean = true) => {
      setThreadsMap((prev) => {
        const updatedMap = { ...prev };
        newThreads.forEach((thread) => {
          updatedMap[thread.id] = thread;
        });

        if (saveToLocal) {
          // Group threads by accountId
          const threadsByAccount: Record<string, MonoThread[]> = {};

          newThreads.forEach((thread) => {
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
    [threadsMap]
  );

  const removeThread = useCallback(
    async (uid: string, threadId: string, saveToLocal: boolean = true) => {
      // Get the thread to determine its accountId before removing it
      const thread = threadsMap[threadId];
      const accountToUse = thread?.accountId || uid;

      if (saveToLocal) {
        await DBRemoveThread(accountToUse, threadId);
      }
      await removeThreadFromMap(threadId);
    },
    [threadsMap]
  );

  const resetThreadsMap = () => {
    setThreadsMap({});
    setActiveThreadId(null);
  };

  const removeThreadFromMap = useCallback(
    async (threadId: string) => {
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
      }

      setThreadsMap((prev) => {
        const updatedMap = { ...prev };
        delete updatedMap[threadId];
        return updatedMap;
      });
    },
    [activeThreadId, setActiveThreadId, threadsMap]
  );

  const removeThreadsFromMap = useCallback(
    async (threadIds: string[]) => {
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
    [activeThreadId, setActiveThreadId, threadsMap]
  );

  // Helper function to group threads by accountId
  const groupThreadsByAccount = useCallback(
    (threadIds: string[]): Record<string, string[]> => {
      const threadsByAccount: Record<string, string[]> = {};

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
    [threadsMap]
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
      const existingThread = threadsMap[threadId];
      const accountToUse = existingThread?.accountId || uid;

      const thread = existingThread || (await DBGetThread(accountToUse, threadId));

      if (thread) {
        // Update thread labels
        thread.labelIds = [
          ...thread.labelIds.filter((id) => !removeLabelIds.includes(id)),
          ...addLabelIds
        ].sort();
        // Update thread in state
        setThreadsMap((prev) => ({ ...prev, [threadId]: thread }));

        // Update labels in thread items
        thread.items.forEach(async (item) => {
          if (isThreadItemWithLabels(item)) {
            item.labelIds = [
              ...item.labelIds.filter((id) => !removeLabelIds.includes(id)),
              ...addLabelIds
            ].sort();
            if (saveToLocal && item.type === 'message') {
              await DBUpdateMessageLabels(accountToUse, item.id, addLabelIds, removeLabelIds);
            }
          }
        });

        if (saveToLocal) {
          await DBSaveThread(accountToUse, thread);
        }
      } else {
        console.error(`Conversation with ID ${threadId} not found`);
      }
    },
    [threadsMap]
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
      const {
        shouldRemoveThreads = false,
        shouldRestoreThreads = false,
        skipUIUpdate = false
      } = options;

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
                  dbThread.labelIds = addLabelIds
                    .concat(dbThread.labelIds.filter((id) => !removeLabelIds.includes(id)))
                    .sort();

                  // Update thread items
                  dbThread.items.forEach((item) => {
                    if (isThreadItemWithLabels(item)) {
                      item.labelIds = addLabelIds
                        .concat(item.labelIds.filter((id) => !removeLabelIds.includes(id)))
                        .sort();

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

            // Update thread labels
            thread.labelIds = addLabelIds
              .concat(thread.labelIds.filter((id) => !removeLabelIds.includes(id)))
              .sort();

            // Update thread items
            thread.items.forEach((item) => {
              if (isThreadItemWithLabels(item)) {
                item.labelIds = addLabelIds
                  .concat(item.labelIds.filter((id) => !removeLabelIds.includes(id)))
                  .sort();

                // Schedule DB operations
                if (saveToLocal && item.type === 'message') {
                  dbOperations.push(() =>
                    DBUpdateMessageLabels(accountId, item.id, addLabelIds, removeLabelIds)
                  );
                }
              }
            });

            // Schedule thread save
            if (saveToLocal) {
              dbOperations.push(() => DBSaveThread(accountId, thread));
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
    [threadsMap, setThreadsMap, setThreadIds, setFilteredThreadIds]
  );

  const sortThreadsByDate = (threads: Record<string, MonoThread>) => {
    return Object.fromEntries(
      Object.entries(threads).sort(([, a], [, b]) => b.timestamp - a.timestamp)
    );
  };

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
