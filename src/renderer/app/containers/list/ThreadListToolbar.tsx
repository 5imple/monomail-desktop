import React, { FC, useMemo } from 'react';
import { Button } from '@/renderer/app/components/ui/button';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/app/lib/utils';
import { Separator } from '@/renderer/app/components/ui/separator';

interface ThreadListToolbarProps {
  className?: string;
  style?: React.CSSProperties;
}

const ThreadListToolbar: FC<ThreadListToolbarProps> = ({ className, style }) => {
  const { selectedThreads, setSelectedThreads, threadsMap } = useThreadAtom();
  const executeCommand = useExecuteCommand();
  const { t } = useTranslation();

  // Get selected thread objects from the store.
  const selectedThreadObjects = useMemo(
    () => selectedThreads.map((id) => threadsMap[id]).filter(Boolean),
    [selectedThreads, threadsMap]
  );

  // Aggregated status checks
  const allInInbox = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.every((thread) => thread.labelIds.includes('INBOX')),
    [selectedThreadObjects]
  );

  const allStarred = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.every((thread) => thread.labelIds.includes('STARRED')),
    [selectedThreadObjects]
  );

  const allTrashed = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.every((thread) => thread.labelIds.includes('TRASH')),
    [selectedThreadObjects]
  );

  // For read/unread, if any thread is unread then we mark them as read.
  const anyUnread = useMemo(
    () =>
      selectedThreadObjects.length > 0 &&
      selectedThreadObjects.some((thread) => thread.labelIds.includes('UNREAD')),
    [selectedThreadObjects]
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

  const handleReadToggle = () => {
    // If any thread is unread then mark them as read; otherwise mark them as unread.
    const command = anyUnread ? 'THREAD_MARK_READ' : 'THREAD_MARK_UNREAD';
    executeCommand(command, { threadIds: selectedThreads });
    handleClearSelection();
  };

  // Open a label selection dialog (adjust according to your implementation)
  const handleLabel = () => {
    // For example, open a dialog to add labels to the selected threads.
    // openDialog('labelDialog', { threadIds: selectedThreads });
  };

  // Determine tooltip texts based on status
  const starTooltip = allStarred ? t('thread_list.toolbar.unstar') : t('thread_list.toolbar.star');
  const doneTooltip = allInInbox ? t('thread_list.toolbar.done') : t('thread_list.toolbar.undone');
  const trashTooltip = allTrashed
    ? t('thread_list.toolbar.untrash')
    : t('thread_list.toolbar.trash');
  const readTooltip = anyUnread ? t('thread_list.toolbar.read') : t('thread_list.toolbar.unread');

  // Determine icon colors based on status
  const starIconColor = allStarred ? 'text-yellow-500' : 'text-muted-foreground';
  const doneIconColor = allInInbox ? 'text-muted-foreground' : 'text-green-500';
  const trashIconColor = allTrashed ? 'text-destructive' : 'text-muted-foreground';
  // For read/unread: if any are unread, highlight in accent (mark as read); otherwise, show an open envelope.
  const readIcon = anyUnread ? 'Envelope' : 'EnvelopeOpen';
  const readIconColor = anyUnread ? 'text-accent' : 'text-muted-foreground';

  // Render nothing if fewer than 2 threads are selected
  if (selectedThreads.length < 2) return null;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          sizeVariant="sm"
          shortcut={'U'}
          tooltip={readTooltip}
          onClick={handleReadToggle}
        >
          <MonoIcon type={readIcon} className={readIconColor} />
        </Button>
        <Button
          variant="ghost"
          sizeVariant="sm"
          shortcut={'S'}
          tooltip={starTooltip}
          onClick={handleStarToggle}
        >
          <MonoIcon type="Star" className={starIconColor} />
        </Button>
        <Button
          variant="ghost"
          sizeVariant="sm"
          shortcut={'E'}
          tooltip={doneTooltip}
          onClick={handleDoneToggle}
        >
          <MonoIcon type="CheckCircle" className={doneIconColor} />
        </Button>
        {/* <Button
          variant="ghost"
          sizeVariant="sm"
          tooltip={t('thread_list.toolbar.label')}
          onClick={handleLabel}
        >
          <MonoIcon type="Label" className="text-muted-foreground" />
        </Button> */}
        <Button
          variant="ghost"
          sizeVariant="sm"
          shortcut={'#'}
          tooltip={trashTooltip}
          onClick={handleTrashToggle}
        >
          <MonoIcon type="Trash" className={trashIconColor} />
        </Button>
      </div>

      <Separator orientation={'vertical'} className="h-6" />
      <div className="flex items-center">
        {/* <div className="mr-auto text-sm font-medium">
          {t('thread_list.selected_count', { count: selectedThreads.length })}
        </div> */}
        <Button
          variant="ghost"
          className="text-muted-foreground"
          sizeVariant="xs"
          typeVariant="icon"
          tooltip={t('thread_list.toolbar.clear_selection')}
          onClick={handleClearSelection}
        >
          <MonoIcon type="X" />
        </Button>
      </div>
    </div>
  );
};

export default ThreadListToolbar;
