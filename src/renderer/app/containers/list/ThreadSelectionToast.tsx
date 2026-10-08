import React, { useEffect, useMemo } from 'react';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { Button } from '@/renderer/app/components/ui/button';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/renderer/app/components/ui/separator';
import { toast } from 'sonner';

const ThreadSelectionToast = () => {
  const { selectedThreads, setSelectedThreads, threadsMap, activeThreadId } = useThreadAtom();
  const { accounts } = useAuth();
  const { labelsMapByAccount } = useLabelAtom();
  const executeCommand = useExecuteCommand();
  const { t } = useTranslation();

  // Get selected thread objects from the store.
  const selectedThreadObjects = useMemo(
    () => selectedThreads.map((id) => threadsMap[id]).filter(Boolean),
    [selectedThreads, threadsMap]
  );

  // Check if all selected threads are drafts
  const allDrafts = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.every((thread) => thread.labelIds.includes('DRAFT')),
    [selectedThreadObjects]
  );

  // Done applies to the selected threads that are in the Inbox; only when
  // none are does the button offer Move to Inbox — for archived mail, not
  // for Trash or threads you only sent (that put your own mail in the Inbox).
  const inboxThreadIds = useMemo(
    () =>
      selectedThreadObjects
        .filter((thread) => thread.labelIds.includes('INBOX'))
        .map((thread) => thread.id),
    [selectedThreadObjects]
  );
  const movableToInboxIds = useMemo(() => {
    const own = new Set(accounts.map((account) => account.email.trim().toLowerCase()));
    return selectedThreadObjects
      .filter((thread) => {
        if (thread.labelIds.includes('INBOX') || thread.labelIds.includes('TRASH')) return false;
        const messages = thread.items.filter((item) => item.type === 'message') as MonoMessage[];
        const sentOnly =
          messages.length > 0 &&
          messages.every((message) => own.has(message.from?.email?.toLowerCase()));
        return !sentOnly;
      })
      .map((thread) => thread.id);
  }, [selectedThreadObjects, accounts]);
  const anyInInbox = inboxThreadIds.length > 0;
  const showDoneButton = anyInInbox || movableToInboxIds.length > 0;

  // The Label page has nothing to offer when none of the accounts has labels
  // (Microsoft 365 labels aren't loaded).
  const hasUserLabels = useMemo(
    () =>
      selectedThreadObjects.some((thread) =>
        Object.keys(labelsMapByAccount[thread.accountId] ?? {}).some((id) =>
          id.startsWith('Label_')
        )
      ),
    [selectedThreadObjects, labelsMapByAccount]
  );

  const allStarred = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.every((thread) => thread.labelIds.includes('STARRED')),
    [selectedThreadObjects, threadsMap]
  );

  const allTrashed = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.every((thread) => thread.labelIds.includes('TRASH')),
    [selectedThreadObjects, threadsMap]
  );

  // For read/unread, if any thread is unread then we mark them as read.
  const anyUnread = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.some((thread) => thread.labelIds.includes('UNREAD')),
    [selectedThreadObjects, threadsMap]
  );

  // Handlers that determine the command based on aggregated state.
  const handleClearSelection = () => {
    setSelectedThreads([]);
  };

  // Read and Star keep the selection — the button's icon flipping is the
  // feedback, and you may want to act on the same rows again.
  const handleStarToggle = () => {
    const command = allStarred ? 'THREAD_UNSTAR' : 'THREAD_STAR';
    executeCommand(command, { threadIds: selectedThreads });
  };

  const handleDoneToggle = () => {
    if (anyInInbox) {
      executeCommand('THREAD_DONE', { threadIds: inboxThreadIds });
    } else {
      executeCommand('THREAD_UNDONE', { threadIds: movableToInboxIds });
    }
    handleClearSelection();
  };

  const handleTrashToggle = () => {
    const command = allTrashed ? 'THREAD_UNTRASH' : 'THREAD_TRASH';
    executeCommand(command, { threadIds: selectedThreads });
    handleClearSelection();
  };

  const handleLabelToggle = () => {
    executeCommand('LABEL', { threadIds: selectedThreads });
  };

  const handleReadToggle = () => {
    // If any thread is unread then mark them as read; otherwise mark them as unread.
    const command = anyUnread ? 'THREAD_MARK_READ' : 'THREAD_MARK_UNREAD';
    executeCommand(command, { threadIds: selectedThreads });
  };

  // Action wording ("Mark as read"), not state wording ("Read").
  const starTooltip = allStarred ? t('command.thread_unstar') : t('command.thread_star');
  const doneTooltip = anyInInbox
    ? t('command.thread_done')
    : t('command.thread_move_to_inbox', { defaultValue: 'Move to Inbox' });

  const trashTooltip = allTrashed ? t('command.thread_untrash') : t('command.thread_trash');

  const readTooltip = anyUnread ? t('command.thread_mark_read') : t('command.thread_mark_unread');

  const labelTooltip = t('command.label');

  // Determine icon colors based on status
  const starIconColor = allStarred ? 'text-secondary-accent' : 'text-muted-foreground';
  const doneIconColor = 'text-muted-foreground';
  const labelIconColor = 'text-muted-foreground';
  const trashIconColor = allTrashed ? 'text-destructive' : 'text-muted-foreground';
  // For read/unread: if any are unread, highlight in accent (mark as read); otherwise, show an open envelope.
  const readIcon = anyUnread ? 'Envelope' : 'EnvelopeOpen';
  const readIconColor = anyUnread ? 'text-foreground' : 'text-muted-foreground';

  // Function to render toast content
  const renderToastContent = () => {
    return (
      <div className="flex flex-1 items-center gap-2">
        <span className="ml-2 text-sm font-medium">
          {t('thread_list.selected_count', { count: selectedThreads.length })}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="ml-auto flex items-center">
            {!allDrafts && (
              <>
                <Button
                  variant="ghost"
                  sizeVariant="sm"
                  shortcut={'U'}
                  tooltip={readTooltip}
                  aria-label={readTooltip}
                  localTooltip
                  onClick={handleReadToggle}
                >
                  <MonoIcon type={readIcon} className={readIconColor} />
                </Button>
                <Button
                  variant="ghost"
                  sizeVariant="sm"
                  shortcut={'S'}
                  tooltip={starTooltip}
                  aria-label={starTooltip}
                  localTooltip
                  onClick={handleStarToggle}
                >
                  <MonoIcon type="Star" className={starIconColor} />
                </Button>
                {showDoneButton && (
                  <Button
                    variant="ghost"
                    sizeVariant="sm"
                    shortcut={'E'}
                    tooltip={doneTooltip}
                    aria-label={doneTooltip}
                    localTooltip
                    onClick={handleDoneToggle}
                  >
                    <MonoIcon type={anyInInbox ? 'CheckCircle' : 'Inbox'} className={doneIconColor} />
                  </Button>
                )}

                {/* No L hint: the Label hotkey only works while reading. */}
                {hasUserLabels && (
                  <Button
                    variant="ghost"
                    sizeVariant="sm"
                    tooltip={labelTooltip}
                    aria-label={labelTooltip}
                    localTooltip
                    onClick={handleLabelToggle}
                  >
                    <MonoIcon type="Label" className={labelIconColor} />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  sizeVariant="sm"
                  shortcut={'Backspace'}
                  tooltip={trashTooltip}
                  aria-label={trashTooltip}
                  localTooltip
                  onClick={handleTrashToggle}
                >
                  <MonoIcon type="Trash" className={trashIconColor} />
                </Button>
              </>
            )}
          </div>

          {!allDrafts && <Separator className="h-4" orientation={'vertical'} />}
          <Button
            variant="ghost"
            className="text-muted-foreground"
            sizeVariant="xs"
            typeVariant="icon"
            tooltip={t('thread_list.toolbar.clear_selection')}
            localTooltip
            onClick={handleClearSelection}
          >
            <MonoIcon type="X" />
          </Button>
        </div>
      </div>
    );
  };

  // Track selection and show/dismiss toast as needed. Hidden while a thread is
  // open: the bar floated over the reader acting on rows you can't see.
  useEffect(() => {
    if (selectedThreads.length >= 2 && !activeThreadId) {
      // Show toast with actions when 2 or more threads are selected
      toast(
        <div className="w-80 flex-1 duration-200 animate-in fade-in slide-in-from-bottom-4">
          {renderToastContent()}
        </div>,
        {
          id: 'thread-selection-toast',
          duration: Infinity, // Keep it visible until dismissed
          position: 'bottom-center',
          // Swiping it away left the rows selected with no bar to act on them.
          dismissible: false
        }
      );
    } else {
      // Dismiss toast when fewer than 2 threads are selected
      toast.dismiss('thread-selection-toast');
    }
  }, [
    selectedThreads,
    activeThreadId,
    anyInInbox,
    showDoneButton,
    hasUserLabels,
    allStarred,
    allTrashed,
    anyUnread,
    threadsMap,
    allDrafts
  ]);

  // This component doesn't render anything directly - it just manages the toast
  return null;
};

export default ThreadSelectionToast;
