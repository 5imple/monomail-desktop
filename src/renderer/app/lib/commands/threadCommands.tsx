import React from 'react';
import { generateUUID } from '@/main/utils';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { CommandType } from '@/renderer/app/types';
import { toast } from 'sonner';
import { MonoCommand, ThreadCommandArgs } from './types';

interface ThreadCommandDependencies {
  t: (key: string, options?: any) => string;
  globalSearchQuery: string;
  selectedThreads: string[];
  filteredThreadIds: string[];
  threadsMap: any;
  setSelectedThreads: (threads: string[]) => void;
  selectNextThread: () => void;
  groupThreadsByAccount: (threadIds: string[]) => Record<string, string[]>;
  addUndoAction: (action: any) => void;
  unmarkThreadAsSpam: (accountId: string, threadIds: string[], ...args: any[]) => void;
  markThreadAsDone: (accountId: string, threadIds: string[], ...args: any[]) => void;
  unmarkThreadAsDone: (accountId: string, threadIds: string[], ...args: any[]) => void;
  markThreadAsSpam: (accountId: string, threadIds: string[], ...args: any[]) => void;
  unmarkThreadsAsUnread: (accountId: string, threadIds: string[], ...args: any[]) => void;
  markThreadsAsUnread: (accountId: string, threadIds: string[], ...args: any[]) => void;
  markThreadAsStar: (accountId: string, threadIds: string[], ...args: any[]) => void;
  unmarkThreadAsStar: (accountId: string, threadIds: string[], ...args: any[]) => void;
  unmarkThreadAsTrash: (accountId: string, threadIds: string[], ...args: any[]) => void;
  markThreadAsTrash: (accountId: string, threadIds: string[], ...args: any[]) => void;
}

