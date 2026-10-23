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
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { contextMenuSelectionAtom } from '@/renderer/app/store/thread/contextMenuAtom';
import { CommandType } from '@/renderer/app/types';
import { isBackendConfigured } from '@/main/api/apiClient';
import { useSetAtom } from 'jotai';
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
  const { labelsMapByAccount } = useLabelAtom();
  const setContextMenuSelection = useSetAtom(contextMenuSelectionAtom);

  const isDraft = isComposeDraftId(thread.id);
  const accountId = isDraft ? getUidFromEmail(thread.from[0]?.email) : null;

  // Memoize target threads calculation

  // Right-clicking a row outside the selection selects just that row, so the
  // menu's commands target it. When the menu closes the previous selection
  // comes back either way: every command below gets its targets passed
  // explicitly when picked, and a selection left behind made E / U / ⌫ hit
  // that row instead of the open or highlighted one.
  const implicitSelectionRef = useRef<string[] | null>(null);
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        implicitSelectionRef.current = null;
        if (!selectedThreads.some((t) => t === thread.id)) {
          implicitSelectionRef.current = selectedThreads;
          setSelectedThreads([thread.id]);
          setContextMenuSelection(true);
        }
        return;
      }
      if (implicitSelectionRef.current) {
        setSelectedThreads(implicitSelectionRef.current);
      }
      implicitSelectionRef.current = null;
      setContextMenuSelection(false);
    },
    [selectedThreads, thread.id, setSelectedThreads, setContextMenuSelection]
  );

  // The Label page has nothing to offer for an account without user labels
  // (Microsoft 365 labels aren't loaded); Move covers folders there.
  const accountHasLabels = useMemo(
    () =>
      Object.keys(labelsMapByAccount[thread.accountId] ?? {}).some((id) => id.startsWith('Label_')),
    [labelsMapByAccount, thread.accountId]
  );

  // Pin / search target the latest person in the thread who isn't you — on a
  // thread you started, the first sender is you.
  const contactRecipient = useMemo(() => {
    const own = new Set(accounts.map((account) => account.email.trim().toLowerCase()));
    const fromOthers = (
      thread.items.filter((item) => item.type === 'message') as MonoMessage[]
    ).filter((message) => message.from?.email && !own.has(message.from.email.toLowerCase()));
    const latest = fromOthers[fromOthers.length - 1]?.from;
    if (latest) return latest as MonoRecipient;
    const first = thread.from[0] as MonoRecipient | undefined;
    return first && !own.has(first.email?.toLowerCase()) ? first : null;
  }, [thread, accounts]);

  // The targetThreads can now be simplified since selection is updated on open
  const targetThreads = useMemo(() => selectedThreads, [selectedThreads]);
  // Memoize menu items to prevent recreation on each render
  const menuItems = useMemo(() => {
    const singleThreadSelected = selectedThreads.length === 1;
    const fromRecipient = contactRecipient;
    // Done / Move to Inbox don't apply to Trash, or to threads you only sent
    // (Sent): moving those "to Inbox" put your own mail there.
    const own = new Set(accounts.map((account) => account.email.trim().toLowerCase()));
    const messages = thread.items.filter((item) => item.type === 'message') as MonoMessage[];
    const sentOnly =
      !thread.labelIds.includes('INBOX') &&
      messages.length > 0 &&
      messages.every((message) => own.has(message.from?.email?.toLowerCase()));
    const offerDone = !thread.labelIds.includes('TRASH') && !sentOnly;

    // If it's a draft, show draft-related actions
    if (isDraft) {
      const isSending = sendDraftQueue.includes(thread.id);

      return [
        {
          icon: 'Trash',
          label: t('command.discard_draft'),
          command: 'DISCARD_DRAFT',
          disabled: isSending
        }
      ].filter(Boolean) as {
        icon?: MonoIconType;
        label: string;
        title?: string;
        shortcut?: Keys;
        command?: CommandType;
        disabled?: boolean;
      }[];
    }

    // Original thread-related actions
    // R / F only work in the reader, so their hints aren't shown here.
    return [
      !offerDone
        ? null
        : thread.labelIds.includes('INBOX')
          ? {
              icon: 'CheckCircle',
              label: t('command.thread_done'),
              shortcut: 'E',
              command: 'THREAD_DONE'
            }
          : {
              icon: 'Inbox',
              label: t('command.thread_move_to_inbox', { defaultValue: 'Move to Inbox' }),
              shortcut: 'E',
              command: 'THREAD_UNDONE'
            },

      singleThreadSelected
        ? {
            icon: 'Reply',
            label: t('command.compose_reply_message'),
            command: 'COMPOSE_REPLY_MESSAGE'
          }
        : null,
      singleThreadSelected
        ? {
            icon: 'Forward',
            label: t('command.compose_forward_message'),
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

      { label: 'Separator' },

      // The same three "put it somewhere" actions as the reader toolbar and
      // the selection bar. They open a palette page, so the rows stay
      // selected for it (see handleContextMenuCommand).
      !thread.labelIds.includes('TRASH')
        ? {
            icon: 'Clock',
            label: t('command.reminder_ellipsis', { defaultValue: 'Snooze…' }),
            shortcut: 'H',
            command: 'REMINDER'
          }
        : null,
      {
        icon: 'ArrowRight',
        label: t('command.move_ellipsis', { defaultValue: 'Move to…' }),
        shortcut: 'M',
        command: 'MOVE'
      },
      accountHasLabels
        ? {
            icon: 'Label',
            label: t('command.label_ellipsis', { defaultValue: 'Label…' }),
            shortcut: 'L',
            command: 'LABEL'
          }
        : null,

      singleThreadSelected && fromRecipient && isBackendConfigured()
        ? { label: 'Separator' }
        : null,

      singleThreadSelected && fromRecipient && isBackendConfigured()
        ? {
            icon: 'Pin',
            label: t('command.pin_named', {
              defaultValue: 'Pin {{name}}',
              name: fromRecipient.name || fromRecipient.email
            }),
            title: fromRecipient.email,
            shortcut: 'MOD+E',
            command: 'PIN_CONTACT'
          }
        : null,

      singleThreadSelected && fromRecipient
        ? {
            icon: 'Search',
            label: t('command.search_from', {
              defaultValue: 'Emails from {{name}}',
              name: fromRecipient.name || fromRecipient.email
            }),
            title: fromRecipient.email,
            command: 'SEARCH'
          }
        : null,

      { label: 'Separator' },

      !thread.labelIds.includes('SPAM') && !thread.labelIds.includes('TRASH')
        ? {
            icon: 'AlertCircle',
            label: t('command.thread_report_spam'),
            shortcut: '!',
            command: 'THREAD_REPORT_SPAM'
          }
        : null,

      thread.labelIds.includes('TRASH')
        ? {
            icon: 'Trash',
            label: t('command.thread_untrash'),
            command: 'THREAD_UNTRASH'
          }
        : {
            icon: 'Trash',
            label: t('command.thread_trash'),
            shortcut: 'Backspace',
            command: 'THREAD_TRASH'
          }
    ].filter(Boolean) as {
      icon?: MonoIconType;
      label: string;
      title?: string;
      shortcut?: Keys;
      command?: CommandType;
      disabled?: boolean;
    }[];
  }, [
    selectedThreads,
    thread,
    t,
    isDraft,
    sendDraftQueue,
    contactRecipient,
    accounts,
    accountHasLabels
  ]);

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
          case 'THREAD_REPORT_SPAM':
            executeCommand(command, { threadIds: targetThreads });
            break;

          case 'REMINDER':
          case 'MOVE':
          case 'LABEL':
            // These open a palette page that acts on the live selection, so
            // the rows the menu was opened for stay selected: the menu's
            // close must not put the previous selection back.
            implicitSelectionRef.current = null;
            setContextMenuSelection(false);
            setSelectedThreads(targetThreads);
            executeCommand(command);
            break;

          case 'PIN_CONTACT':
            if (contactRecipient) {
              executeCommand('PIN_CONTACT', { pinContact: contactRecipient.email });
            }
            break;

          case 'SEARCH':
            // The address, not the display name: a nameless sender produced a
            // bare "from:" and "Jane Doe" became `from:Jane Doe` (two terms).
            if (contactRecipient) {
              searchNewQuery(`from:${contactRecipient.email}`, undefined, false);
            }
            break;

          default:
            console.error(`Unknown command: ${command}`);
            break;
        }
      }
    },
    [
      thread,
      executeCommand,
      targetThreads,
      searchNewQuery,
      isDraft,
      accountId,
      removeDraft,
      contactRecipient,
      setSelectedThreads,
      setContextMenuSelection
    ]
  );

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {/* Portaled, but React events still bubble to the row: without this a
          menu click also opened the email. */}
      <ContextMenuContent className="dark w-64" onClick={(e) => e.stopPropagation()}>
        {menuItems.map((menuItem, index) => (
          <div key={`${menuItem.label}-${index}`}>
            {menuItem.label === 'Separator' ? (
              <ContextMenuSeparator />
            ) : (
              <ContextMenuItem
                role="menuitem"
                onClick={() => {
                  if (menuItem.command) {
                    handleContextMenuCommand(menuItem.command, menuItem.disabled);
                  }
                }}
                tabIndex={0}
                disabled={menuItem.disabled}
                title={menuItem.title}
                className={menuItem.disabled ? 'cursor-not-allowed opacity-50' : ''}
              >
                {menuItem.icon && (
                  <MonoIcon className="mr-2 text-muted-foreground" type={menuItem.icon} />
                )}
                <span className="min-w-0 flex-1 truncate">{menuItem.label}</span>
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
