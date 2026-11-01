import { useHotkeys } from 'react-hotkeys-hook';
import {
  completesGoTo,
  focusedElementOwnsKey,
  isComposeExpanded,
  overlayOpen
} from '@/renderer/app/lib/hotkeyGuards';
import { useCallback, useMemo, useRef } from 'react';
import { useCommandTable, useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { CommandType } from '@/renderer/app/types';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { quickReplyControl } from '@/renderer/app/lib/quickReplyControl';
import { replyTargets } from '@/renderer/app/lib/replyRecipients';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useStore } from 'jotai';
import { isDoneViewQuery } from '@/renderer/app/lib/readerBackLabel';
import {
  activeLayoutAtom,
  currentSearchQueryAtom,
  readerReturnLayoutAtom
} from '@/renderer/app/store/layout/useGlobalAtom';

type ThreadHotkeyTarget = {
  source: 'selection' | 'highlight' | 'active' | 'none';
  threadIds: string[];
};

// Plain-key shortcuts step aside while an expanded compose covers the app
// (isComposeExpanded): focus resting on a compose button (e.g. the Cc toggle)
// turned typing "c"/"e" into a new compose / Done, and Backspace after removing
// a recipient chip trashed the open thread. Modifier shortcuts (MOD+…) still work.
// Enter means Reply All in the reader — unless Enter already has a job (see
// focusedElementOwnsKey).
const enterHasOtherJob = focusedElementOwnsKey;
// The second key of a "G then …" go-to is not a shortcut of its own
// (completesGoTo), and an open dialog or menu (a Delete confirmation, the
// row menu) owns plain keys: E or ⌫ there acted on the conversation behind it.
//
// The guards are module-level functions on purpose: react-hotkeys-hook
// compares its options by value, and a function made during render is a new
// value each time, so every render re-registered every hotkey, which updates
// the hotkeys provider and renders again ("Maximum update depth exceeded").
const plainKeyIgnored = () => isComposeExpanded() || completesGoTo() || overlayOpen();
const plainKeyGuard = (hotkey: string) =>
  /(^|\+)(MOD|CTRL|META|ALT|OPTION)\+/i.test(hotkey) ? {} : { ignoreEventWhen: plainKeyIgnored };

// Whether an email is open, kept current by useRegisterHotkeys for the
// list-only guard below (a stable function, see above).
let readerOpen = false;
const listOnlyIgnored = () => readerOpen || isComposeExpanded() || overlayOpen();

// Reply (R), Reply all (A) and Forward (F) also act on the row the list
// cursor or the pointer is on (getThreadHotkeyTarget), so they are live in
// the global scope too. Enter stays reader-only: on the list it opens a row.
const replyScopes = (hotkey: string, scope: string) =>
  hotkey === 'Enter' ? [scope] : ['GLOBAL', scope];

// Select-all works on the list only; in the reader ⌘A is the text's select-all.
const LIST_ONLY_COMMANDS = new Set<CommandType>(['THREAD_SELECT_ALL']);

// Commands whose palette page acts on the open or selected conversations.
const THREAD_PAGE_COMMANDS = new Set<CommandType>(['REMINDER', 'LABEL', 'MOVE']);

