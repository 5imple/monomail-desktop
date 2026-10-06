import { MonoMessage } from '@/main/models/message/MonoMessage';
import { isComposeDraftId } from '@/main/utils';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { MonoRecipient } from '@/main/models/types';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/InboxIcon';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { CommandType } from '@/renderer/app/types';
import React, { FC, useMemo, useCallback, useRef } from 'react';
import { Keys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';

interface ThreadItemContextMenuProps {
  children: React.ReactNode;
  thread: MonoThread;
}

const ThreadItemContextMenu: FC<ThreadItemContextMenuProps> = React.memo(({ children, thread }) => {
  const { selectedThreads, setSelectedThreads } = useThreadAtom();
  const { t } = useTranslation();
  const { searchNewQuery } = useGlobalAtom();
  const executeCommand = useExecuteCommand();
  const { removeDraft, sendDraftQueue } = useDraftAtom();
  const { getUidFromEmail } = useAuth();
  const { accounts } = useAuth();

  const isDraft = isComposeDraftId(thread.id);
  const accountId = isDraft ? getUidFromEmail(thread.from[0]?.email) : null;

  // Memoize target threads calculation

  // Right-clicking a row outside the selection selects just that row, so the
  // menu's commands target it. If the menu is then dismissed without picking
  // anything, put the previous selection back — otherwise the row stayed lit
  // as "selected" after a mere right-click.
  const implicitSelectionRef = useRef<string[] | null>(null);
  const commandChosenRef = useRef(false);
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        commandChosenRef.current = false;
        implicitSelectionRef.current = null;
        if (!selectedThreads.some((t) => t === thread.id)) {
          implicitSelectionRef.current = selectedThreads;
          setSelectedThreads([thread.id]);
        }
        return;
      }
      if (implicitSelectionRef.current && !commandChosenRef.current) {
        setSelectedThreads(implicitSelectionRef.current);
      }
      implicitSelectionRef.current = null;
    },
    [selectedThreads, thread.id, setSelectedThreads]
  );

  // The targetThreads can now be simplified since selection is updated on open
  const targetThreads = useMemo(() => selectedThreads, [selectedThreads]);
  // Memoize menu items to prevent recreation on each render
  const menuItems = useMemo(() => {
    const isInSelectedThreads = selectedThreads.some((t) => t === thread.id);
    const singleThreadSelected = selectedThreads.length === 1;
    const fromRecipient = thread.from.length > 0 ? (thread.from[0] as MonoRecipient) : null;

    // If it's a draft, show draft-related actions
    if (isDraft) {
      const isSending = sendDraftQueue.includes(thread.id);

      return [
        {
          icon: 'Trash',
          label: t('command.discard_draft'),
          shortcut: '#',
          command: 'DISCARD_DRAFT',
          disabled: isSending
        }
      ].filter(Boolean) as {
        icon?: MonoIconType;
        label: string;
        shortcut?: Keys;
        command?: CommandType;
        disabled?: boolean;
      }[];
    }

    // Original thread-related actions
    return [
      thread.labelIds.includes('INBOX')
        ? {
            icon: 'CheckCircle',
            label: t('command.thread_done'),
            shortcut: 'E',
            command: 'THREAD_DONE'
          }
        : {
            icon: 'Inbox',
            label: t('command.thread_undone'),
            shortcut: 'E',
            command: 'THREAD_UNDONE'
          },

      singleThreadSelected
        ? {
            icon: 'Reply',
            label: t('command.compose_reply_message'),
            shortcut: 'R',
            command: 'COMPOSE_REPLY_MESSAGE'
          }
        : null,
      singleThreadSelected
        ? {
            icon: 'Forward',
            label: t('command.compose_forward_message'),
            shortcut: 'F',
            command: 'COMPOSE_FORWARD_MESSAGE'
          }
        : null,

      { label: 'Separator' },

      thread.labelIds.includes('UNREAD')
        ? {
            icon: 'Envelope',
            label: t('command.thread_mark_read'),
            shortcut: 'U',
            command: 'THREAD_MARK_READ'
          }
        : {
            icon: 'EnvelopeOpen',
            label: t('command.thread_mark_unread'),
            shortcut: 'U',
            command: 'THREAD_MARK_UNREAD'
          },

      thread.labelIds.includes('STARRED')
        ? {
            icon: 'Star',
            label: t('command.thread_unstar'),
            shortcut: 'S',
            command: 'THREAD_UNSTAR'
          }
        : {
            icon: 'Star',
            label: t('command.thread_star'),
            shortcut: 'S',
            command: 'THREAD_STAR'
          },

      singleThreadSelected ? { label: 'Separator' } : null,

      singleThreadSelected && fromRecipient
        ? {
            icon: 'Pin',
            label: `${t('command.pin_contact')} "${fromRecipient.name}"`,
            shortcut: '⌘+T',
            command: 'PIN_CONTACT'
          }
        : null,

      singleThreadSelected && fromRecipient
        ? {
            icon: 'Search',
            // The address, not the display name: a nameless sender produced a
            // bare "from:" and "Jane Doe" became `from:Jane Doe` (two terms).
            label: `${t('command.search')} "from:${fromRecipient.email}"`,
            command: 'SEARCH'
          }
        : null,

      { label: 'Separator' },

      thread.labelIds.includes('TRASH')
        ? {
            icon: 'Trash',
            label: t('command.thread_untrash'),
            command: 'THREAD_UNTRASH'
          }
        : {
            icon: 'Trash',
            label: t('command.thread_trash'),
            shortcut: '#',
            command: 'THREAD_TRASH'
          }
    ].filter(Boolean) as {
      icon?: MonoIconType;
      label: string;
      shortcut?: Keys;
      command?: CommandType;
      disabled?: boolean;
    }[];
  }, [selectedThreads, thread, t, isDraft, sendDraftQueue]);

  // Memoize the command handler to prevent recreation on each render
  const handleContextMenuCommand = useCallback(
    async (command: CommandType, disabled: boolean | undefined) => {
      if (disabled) return;

      if (isDraft) {
        // Handle draft-specific commands
        switch (command) {
          // case 'EDIT_DRAFT':
          //   executeCommand('COMPOSE_NEW_MESSAGE', {
          //     draft: thread,
          //     accountId: accountId
          //   });
          //   break;

          // case 'SEND_DRAFT':
          //   // Implementation would depend on how you handle draft sending
          //   // This is just a placeholder based on what I can infer
          //   executeCommand('SEND_DRAFT', {
          //     draftId: thread.id,
          //     accountId: accountId
          //   });
          //   break;

          case 'DISCARD_DRAFT':
            if (accountId) {
              // If multiple drafts are selected, remove all of them
              if (targetThreads.length > 1) {
                await Promise.all(
                  targetThreads.map((threadId) => removeDraft(accountId, threadId))
                );
              } else {
                await removeDraft(accountId, thread.id);
              }
            }
            break;

          default:
            console.error(`Unknown command: ${command}`);
            break;
        }
      } else {
        // Handle thread-specific commands
        switch (command) {
          case 'COMPOSE_REPLY_MESSAGE':
          case 'COMPOSE_FORWARD_MESSAGE': {
            const messages = thread.items.filter(
              (item) => item.type === 'message'
            ) as MonoMessage[];
            // Reply prefers the latest message from someone else; Forward (like
            // the F hotkey) takes the latest message. Both fall back to the last
            // message so threads of only your own mail (Sent) still work.
            const fromOthers = messages.filter(
              (message) => !accounts.some((account) => account.email === message.from.email)
            );
            const pool =
              command === 'COMPOSE_REPLY_MESSAGE' && fromOthers.length > 0 ? fromOthers : messages;
            const item = pool[pool.length - 1];
            if (item) {
              executeCommand(command, { message: item, accountId: thread.accountId });
            }
            break;
          }

          case 'THREAD_MARK_READ':
          case 'THREAD_MARK_UNREAD':
          case 'THREAD_TRASH':
          case 'THREAD_UNTRASH':
          case 'THREAD_DONE':
          case 'THREAD_UNDONE':
          case 'THREAD_STAR':
          case 'THREAD_UNSTAR':
            executeCommand(command, { threadIds: targetThreads });
            break;

          case 'PIN_CONTACT':
            if (thread.from.length > 0) {
              executeCommand('PIN_CONTACT', { pinContact: thread.from[0].email });
            }
            break;

          case 'SEARCH':
            if (thread.from.length > 0) {
              searchNewQuery(`from:${thread.from[0].email}`, undefined, false);
            }
            break;

          default:
            console.error(`Unknown command: ${command}`);
            break;
        }
      }
    },
    [thread, executeCommand, targetThreads, searchNewQuery, isDraft, accountId, removeDraft]
  );

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="dark w-64">
        {menuItems.map((menuItem, index) => (
          <div key={`${menuItem.label}-${index}`}>
            {menuItem.label === 'Separator' ? (
              <ContextMenuSeparator />
            ) : (
              <ContextMenuItem
                role="menuitem"
                onClick={() => {
                  commandChosenRef.current = true;
                  if (menuItem.command) {
                    handleContextMenuCommand(menuItem.command, menuItem.disabled);
                  }
                }}
                tabIndex={0}
                disabled={menuItem.disabled}
                className={menuItem.disabled ? 'cursor-not-allowed opacity-50' : ''}
              >
                {menuItem.icon && (
                  <MonoIcon className="mr-2 text-muted-foreground" type={menuItem.icon} />
                )}
                <span className="line-clamp-1">{menuItem.label}</span>
                {menuItem.shortcut && (
                  <ContextMenuShortcut>
                    <ShortcutKeyboard variant={'flat'} shortcut={menuItem.shortcut} />
                  </ContextMenuShortcut>
                )}
              </ContextMenuItem>
            )}
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
});

// Display name for debugging
ThreadItemContextMenu.displayName = 'ThreadItemContextMenu';

export default ThreadItemContextMenu;
