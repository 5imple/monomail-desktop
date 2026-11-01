import { isComposeDraftId } from '@/main/utils';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { CommandType } from '@/renderer/app/types';
import { advanceReaderFrom } from '@/renderer/app/store/thread/readerAdvance';
import { runUndoableAction } from '@/renderer/app/lib/commands/undoableAction';
import { toast } from 'sonner';
import { MonoCommand, ThreadCommandArgs } from './types';

interface ThreadCommandDependencies {
  t: (key: string, options?: any) => string;
  globalSearchQuery: string;
  selectedThreads: string[];
  activeThreadId: string | null;
  filteredThreadIds: string[];
  threadsMap: any;
  setSelectedThreads: (threads: string[]) => void;
  setActiveThreadId: (threadId: string | null) => void;
  selectNextThread: () => void;
  groupThreadsByAccount: (threadIds: string[]) => Record<string, string[]>;
  addUndoAction: (action: any) => void;
  removeUndoAction: (toastId: string | number) => void;
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
    activeThreadId,
    filteredThreadIds,
    threadsMap,
    setSelectedThreads,
    setActiveThreadId,
    selectNextThread,
    groupThreadsByAccount,
    addUndoAction,
    removeUndoAction,
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

  const undoLabel = (
    <span className="inline-flex items-end gap-1">
      Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'Z'} />
    </span>
  );
  // Runs `run` on each account's threads, all at once.
  const forEachAccount = (
    threadsByAccount: Record<string, string[]>,
    run: (accountId: string, threadIds: string[]) => unknown
  ) => Promise.all(Object.entries(threadsByAccount).map(([accountId, ids]) => run(accountId, ids)));
  // The toast, and its Undo / Z, come at once (see runUndoableAction).
  const undoable = (options: {
    perform: () => Promise<unknown>;
    undo: (performed: Promise<unknown>) => unknown;
    message: string;
    errorMessage: string;
  }) => runUndoableAction({ ...options, undoLabel, addUndoAction, removeUndoAction });

  // An open thread wins over the selection: the reader is full-screen while a
  // thread is open (MailLayout), so any selection left in the hidden list —
  // e.g. a row checked by a right-click — is invisible, and acting on it
  // archived/trashed emails the user couldn't see instead of the one on screen.
  const getTargetThreadIds = (args?: ThreadCommandArgs) =>
    (
      args?.threadIds ??
      (activeThreadId ? [activeThreadId] : selectedThreads.length > 0 ? selectedThreads : [])
    ).filter((id) => !isComposeDraftId(id));

  // Done / Trash / Spam on the open email: the reader moves on to the next
  // email down, measured while the email is still in the list. At the end of
  // what's loaded it waits for the next page (advanceReaderFrom); at the real
  // end of the list, the one above (it closes when the email was alone). From
  // the list itself nothing opens, since the reader would go fullscreen and
  // hide the whole inbox; advanceAfterAction keeps the explicit opt-in.
  const moveReaderOnAfter = (
    threadIds: string[],
    args?: ThreadCommandArgs
  ): (() => void) | undefined => {
    const openThreadId =
      activeThreadId && threadIds.includes(activeThreadId) ? activeThreadId : null;
    if (openThreadId && args?.returnToList) return () => setActiveThreadId(null);
    if (openThreadId) {
      const ids = filteredThreadIds.filter((id) => threadsMap[id]);
      return () => advanceReaderFrom(openThreadId, ids, setActiveThreadId);
    }
    return args?.advanceAfterAction === true ? selectNextThread : undefined;
  };

  return {
    // THREAD_MARK_READ
    THREAD_MARK_READ: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_mark_read'),
      // U toggles based on thread state via useRegisterHotkeys' pairedCommands
      // table — SHIFT+MOD+U is a different, real binding (THREAD_SELECT_UNREAD)
      // and was never actually registered for this command; don't display it.
      hotkeys: ['U'],
      icon: 'Envelope',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        undoable({
          perform: () =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadsAsUnread(accountId, ids)
            ),
          undo: (performed) =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadsAsUnread(accountId, ids, true, false, false, undefined, performed)
            ),
          message:
            threadIds.length === 1
              ? t('toast.thread.marked_read')
              : t('toast.thread.marked_reads', { count: threadIds.length }),
          errorMessage: t('toast.thread.mark_read_error')
        });
      }
    },

    // THREAD_MARK_UNREAD
    THREAD_MARK_UNREAD: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_mark_unread'),
      hotkeys: ['U'],
      icon: 'EnvelopeOpen',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        undoable({
          perform: () =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadsAsUnread(accountId, ids)
            ),
          undo: (performed) =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadsAsUnread(accountId, ids, true, false, false, undefined, performed)
            ),
          message:
            threadIds.length === 1
              ? t('toast.thread.marked_unread')
              : t('toast.thread.marked_unread', { count: threadIds.length }),
          errorMessage: t('toast.thread.mark_read_error')
        });
        // Marking the open email unread puts it back for later: the reader
        // closes and the list it was opened from shows again (as in Gmail and
        // Superhuman). Done / Trash instead move on to the next email.
        if (activeThreadId && threadIds.includes(activeThreadId)) {
          setActiveThreadId(null);
        }
      }
    },

    // THREAD_TRASH
    THREAD_TRASH: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_trash'),
      icon: 'Trash',
      // ⌫ first: the key the palette and tooltips show. # is bound in
      // useRegisterHotkeys' paired table (with the other trash keys).
      hotkeys: ['Backspace', '#', 'Delete', 'MOD+Backspace'],
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;
        const afterStateUpdate = moveReaderOnAfter(threadIds, args);

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInTrashView =
          globalSearchQuery.toLowerCase().includes('trash') &&
          !globalSearchQuery.toLowerCase().includes('-in:trash');
        undoable({
          perform: () =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadAsTrash(accountId, ids, true, !isInTrashView, false, afterStateUpdate)
            ),
          undo: (performed) => {
            const undone = forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsTrash(accountId, ids, true, false, true, undefined, performed)
            );
            setSelectedThreads(threadIds);
            return undone;
          },
          message:
            threadIds.length === 1
              ? t('toast.thread.trashed')
              : t('toast.thread.trashed', { count: threadIds.length }),
          errorMessage: t('toast.thread.trash_error')
        });
      }
    },

    // THREAD_UNTRASH
    THREAD_UNTRASH: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_untrash'),
      icon: 'TrashRestore',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInTrashView = globalSearchQuery.toLowerCase().includes('trash');
        undoable({
          perform: async () => {
            await forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsTrash(accountId, ids, true, isInTrashView, true)
            );
            setSelectedThreads([]);
          },
          undo: (performed) =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadAsTrash(accountId, ids, true, false, isInTrashView, undefined, performed)
            ),
          message:
            threadIds.length === 1
              ? t('toast.thread.untrashed')
              : t('toast.thread.untrashed', { count: threadIds.length }),
          errorMessage: t('toast.thread.untrash_error')
        });
      }
    },

    // THREAD_STAR
    THREAD_STAR: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_star'),
      // S toggles based on thread state via useRegisterHotkeys' pairedCommands
      // table — SHIFT+MOD+L was never actually registered for this command.
      hotkeys: ['S'],
      icon: 'Star',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        undoable({
          perform: () =>
            forEachAccount(threadsByAccount, (accountId, ids) => markThreadAsStar(accountId, ids)),
          undo: (performed) =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsStar(accountId, ids, true, false, false, undefined, performed)
            ),
          message:
            threadIds.length === 1
              ? t('toast.thread.starred')
              : t('toast.thread.starred', { count: threadIds.length }),
          errorMessage: t('toast.thread.star_error')
        });
      }
    },

    // THREAD_UNSTAR
    THREAD_UNSTAR: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_unstar'),
      hotkeys: ['S'],
      icon: 'Star',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        undoable({
          perform: () =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsStar(accountId, ids)
            ),
          undo: (performed) =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadAsStar(accountId, ids, true, false, false, undefined, performed)
            ),
          message:
            threadIds.length === 1
              ? t('toast.thread.unstarred')
              : t('toast.thread.unstarred', { count: threadIds.length }),
          errorMessage: t('toast.thread.unstar_error')
        });
      }
    },

    // THREAD_DONE
    THREAD_DONE: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_done'),
      // E toggles based on thread state via useRegisterHotkeys' pairedCommands
      // table — CTRL+MOD+A was never actually registered for this command.
      hotkeys: ['E'],
      icon: 'CheckCircle',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;
        const afterStateUpdate = moveReaderOnAfter(threadIds, args);

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInInboxView =
          (globalSearchQuery.toLowerCase().includes('in:inbox') &&
            !globalSearchQuery.toLowerCase().includes('not in:inbox')) ||
          globalSearchQuery.toLowerCase().includes('category:primary');
        if (args?.onQuietUndo) {
          const { waitFor } = args;
          let undone = false;
          const performed = forEachAccount(threadsByAccount, (accountId, ids) =>
            markThreadAsDone(accountId, ids, true, isInInboxView, false, afterStateUpdate, waitFor)
          );
          // No success toast (the caller has its own), but a failure says so:
          // the conversation is back in the inbox.
          performed.catch((error) => {
            console.error('[THREAD_DONE] quiet archive failed:', error);
            if (!undone) toast.error(t('toast.thread.done_error'));
          });
          args.onQuietUndo(() => {
            undone = true;
            // With waitFor the server hasn't been told yet: restore locally only.
            void forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsDone(
                accountId,
                ids,
                !waitFor,
                false,
                isInInboxView,
                undefined,
                waitFor ? undefined : performed
              )
            );
          });
          return;
        }
        undoable({
          perform: () =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadAsDone(accountId, ids, true, isInInboxView, false, afterStateUpdate)
            ),
          undo: (performed) => {
            const undone = forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsDone(accountId, ids, true, false, isInInboxView, undefined, performed)
            );
            setSelectedThreads(threadIds);
            return undone;
          },
          message:
            threadIds.length === 1
              ? t('toast.thread.done_success')
              : t('toast.thread.done_success', { count: threadIds.length }),
          errorMessage: t('toast.thread.done_error')
        });
      }
    },

    THREAD_UNDONE: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_undone'),
      hotkeys: ['E'],
      icon: 'Inbox',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        const isInDoneView = globalSearchQuery.toLowerCase().includes('not in:inbox');

        undoable({
          perform: () =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsDone(accountId, ids, true, isInDoneView, false)
            ),
          undo: (performed) => {
            const undone = forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadAsDone(accountId, ids, true, false, isInDoneView, undefined, performed)
            );
            setSelectedThreads(threadIds);
            return undone;
          },
          message:
            threadIds.length === 1
              ? t('toast.thread.undone_success')
              : t('toast.thread.undone_success', { count: threadIds.length }),
          errorMessage: t('toast.thread.undone_error')
        });
      }
    },

    // THREAD_REPORT_SPAM
    THREAD_REPORT_SPAM: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.thread_report_spam'),
      hotkeys: ['SHIFT+MOD+J', '!'],
      icon: 'AlertCircle',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds = getTargetThreadIds(args);
        if (threadIds.length === 0) return;
        const afterStateUpdate = moveReaderOnAfter(threadIds, args);

        // Group threads by account
        const threadsByAccount = groupThreadsByAccount(threadIds);
        undoable({
          perform: async () => {
            await forEachAccount(threadsByAccount, (accountId, ids) =>
              markThreadAsSpam(accountId, ids, true, false, false, afterStateUpdate)
            );
            setSelectedThreads([]);
          },
          undo: (performed) =>
            forEachAccount(threadsByAccount, (accountId, ids) =>
              unmarkThreadAsSpam(accountId, ids, true, false, false, undefined, performed)
            ),
          message:
            threadIds.length === 1
              ? t('toast.thread.spammed')
              : t('toast.thread.spammed', { count: threadIds.length }),
          errorMessage: t('toast.thread.spam_error')
        });
      }
    },

    // Thread List selection commands
    // Global, so ⌘A selects every row on a clean list too. With an email open
    // useRegisterHotkeys steps aside and ⌘A selects the email's text: it used
    // to check every row of the hidden list instead.
    THREAD_SELECT_ALL: {
      scope: 'GLOBAL',
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