export const useRegisterHotkeys = (options = {}) => {
  const executeCommand = useExecuteCommand();
  const commands = useCommandTable();
  const { openDialog } = useDialogs();
  const { activeThreadId, selectedThreads, threadsMap, setSelectedThreads } = useThreadAtom();
  readerOpen = !!activeThreadId;
  // Defined below; the ⌘K handler reads the latest through this ref.
  const getThreadHotkeyTargetRef = useRef<() => ThreadHotkeyTarget>(() => ({
    source: 'none',
    threadIds: []
  }));
  const { trackEvent } = useUserTrackingData();
  const { undoLastAction, hasUndoActions } = useUndoManager();
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const { getHighlightedItemId } = useKeyboardNavigationContext();
  const store = useStore();

  // Undo is a plain Z (like E / Backspace). As a single key it is ignored in
  // form fields / the editor (react-hotkeys-hook defaults) and while a compose
  // window is open (plainKeyGuard), so typing "z" never undoes anything — and
  // MOD+Z stays the native text undo inside inputs.
  useHotkeys(
    'Z',
    (e) => {
      e.preventDefault();
      if (hasUndoActions) {
        trackEvent('hotkey_command_executed', { command: 'UNDO_LAST_ACTION' });

        // Execute the undo action without dismissing all toasts
        // The specific action's toast will handle its own dismissal
        try {
          undoLastAction();
        } catch (error) {
          console.error('Error performing undo action:', error);
          toast.error(t('toast.error.undo_action'));
        }
      }
    },
    { preventDefault: true, ...plainKeyGuard('Z'), ...options },
    [undoLastAction, hasUndoActions, trackEvent, t]
  );

  // Open the command palette with MOD+K. A row the cursor or the pointer is on
  // becomes the selection first (as H / L / M do), so the palette offers the
  // conversation commands for it: they were hidden although E, S, U acted on it.
  useHotkeys(
    'MOD+K',
    () => {
      trackEvent('hotkey_command_executed', { command: 'COMMAND_PALETTE_OPEN' });
      const target = getThreadHotkeyTargetRef.current();
      if (target.source === 'highlight') setSelectedThreads(target.threadIds);
      openDialog('commandPalette', {
        pages: [],
        searchQuery: '',
        bookmarkName: ''
      });
    },
    { preventDefault: true, ...options },
    [openDialog, trackEvent, setSelectedThreads]
  );

  // --- Paired command registration logic ---

  // Define paired commands mapping (which command to run based on thread state)
  const pairedCommands = {
    U: {
      // Mark read/unread hotkey
      check: (thread) => thread.labelIds.includes('UNREAD'),
      trueCommand: 'THREAD_MARK_READ',
      falseCommand: 'THREAD_MARK_UNREAD'
    },
    S: {
      // Star/unstar hotkey
      check: (thread) => thread.labelIds.includes('STARRED'),
      trueCommand: 'THREAD_UNSTAR',
      falseCommand: 'THREAD_STAR'
    },
    E: {
      // Done/undone hotkey
      check: (thread) => thread.labelIds.includes('INBOX'),
      trueCommand: 'THREAD_DONE',
      falseCommand: 'THREAD_UNDONE'
    },
    'MOD+Backspace': {
      // Trash/untrash hotkey
      check: (thread) => thread.labelIds.includes('TRASH'),
      trueCommand: 'THREAD_UNTRASH',
      falseCommand: 'THREAD_TRASH'
    },
    Backspace: {
      // Trash/untrash hotkey
      check: (thread) => thread.labelIds.includes('TRASH'),
      trueCommand: 'THREAD_UNTRASH',
      falseCommand: 'THREAD_TRASH'
    },
    // Superhuman / Gmail trash key (Shift+3; matched by the character).
    '#': {
      check: (thread) => thread.labelIds.includes('TRASH'),
      trueCommand: 'THREAD_UNTRASH',
      falseCommand: 'THREAD_TRASH'
    },
    Delete: {
      // Trash/untrash hotkey
      check: (thread) => thread.labelIds.includes('TRASH'),
      trueCommand: 'THREAD_UNTRASH',
      falseCommand: 'THREAD_TRASH'
    }
  };

  const getThreadHotkeyTarget = useCallback((): ThreadHotkeyTarget => {
    // While a thread is open the list is hidden behind the full-screen reader,
    // so a leftover selection, hover or keyboard highlight there must not
    // redirect E/U/S/Backspace away from the email being read.
    if (activeThreadId) {
      return { source: 'active', threadIds: [activeThreadId] };
    }

    if (selectedThreads.length > 0) {
      return { source: 'selection', threadIds: selectedThreads };
    }

    const highlightedThreadId = getHighlightedItemId('thread-list');
    if (highlightedThreadId) {
      return { source: 'highlight', threadIds: [highlightedThreadId] };
    }

    return { source: 'none', threadIds: [] };
  }, [activeThreadId, getHighlightedItemId, selectedThreads]);

  getThreadHotkeyTargetRef.current = getThreadHotkeyTarget;

  const getExplicitThreadArgs = useCallback((target: ThreadHotkeyTarget) => {
    return target.source === 'selection' || target.source === 'highlight'
      ? { threadIds: target.threadIds }
      : undefined;
  }, []);

  // Register paired command hotkeys
  Object.entries(pairedCommands).forEach(([hotkey, { check, trueCommand, falseCommand }]) => {
    useHotkeys(
      hotkey,
      (e) => {
        e.preventDefault();
        const target = getThreadHotkeyTarget();
        const firstTargetThread =
          target.threadIds.length > 0 ? threadsMap[target.threadIds[0]] : null;
        if (!firstTargetThread || target.threadIds.length === 0) return;

        // E is Done for whatever of the target is in the Inbox (as the
        // selection bar's Done counts it: any row in the Inbox). With none
        // in the Inbox it moves them back, but only in the Done view or for an
        // email opened from Later: in Sent, Starred, Trash or a search, E (Done,
        // by habit) pulled your own sent mail into the Inbox. There it says so
        // and offers it instead.
        if (hotkey === 'E') {
          const inInbox = target.threadIds.filter((id) =>
            threadsMap[id]?.labelIds.includes('INBOX')
          );
          if (inInbox.length > 0) {
            trackEvent('hotkey_command_executed', { command: 'THREAD_DONE' });
            executeCommand(
              'THREAD_DONE',
              inInbox.length === target.threadIds.length
                ? getExplicitThreadArgs(target)
                : { threadIds: inInbox }
            );
            return;
          }
          const movesBack =
            store.get(activeLayoutAtom) !== 'MAIL' ||
            store.get(readerReturnLayoutAtom) === 'LATER' ||
            isDoneViewQuery(store.get(currentSearchQueryAtom));
          if (!movesBack) {
            // The exact emails E was pressed on, not whatever is open when
            // the toast's button is clicked.
            const threadIds = [...target.threadIds];
            toast(t('header.display.already_done', { defaultValue: 'Already out of your Inbox' }), {
              action: {
                label: t('header.display.move_to_inbox', { defaultValue: 'Move to Inbox' }),
                onClick: () => executeCommand('THREAD_UNDONE', { threadIds })
              }
            });
            return;
          }
        }

        // Determine which command to run based on the thread's current state
        const commandToRun = check(firstTargetThread) ? trueCommand : falseCommand;
        trackEvent('hotkey_command_executed', { command: commandToRun });
        executeCommand(commandToRun as CommandType, getExplicitThreadArgs(target));
      },
      { preventDefault: true, useKey: hotkey === '#', ...plainKeyGuard(hotkey), ...options },
      [
        executeCommand,
        getExplicitThreadArgs,
        getThreadHotkeyTarget,
        threadsMap,
        trackEvent,
        store,
        t
      ]
    );
  });

  // Register all other commands with their own hotkeys
  const commandsToRegister = useMemo(() => {
    // Get list of all commands
    const allCommands = Object.keys(commands) as CommandType[];

    // Exclude commands that are handled by paired hotkeys
    const pairedCommandsSet = new Set([
      'THREAD_MARK_READ',
      'THREAD_MARK_UNREAD',
      'THREAD_STAR',
      'THREAD_UNSTAR',
      'THREAD_DONE',
      'THREAD_UNDONE',
      'THREAD_TRASH',
      'THREAD_UNTRASH'
    ]);

    return allCommands.filter((cmd) => !pairedCommandsSet.has(cmd));
  }, [commands]);

  // Register all non-paired commands
  commandsToRegister.forEach((commandId: CommandType) => {
    const command = commands[commandId];
    if (command.hotkeys) {
      command.hotkeys.forEach((hotkey) => {
        switch (commandId) {
          case 'COMPOSE_REPLY_MESSAGE':
            useHotkeys(
              hotkey,
              () => {
                const targetThreadIds = getThreadHotkeyTarget().threadIds;
                if (targetThreadIds.length > 0) {
                  const thread = threadsMap[targetThreadIds[0]];
                  if (thread) {
                    // The open email: its quick reply, right under it.
                    if (targetThreadIds.length === 1 && quickReplyControl.open?.(thread.id)) {
                      trackEvent('hotkey_command_executed', {
                        command: 'QUICK_REPLY',
                        accountId: thread.accountId
                      });
                      return;
                    }
                    // The latest message from someone else (your own latest
                    // in a thread you only sent to: the reply then goes to
                    // its recipients), as the reply bar picks it.
                    const { replyTarget: item } = replyTargets(
                      thread.items.filter((entry) => entry.type === 'message') as MonoMessage[],
                      accounts.map((account) => account.email)
                    );

                    if (item) {
                      trackEvent('hotkey_command_executed', {
                        command: 'COMPOSE_REPLY_MESSAGE',
                        accountId: thread.accountId
                      });
                      executeCommand(commandId, {
                        message: item,
                        accountId: thread.accountId
                      });
                    }
                  }
                }
              },
              {
                scopes: replyScopes(hotkey, command.scope),
                preventDefault: true,
                ...plainKeyGuard(hotkey),
                ...options
              },
              [executeCommand, getThreadHotkeyTarget, threadsMap, trackEvent, accounts]
            );
            break;

          case 'COMPOSE_REPLY_ALL_MESSAGE':
            useHotkeys(
              hotkey,
              (e) => {
                if (hotkey === 'Enter' && enterHasOtherJob()) return;
                const targetThreadIds = getThreadHotkeyTarget().threadIds;
                const thread = targetThreadIds.length > 0 ? threadsMap[targetThreadIds[0]] : null;
                const lastMessage = thread?.getLastMessage();
                if (!thread || !lastMessage) return;
                e.preventDefault();
                // A reply being written under the open email continues as
                // Reply all there, rather than a second draft.
                if (
                  targetThreadIds.length === 1 &&
                  quickReplyControl.open?.(thread.id, { replyAll: true, onlyIfWriting: true })
                )
                  return;
                trackEvent('hotkey_command_executed', {
                  command: 'COMPOSE_REPLY_ALL_MESSAGE',
                  accountId: thread.accountId
                });
                executeCommand(commandId, { message: lastMessage, accountId: thread.accountId });
              },
              { scopes: replyScopes(hotkey, command.scope), ...plainKeyGuard(hotkey), ...options },
              [executeCommand, getThreadHotkeyTarget, threadsMap, trackEvent]
            );
            break;

          case 'COMPOSE_FORWARD_MESSAGE':
            useHotkeys(
              hotkey,
              () => {
                const targetThreadIds = getThreadHotkeyTarget().threadIds;
                if (targetThreadIds.length > 0) {
                  const thread = threadsMap[targetThreadIds[0]];
                  if (thread) {
                    const lastMessage = thread.getLastMessage();
                    if (lastMessage) {
                      trackEvent('hotkey_command_executed', { command: 'COMPOSE_FORWARD_MESSAGE' });
                      executeCommand(commandId, {
                        message: lastMessage,
                        accountId: thread.accountId
                      });
                    }
                  }
                }
              },
              {
                scopes: replyScopes(hotkey, command.scope),
                preventDefault: true,
                ...plainKeyGuard(hotkey),
                ...options
              },
              [executeCommand, getThreadHotkeyTarget, threadsMap, trackEvent, accounts]
            );
            break;

          case 'COMPOSE_NEW_MESSAGE':
            useHotkeys(
              hotkey,
              () => {
                trackEvent('hotkey_command_executed', { command: 'COMPOSE_NEW_MESSAGE' });
                executeCommand(commandId);
              },
              {
                scopes: [command.scope],
                preventDefault: true,
                ...plainKeyGuard(hotkey),
                ...options
              },
              [executeCommand, trackEvent]
            );
            break;

          default: {
            // Snooze / Label / Move open a palette page that acts on the
            // selection. Like E / S / U they also take the row the arrow keys
            // rest on (it becomes the selection), so they're registered in
            // the global scope too; with nothing to act on they do nothing.
            const opensPageOnThreads = THREAD_PAGE_COMMANDS.has(commandId);
            // Sequences ("G>I") skip ignoreEventWhen in react-hotkeys-hook, so
            // the compose guard is checked in the handler.
            const isSequence = hotkey.includes('>');
            useHotkeys(
              hotkey,
              (e) => {
                if (isSequence && isComposeExpanded()) return;
                e.preventDefault();
                const target = getThreadHotkeyTarget();
                if (opensPageOnThreads) {
                  if (target.threadIds.length === 0) return;
                  if (target.source === 'highlight') setSelectedThreads(target.threadIds);
                }
                const args =
                  command.scope === 'CONVERSATION_SELECTED'
                    ? getExplicitThreadArgs(target)
                    : undefined;
                trackEvent('hotkey_command_executed', { command: commandId });
                executeCommand(commandId, args);
              },
              {
                scopes: opensPageOnThreads ? ['GLOBAL', command.scope] : [command.scope],
                preventDefault: true,
                useKey: hotkey === '!' || hotkey === '?',
                ...plainKeyGuard(hotkey),
                ...(LIST_ONLY_COMMANDS.has(commandId)
                  ? {
                      // ignoreEventWhen returns before the library's
                      // preventDefault, so the native select-all still runs.
                      ignoreEventWhen: listOnlyIgnored
                    }
                  : {}),
                ...options
              },
              [
                command.scope,
                executeCommand,
                getExplicitThreadArgs,
                getThreadHotkeyTarget,
                opensPageOnThreads,
                setSelectedThreads,
                trackEvent
              ]
            );
            break;
          }
        }
      });
    }
  });
};
