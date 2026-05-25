import { useHotkeys } from 'react-hotkeys-hook';
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

export const useRegisterHotkeys = (options = {}) => {
  const executeCommand = useExecuteCommand();
  const commands = useCommands();
  const { openDialog } = useDialogs();
  const { activeThreadId, selectedThreads, threadsMap } = useThreadAtom();
  const { trackEvent } = useUserTrackingData();
  const { undoLastAction, hasUndoActions } = useUndoManager();
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const { getHighlightedItemId } = useKeyboardNavigationContext();

  useHotkeys(
    'MOD+Z',
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
    { preventDefault: true, ...options },
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
    if (selectedThreads.length > 0) {
      return { source: 'selection', threadIds: selectedThreads };
    }

    const highlightedThreadId = getHighlightedItemId('thread-list');
    if (highlightedThreadId) {
      return { source: 'highlight', threadIds: [highlightedThreadId] };
    }

    if (activeThreadId) {
      return { source: 'active', threadIds: [activeThreadId] };
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
      { preventDefault: true, ...options },
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
                    const items = thread.items.filter(
                      (item) =>
                        item.type === 'message' &&
                        !accounts.some(
                          (account) => account.email === (item as MonoMessage).from.email
                        )
                    ) as MonoMessage[];

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
              { scopes: [command.scope], preventDefault: true, ...options },
              [executeCommand, getThreadHotkeyTarget, threadsMap, trackEvent, accounts]
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
              { scopes: [command.scope], preventDefault: true, ...options },
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
                ...options
              },
              [executeCommand, trackEvent]
            );
            break;

          default:
            useHotkeys(
              hotkey,
              (e) => {
                e.preventDefault();
                const target = getThreadHotkeyTarget();
                const args =
                  command.scope === 'CONVERSATION_SELECTED'
                    ? getExplicitThreadArgs(target)
                    : undefined;
                trackEvent('hotkey_command_executed', { command: commandId });
                executeCommand(commandId, args);
              },
              {
                scopes: [command.scope],
                preventDefault: true,
                useKey: hotkey === '!' || hotkey === '?',
                ...options
              },
              [
                command.scope,
                executeCommand,
                getExplicitThreadArgs,
                getThreadHotkeyTarget,
                trackEvent
              ]
            );
            break;
        }
      });
    }
  });
};
