import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/InboxIcon';
import { LabelButton, SnoozeButton } from '@/renderer/app/components/mail/thread/ThreadRowActions';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { formatListDate } from '@/renderer/app/lib/formatDate';
import { threadHasFileAttachments } from '@/renderer/app/lib/threadAttachments';
import { CommandType } from '@/renderer/app/types';
import {
  isAllMine,
  isOwnAddress,
  otherRecipients
} from '@/renderer/app/components/mail/thread/threadRowModel';
import { isBackendConfigured } from '@/main/api/apiClient';
import { useDraggable } from '@dnd-kit/core';
import React from 'react';
import { useTranslation } from 'react-i18next';

// Pieces shared by the compact (ThreadListDenseItem) and comfortable
// (ThreadListCozyItem) inbox rows, so both behave identically. The pure
// logic lives in ./threadRowModel.
export { rowAvatarRecipient, stripExternalBanner } from './threadRowModel';

type AccountLike = { email: string };

interface DraggableSenderProps {
  sender: string;
  threadId: string;
  index: number;
  email: string;
}

/**
 * A sender name that can be dragged onto the pin row. Pins are stored with
 * the backend, so without one the name is plain text: a grab cursor with
 * nowhere to drop invited a drag that did nothing.
 */
export const DraggableSender = React.memo<DraggableSenderProps>(
  ({ sender, threadId, index, email }) => {
    const canPin = isBackendConfigured();
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: `thread-contact-${threadId}-${sender}-${index}`,
      attributes: {
        tabIndex: -1
      },
      disabled: !canPin,
      data: {
        from: {
          name: sender,
          email: email
        }
      }
    });

    if (!canPin) return <span>{sender}</span>;

    const style = {
      opacity: isDragging ? 0.5 : 1,
      cursor: 'grab'
    };

    return (
      <span ref={setNodeRef} {...attributes} {...listeners} style={style}>
        {sender}
      </span>
    );
  }
);
DraggableSender.displayName = 'DraggableSender';

/**
 * "Bob, Me, Draft" for conversations; "To: Alice +2" for threads you wrote
 * every message of, where "Me" on every row (the Sent view) said nothing.
 */
export const ThreadSenderNames = ({
  thread,
  accounts
}: {
  thread: MonoThread;
  accounts: AccountLike[];
}) => {
  const { t } = useTranslation();
  const draftLabel = t('thread_list.draft', { defaultValue: 'Draft' });

  const recipients = isAllMine(thread, accounts) ? otherRecipients(thread, accounts) : [];
  if (recipients.length > 0) {
    const first = recipients[0];
    const hasDraft = thread.items.some((item) => item.type === 'draft');
    return (
      <>
        {hasDraft && (
          <>
            <span className="font-medium text-destructive">{draftLabel}</span>
            {', '}
          </>
        )}
        <span className="font-normal text-muted-foreground">
          {t('thread_list.to_prefix', { defaultValue: 'To:' })}{' '}
        </span>
        <DraggableSender
          sender={first.name || first.email}
          email={first.email}
          threadId={thread.id}
          index={0}
        />
        {recipients.length > 1 && (
          <span className="font-normal text-muted-foreground"> +{recipients.length - 1}</span>
        )}
      </>
    );
  }

  const me = t('thread_list.me', { defaultValue: 'Me' });
  const uniqueItems = new Set<string>();
  const displayItems: React.ReactNode[] = [];
  [...thread.items].reverse().forEach((item, index) => {
    if (item.type === 'draft') {
      if (!uniqueItems.has('draft')) {
        uniqueItems.add('draft');
        displayItems.push(
          <span key={`draft-${index}`} className="font-medium text-destructive">
            {draftLabel}
          </span>
        );
      }
    } else if (item.type === 'message' && (item as MonoMessage).from) {
      const message = item as MonoMessage;
      const mine = isOwnAddress(accounts, message.from.email);
      const displayName = mine ? me : message.from.name || message.from.email;
      if (!uniqueItems.has(displayName)) {
        uniqueItems.add(displayName);
        displayItems.push(
          mine ? (
            <span key={`message-${index}`}>{displayName}</span>
          ) : (
            <DraggableSender
              key={`message-${index}`}
              sender={displayName}
              email={message.from.email}
              threadId={thread.id}
              index={index}
            />
          )
        );
      }
    }
  });

  return (
    <>
      {displayItems.map((item, i) => (
        <React.Fragment key={`fragment-${i}`}>
          {item}
          {i < displayItems.length - 1 && ', '}
        </React.Fragment>
      ))}
    </>
  );
};

const ACTION_BUTTON_CLASS =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground';

const RowActionButton = ({
  label,
  shortcut,
  icon,
  onAction
}: {
  label: string;
  shortcut?: string;
  icon: MonoIconType;
  onAction: () => void;
}) => (
  <Button
    variant="text"
    typeVariant="inline"
    sizeVariant="xs"
    tabIndex={-1}
    className={ACTION_BUTTON_CLASS}
    tooltip={label}
    shortcut={shortcut}
    aria-label={label}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onAction();
    }}
  >
    <MonoIcon type={icon} size={18} weight={300} grade={0} />
  </Button>
);

type LabelInfo = { name: string; color: { textColor?: string; backgroundColor?: string } };

/** Settings → Conversation Display, with the defaults the rows always had. */
export const useThreadListDisplay = () => {
  const { preference } = useAuth();
  const prefs = preference.display.threadList;
  return {
    showAvatar: prefs?.showAvatar ?? true,
    showSnippet: prefs?.showSnippet ?? true,
    showLabels: prefs?.showLabels ?? true,
    showAttachments: prefs?.showAttachments ?? true
  };
};

