import React, { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/renderer/app/components/ui/button';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/app/lib/utils';
import { Separator } from '@/renderer/app/components/ui/separator';
import { toast } from 'sonner';

const ThreadSelectionToast = () => {
  const { selectedThreads, setSelectedThreads, threadsMap } = useThreadAtom();
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

  // Aggregated status checks
  const allInInbox = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.every((thread) => thread.labelIds.includes('INBOX')),
    [selectedThreadObjects, threadsMap]
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

  const handleStarToggle = () => {
    const command = allStarred ? 'THREAD_UNSTAR' : 'THREAD_STAR';
    executeCommand(command, { threadIds: selectedThreads });
    handleClearSelection();
  };

  const handleDoneToggle = () => {
    const command = allInInbox ? 'THREAD_DONE' : 'THREAD_UNDONE';
    executeCommand(command, { threadIds: selectedThreads });
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
    handleClearSelection();
  };

  // Determine tooltip texts based on status
  const starTooltip = allStarred ? t('thread_list.toolbar.unstar') : t('thread_list.toolbar.star');
  const doneTooltip = allInInbox
    ? t('thread_list.toolbar.done')
    : t('thread_list.toolbar.undone', 'Undone'); // TODO

  const trashTooltip = allTrashed
    ? t('thread_list.toolbar.untrash')
    : t('thread_list.toolbar.trash');

  const readTooltip = anyUnread ? t('thread_list.toolbar.read') : t('thread_list.toolbar.unread');

  const labelTooltip = t('thread_list.toolbar.label');

  // Determine icon colors based on status
  const starIconColor = allStarred ? 'text-yellow-500' : 'text-muted-foreground';
  const doneIconColor = allInInbox ? 'text-muted-foreground' : 'text-green-500';
  const labelIconColor = 'text-muted-foreground';
  const trashIconColor = allTrashed ? 'text-destructive' : 'text-muted-foreground';
  // For read/unread: if any are unread, highlight in accent (mark as read); otherwise, show an open envelope.
  const readIcon = anyUnread ? 'Envelope' : 'EnvelopeOpen';
  const readIconColor = anyUnread ? 'text-accent' : 'text-muted-foreground';

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
                  localTooltip
                  onClick={handleStarToggle}
                >
                  <MonoIcon type="Star" className={starIconColor} />
                </Button>
                <Button
                  variant="ghost"
                  sizeVariant="sm"
                  shortcut={'E'}
                  tooltip={doneTooltip}
                  localTooltip
                  onClick={handleDoneToggle}
                >
                  <MonoIcon type="CheckCircle" className={doneIconColor} />
                </Button>

                <Button
                  variant="ghost"
                  sizeVariant="sm"
                  shortcut={'L'}
                  tooltip={labelTooltip}
                  localTooltip
                  onClick={handleLabelToggle}
                >
                  <MonoIcon type="Label" className={labelIconColor} />
                </Button>

                <Button
                  variant="ghost"
                  sizeVariant="sm"
                  shortcut={'#'}
                  tooltip={trashTooltip}
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

  // Track selection and show/dismiss toast as needed
  useEffect(() => {
    if (selectedThreads.length >= 2) {
      // Show toast with actions when 2 or more threads are selected
      toast(
        <div className="w-80 flex-1 duration-200 animate-in fade-in slide-in-from-bottom-4">
          {renderToastContent()}
        </div>,
        {
          id: 'thread-selection-toast',
          duration: Infinity, // Keep it visible until dismissed
          position: 'bottom-center'
        }
      );
    } else {
      // Dismiss toast when fewer than 2 threads are selected
      toast.dismiss('thread-selection-toast');
    }
  }, [selectedThreads, allInInbox, allStarred, allTrashed, anyUnread, threadsMap, allDrafts]);

  // This component doesn't render anything directly - it just manages the toast
  return null;
};

export default ThreadSelectionToast;
