import { useHotkeys } from 'react-hotkeys-hook';
import { focusedElementOwnsKey } from '@/renderer/app/lib/hotkeyGuards';
import { useCallback, useMemo } from 'react';
import { useCommands } from '@/renderer/app/lib/commands/useCommands';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { CommandType } from '@/renderer/app/types';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';

type ThreadHotkeyTarget = {
  source: 'selection' | 'highlight' | 'active' | 'none';
  threadIds: string[];
};

// An expanded compose window covers the whole app (GlobalComposeCard is
// `absolute inset-0`), so plain-key shortcuts must not reach the hidden list or
// reader: focus resting on a compose button (e.g. the Cc toggle) turned typing
// "c"/"e" into a new compose / Done, and Backspace after removing a recipient
// chip trashed the open thread. Modifier shortcuts (MOD+…) still work.
const isComposeExpanded = () => !!document.querySelector('[data-compose-expanded="true"]');

// Enter means Reply All in the reader — unless Enter already has a job (see
// focusedElementOwnsKey).
const enterHasOtherJob = focusedElementOwnsKey;
const plainKeyGuard = (hotkey: string) =>
  /(^|\+)(MOD|CTRL|META|ALT|OPTION)\+/i.test(hotkey) ? {} : { ignoreEventWhen: isComposeExpanded };

// Commands whose palette page acts on the open or selected conversations.
const THREAD_PAGE_COMMANDS = new Set<CommandType>(['REMINDER', 'LABEL', 'MOVE']);

export const useRegisterHotkeys = (options = {}) => {
  const executeCommand = useExecuteCommand();
  const commands = useCommands();
  const { openDialog } = useDialogs();
  const { activeThreadId, selectedThreads, threadsMap, setSelectedThreads } = useThreadAtom();
  const { trackEvent } = useUserTrackingData();
  const { undoLastAction, hasUndoActions } = useUndoManager();
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const { getHighlightedItemId } = useKeyboardNavigationContext();

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

  // Open the command palette with MOD+K.
  useHotkeys(
    'MOD+K',
    () => {
      trackEvent('hotkey_command_executed', { command: 'COMMAND_PALETTE_OPEN' });
      openDialog('commandPalette', {
        pages: [],
        searchQuery: '',
        bookmarkName: ''
      });
    },
    { preventDefault: true, ...options },
    [openDialog, trackEvent]
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

        // Determine which command to run based on the thread's current state
        const commandToRun = check(firstTargetThread) ? trueCommand : falseCommand;
        trackEvent('hotkey_command_executed', { command: commandToRun });
        executeCommand(commandToRun as CommandType, getExplicitThreadArgs(target));
      },
      { preventDefault: true, ...plainKeyGuard(hotkey), ...options },
      [executeCommand, getExplicitThreadArgs, getThreadHotkeyTarget, threadsMap, trackEvent]
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
                    const messages = thread.items.filter(
                      (item) => item.type === 'message'
                    ) as MonoMessage[];
                    const fromOthers = messages.filter(
                      (message) => !accounts.some((account) => account.email === message.from.email)
                    );
                    // Fall back to your own latest message so R works in threads
                    // you only sent to (the reply then goes to its recipients).
                    const items = fromOthers.length > 0 ? fromOthers : messages;

                    if (items.length > 0) {
                      const item = items[items.length - 1];
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
                }
              },
              {
                scopes: [command.scope],
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
                if (enterHasOtherJob()) return;
                const targetThreadIds = getThreadHotkeyTarget().threadIds;
                const thread = targetThreadIds.length > 0 ? threadsMap[targetThreadIds[0]] : null;
                const lastMessage = thread?.getLastMessage();
                if (!thread || !lastMessage) return;
                e.preventDefault();
                trackEvent('hotkey_command_executed', {
                  command: 'COMPOSE_REPLY_ALL_MESSAGE',
                  accountId: thread.accountId
                });
                executeCommand(commandId, { message: lastMessage, accountId: thread.accountId });
              },
              { scopes: [command.scope], ...plainKeyGuard(hotkey), ...options },
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
                scopes: [command.scope],
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
            useHotkeys(
              hotkey,
              (e) => {
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