/**
 * Right side of a row: label / category badges and the star stay put; a
 * fixed slot holds the paperclip + date, which swap with the hover actions.
 * The swap is one-directional (date hides instantly, actions fade in; on
 * leave the actions hide instantly, the date fades back) so the two never
 * overlap half-faded, and the actions stay up while their own popover is open.
 */
export const ThreadRowMeta = ({
  thread,
  accountLabels,
  labelCap,
  onLabelClick
}: {
  thread: MonoThread;
  accountLabels: Record<string, LabelInfo>;
  labelCap?: number;
  onLabelClick: (labelName: string) => void;
}) => {
  const { t } = useTranslation();
  const executeCommand = useExecuteCommand();
  const { showLabels } = useThreadListDisplay();

  const userLabels = [
    ...new Set(thread.labelIds.filter((labelId) => labelId && labelId.includes('Label_')))
  ]
    .map((labelId) => ({ labelId, label: accountLabels[labelId] }))
    .filter(({ label }) => label && label.name.length > 0);
  // Outlook categories ("category:Red category") — shown, not clickable.
  const categories = [
    ...new Set(thread.labelIds.filter((labelId) => labelId?.startsWith('category:')))
  ];
  const cap = labelCap ?? Infinity;
  const shownLabels = userLabels.slice(0, cap);
  const shownCategories = categories.slice(0, Math.max(0, cap - shownLabels.length));

  const run = (command: CommandType) => executeCommand(command, { threadIds: [thread.id] });
  const inTrash = thread.labelIds.includes('TRASH');

  return (
    <div className="flex shrink-0 items-center gap-2">
      {showLabels && (shownLabels.length > 0 || shownCategories.length > 0) && (
        <div className="flex items-center gap-1">
          {shownLabels.map(({ labelId, label }) => (
            <Badge
              key={labelId}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLabelClick(label.name);
              }}
              className="rounded-sm"
              style={{
                color: label.color.textColor,
                backgroundColor: label.color.backgroundColor
              }}
              sizeVariant="xs"
            >
              <span className="no-drag whitespace-nowrap">{label.name.replace('Mono/', '')}</span>
            </Badge>
          ))}
          {shownCategories.map((category) => (
            <Badge
              key={category}
              variant="secondary"
              sizeVariant="xs"
              className="rounded-sm text-muted-foreground"
            >
              <span className="whitespace-nowrap">{category.slice('category:'.length)}</span>
            </Badge>
          ))}
        </div>
      )}

      {thread.labelIds.includes('STARRED') && (
        <Button
          variant="text"
          typeVariant="inline"
          sizeVariant="xs"
          tabIndex={-1}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-secondary-accent hover:bg-muted"
          tooltip={t('command.thread_unstar')}
          aria-label={t('command.thread_unstar')}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            run('THREAD_UNSTAR');
          }}
        >
          <MonoIcon type="Star" fill size={15} weight={300} grade={0} />
        </Button>
      )}

      <div className="relative flex min-w-[140px] items-center justify-end">
        <span className="flex items-center gap-2 transition-opacity duration-150 group-has-[[data-row-action][data-state=open]]:opacity-0 group-pointer-hover:opacity-0 group-pointer-hover:duration-0">
          {threadHasFileAttachments(thread) && (
            <MonoIcon type="Paperclip" className="h-3 w-3 text-muted-foreground/60" />
          )}
          <span className="shrink-0 whitespace-nowrap text-right text-[11px] text-muted-foreground">
            {formatListDate(thread.timestamp)}
          </span>
        </span>

        <div className="absolute right-0 flex items-center gap-1.5 opacity-0 transition-opacity duration-0 has-[[data-row-action][data-state=open]]:opacity-100 group-pointer-hover:opacity-100 group-pointer-hover:duration-150">
          {/* Done only means something for mail that's in the Inbox. */}
          {thread.labelIds.includes('INBOX') && (
            <RowActionButton
              label={t('command.thread_done')}
              shortcut="E"
              icon="CheckCircle"
              onAction={() => run('THREAD_DONE')}
            />
          )}
          {/* A starred row keeps its star on the left of the date (click it to
              unstar); an unstarred one offers Star here. */}
          {!thread.labelIds.includes('STARRED') && (
            <RowActionButton
              label={t('command.thread_star')}
              shortcut="S"
              icon="Star"
              onAction={() => run('THREAD_STAR')}
            />
          )}
          {thread.labelIds.includes('UNREAD') ? (
            <RowActionButton
              label={t('command.thread_mark_read')}
              shortcut="U"
              icon="EnvelopeOpen"
              onAction={() => run('THREAD_MARK_READ')}
            />
          ) : (
            <RowActionButton
              label={t('command.thread_mark_unread')}
              shortcut="U"
              icon="Envelope"
              onAction={() => run('THREAD_MARK_UNREAD')}
            />
          )}
          <LabelButton thread={thread} buttonClassName={ACTION_BUTTON_CLASS} />
          <SnoozeButton thread={thread} buttonClassName={ACTION_BUTTON_CLASS} />
          {inTrash ? (
            <RowActionButton
              label={t('command.thread_untrash')}
              icon="TrashRestore"
              onAction={() => run('THREAD_UNTRASH')}
            />
          ) : (
            <RowActionButton
              label={t('command.thread_trash')}
              shortcut="Backspace"
              icon="Trash"
              onAction={() => run('THREAD_TRASH')}
            />
          )}
        </div>
      </div>
    </div>
  );
};