export const createThreadCommands = (
  deps: ThreadCommandDependencies
): Partial<Record<CommandType, MonoCommand>> => {
  const {
    t,
    globalSearchQuery,
    selectedThreads,
    filteredThreadIds,
    threadsMap,
    setSelectedThreads,
    selectNextThread,
    groupThreadsByAccount,
    addUndoAction,
    unmarkThreadAsSpam,
    markThreadAsDone,
    unmarkThreadAsDone,
    markThreadAsSpam,
    unmarkThreadsAsUnread,
    markThreadsAsUnread,
    markThreadAsStar,
    unmarkThreadAsStar,
    unmarkThreadAsTrash,
    markThreadAsTrash
  } = deps;

  return {
    // THREAD_MARK_READ with promise toast
    THREAD_MARK_READ: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_mark_read'),
      hotkeys: ['SHIFT+MOD+U', 'U'],
      icon: 'Envelope',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise that will be executed
        const markReadPromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            unmarkThreadsAsUnread(accountId, accountThreadIds)
          );

          await Promise.all(promises);

          // Define the undo function
          undoFunction = async () => {
            const undoPromises = Object.entries(threadsByAccount).map(
              ([accountId, accountThreadIds]) => markThreadsAsUnread(accountId, accountThreadIds)
            );
            await Promise.all(undoPromises);
          };

          // Return meaningful data for success message
          return { count: threadIds.length };
        };

        const uuid = generateUUID();
        // Use toast.promise to show loading/success/error states
        toast.promise(markReadPromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.mark_read')
              : t('toast.thread.mark_reads', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }

            return data.count === 1
              ? t('toast.thread.marked_read')
              : t('toast.thread.marked_reads', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.mark_read_error')
        });
      }
    },

    // THREAD_MARK_UNREAD with promise toast
    THREAD_MARK_UNREAD: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_mark_unread'),
      hotkeys: ['SHIFT+MOD+U', 'U'],
      icon: 'EnvelopeOpen',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise that will be executed
        const markUnreadPromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            markThreadsAsUnread(accountId, accountThreadIds)
          );

          await Promise.all(promises);

          // Define the undo function
          undoFunction = async () => {
            const undoPromises = Object.entries(threadsByAccount).map(
              ([accountId, accountThreadIds]) => unmarkThreadsAsUnread(accountId, accountThreadIds)
            );
            await Promise.all(undoPromises);
          };

          // Return meaningful data for success message
          return { count: threadIds.length };
        };

        const uuid = generateUUID();
        // Use toast.promise to show loading/success/error states
        toast.promise(markUnreadPromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.mark_unread')
              : t('toast.thread.mark_reads', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }

            return data.count === 1
              ? t('toast.thread.marked_unread')
              : t('toast.thread.marked_reads', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.mark_read_error')
        });
      }
    },

    // THREAD_TRASH with promise toast
    THREAD_TRASH: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_trash'),
      icon: 'Trash',
      hotkeys: ['MOD+Backspace', 'Backspace'],
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInTrashView =
          globalSearchQuery.toLowerCase().includes('trash') &&
          !globalSearchQuery.toLowerCase().includes('-in:trash');
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise that will handle the trash operation
        const trashPromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) => {
            markThreadAsTrash(
              accountId,
              accountThreadIds,
              true,
              !isInTrashView,
              false,
              selectNextThread
            );
          });

          await Promise.all(promises);

          // Define undo function
          undoFunction = async () => {
            const undoPromises = Object.entries(threadsByAccount).map(
              ([accountId, accountThreadIds]) =>
                unmarkThreadAsTrash(accountId, accountThreadIds, true, false, true)
            );
            setSelectedThreads(threadIds);
            await Promise.all(undoPromises);
          };

          // Return meaningful data for success message
          return { count: threadIds.length };
        };
        const uuid = generateUUID();

        // Use toast.promise to show loading/success/error states
        toast.promise(trashPromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.trash')
              : t('toast.thread.trash', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }
            return data.count === 1
              ? t('toast.thread.trashed')
              : t('toast.thread.trashed', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.trash_error')
        });
      }
    },

    // THREAD_UNTRASH with promise toast
    THREAD_UNTRASH: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_untrash'),
      icon: 'TrashRestore',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInTrashView = globalSearchQuery.toLowerCase().includes('trash');
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise for the untrash operation
        const untrashPromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            unmarkThreadAsTrash(accountId, accountThreadIds, true, isInTrashView, true)
          );

          await Promise.all(promises);
          setSelectedThreads([]);

          // Define undo function
          undoFunction = async () => {
            const undoPromises = Object.entries(threadsByAccount).map(
              ([accountId, accountThreadIds]) =>
                markThreadAsTrash(accountId, accountThreadIds, true, false, isInTrashView)
            );
            await Promise.all(undoPromises);
          };

          return { count: threadIds.length };
        };

        const uuid = generateUUID();
        // Use toast.promise
        toast.promise(untrashPromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.untrash')
              : t('toast.thread.untrash', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }
            return data.count === 1
              ? t('toast.thread.untrashed')
              : t('toast.thread.untrashed', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.untrash_error')
        });
      }
    },

    // THREAD_STAR with promise toast
    THREAD_STAR: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_star'),
      hotkeys: ['SHIFT+MOD+L', 'S'],
      icon: 'Star',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise
        const starPromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            markThreadAsStar(accountId, accountThreadIds)
          );

          await Promise.all(promises);

          // Define undo function
          undoFunction = async () => {
            const undoPromises = Object.entries(threadsByAccount).map(
              ([accountId, accountThreadIds]) =>
                unmarkThreadAsStar(accountId, accountThreadIds, true)
            );
            await Promise.all(undoPromises);
          };

          return { count: threadIds.length };
        };
        const uuid = generateUUID();

        // Use toast.promise
        toast.promise(starPromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.star')
              : t('toast.thread.star', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }
            return data.count === 1
              ? t('toast.thread.starred')
              : t('toast.thread.starred', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.star_error')
        });
      }
    },

    // THREAD_UNSTAR with promise toast
    THREAD_UNSTAR: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_unstar'),
      hotkeys: ['SHIFT+MOD+L', 'S'],
      icon: 'Star',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInStarredView = globalSearchQuery.toLowerCase().includes('starred');
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise
        const unstarPromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            unmarkThreadAsStar(accountId, accountThreadIds)
          );

          await Promise.all(promises);

          // Define undo function
          undoFunction = async () => {
            const undoPromises = Object.entries(threadsByAccount).map(
              ([accountId, accountThreadIds]) => markThreadAsStar(accountId, accountThreadIds)
            );
            await Promise.all(undoPromises);
          };

          return { count: threadIds.length };
        };
        const uuid = generateUUID();

        // Use toast.promise
        toast.promise(unstarPromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.unstar')
              : t('toast.thread.unstar', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }
            return data.count === 1
              ? t('toast.thread.unstarred')
              : t('toast.thread.unstarred', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.unstar_error')
        });
      }
    },

    // THREAD_DONE with promise toast
    THREAD_DONE: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_done'),
      hotkeys: ['CTRL+MOD+A', 'E'],
      icon: 'CheckCircle',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInInboxView =
          (globalSearchQuery.toLowerCase().includes('in:inbox') &&
            !globalSearchQuery.toLowerCase().includes('not in:inbox')) ||
          globalSearchQuery.toLowerCase().includes('category:primary');
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise
        const donePromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            markThreadAsDone(
              accountId,
              accountThreadIds,
              true,
              isInInboxView,
              false,
              selectNextThread
            )
          );

          await Promise.all(promises);

          // Define undo function
          undoFunction = async () => {
            Object.entries(threadsByAccount).forEach(([accountId, accountThreadIds]) => {
              unmarkThreadAsDone(accountId, accountThreadIds, true, false, isInInboxView);
            });
            setSelectedThreads(threadIds);
          };

          return { count: threadIds.length };
        };

        const uuid = generateUUID();
        // Use toast.promise
        toast.promise(donePromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.done')
              : t('toast.thread.done', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }
            return data.count === 1
              ? t('toast.thread.done_success')
              : t('toast.thread.done_success', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.done_error')
        });
      }
    },

    THREAD_UNDONE: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_undone'),
      hotkeys: ['CTRL+MOD+A', 'E'],
      icon: 'Inbox',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInDoneView = globalSearchQuery.toLowerCase().includes('not in:inbox');

        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise
        const donePromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            unmarkThreadAsDone(accountId, accountThreadIds, true, isInDoneView, false)
          );

          await Promise.all(promises);

          // Define undo function
          undoFunction = async () => {
            Object.entries(threadsByAccount).forEach(([accountId, accountThreadIds]) => {
              markThreadAsDone(accountId, accountThreadIds, true, false, isInDoneView);
            });
            setSelectedThreads(threadIds);
          };

          return { count: threadIds.length };
        };

        const uuid = generateUUID();
        // Use toast.promise
        toast.promise(donePromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.undone')
              : t('toast.thread.undone', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }
            return data.count === 1
              ? t('toast.thread.undone_success')
              : t('toast.thread.undone_success', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.undone_error')
        });
      }
    },

    // THREAD_REPORT_SPAM with promise toast
    THREAD_REPORT_SPAM: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_report_spam'),
      hotkeys: ['SHIFT+MOD+J', '!'],
      icon: 'AlertCircle',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = (args?.threadIds ?? selectedThreads).filter((id) => id.length < 20);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        let undoFunction: (() => Promise<void>) | undefined;

        // Define the promise
        const reportSpamPromise = async () => {
          // Execute for each account's threads
          const promises = Object.entries(threadsByAccount).map(([accountId, accountThreadIds]) =>
            markThreadAsSpam(accountId, accountThreadIds, true)
          );

          await Promise.all(promises);
          setSelectedThreads([]);

          // Define undo function
          undoFunction = async () => {
            const undoPromises = Object.entries(threadsByAccount).map(
              ([accountId, accountThreadIds]) => unmarkThreadAsSpam(accountId, accountThreadIds)
            );
            await Promise.all(undoPromises);
          };

          return { count: threadIds.length };
        };

        const uuid = generateUUID();
        // Use toast.promise
        toast.promise(reportSpamPromise, {
          id: uuid,
          loading:
            threadIds.length === 1
              ? t('toast.thread.spam')
              : t('toast.thread.spam', { count: threadIds.length }),
          success: (data) => {
            if (undoFunction) {
              addUndoAction({
                execute: undoFunction,
                timestamp: Date.now(),
                toastId: uuid
              });
            }
            return data.count === 1
              ? t('toast.thread.spammed')
              : t('toast.thread.spammed', { count: data.count });
          },
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
              </span>
            ),
            onClick: () => undoFunction && undoFunction()
          },
          error: t('toast.thread.spam_error')
        });
      }
    },

    // Thread List selection commands
    THREAD_SELECT_ALL: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_select_all'),
      hotkeys: ['MOD+A', 'SHIFT+MOD+A'],
      icon: 'List',
      action: () => {
        setSelectedThreads(filteredThreadIds);
      }
    },

    THREAD_SELECT_NONE: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_select_none'),
      hotkeys: ['SHIFT+MOD+N', 'SHIFT+MOD+OPTION+N'],
      icon: 'List',
      action: () => {
        setSelectedThreads([]);
      }
    },

    THREAD_SELECT_READ: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_select_read'),
      hotkeys: ['SHIFT+ALT+R', 'SHIFT+MOD+R'],
      icon: 'Envelope',
      action: () => {
        if (!threadsMap) return;
        const readThreads = filteredThreadIds.filter(
          (threadId) => !threadsMap[threadId]?.labelIds.includes('UNREAD')
        );
        setSelectedThreads(readThreads);
      }
    },

    THREAD_SELECT_UNREAD: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_select_unread'),
      hotkeys: ['SHIFT+ALT+U', 'SHIFT+MOD+U'],
      icon: 'EnvelopeOpen',
      action: () => {
        if (!threadsMap) return;
        const unreadThreads = filteredThreadIds.filter((threadId) =>
          threadsMap[threadId]?.labelIds.includes('UNREAD')
        );
        setSelectedThreads(unreadThreads);
      }
    },

    THREAD_SELECT_STARRED: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_select_starred'),
      hotkeys: ['SHIFT+ALT+S', 'SHIFT+MOD+S'],
      icon: 'Star',
      action: () => {
        if (!threadsMap) return;
        const starredThreads = filteredThreadIds.filter((threadId) =>
          threadsMap[threadId]?.labelIds.includes('STARRED')
        );
        setSelectedThreads(starredThreads);
      }
    },

    THREAD_SELECT_UNSTARRED: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_select_unstarred'),
      hotkeys: ['SHIFT+ALT+T', 'SHIFT+MOD+T'],
      icon: 'Star',
      action: () => {
        if (!threadsMap) return;
        const unstarredThreads = filteredThreadIds.filter(
          (threadId) => !threadsMap[threadId]?.labelIds.includes('STARRED')
        );
        setSelectedThreads(unstarredThreads);
      }
    }
  };
};
