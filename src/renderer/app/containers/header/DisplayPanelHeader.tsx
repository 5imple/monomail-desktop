import { MonoThread } from '@/main/models/thread/MonoThread';
import { isComposeDraftId } from '@/main/utils';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { forwardRef, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { toast } from 'sonner';

// A mouse click shouldn't leave focus on a toolbar button: the header stays
// mounted while Trash / Done advance to the next email, so the next Enter
// (Reply All) was clicking that button again on the new one. Keyboard focus
// (Tab / arrow keys) is unaffected.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

interface DisplayPanelHeaderProps {
  thread: MonoThread | null;
  handlePrint: () => void;
  isPrinting: boolean;
  handleCollapseAll: () => void;
  handleExpandAll: () => void;
}

const DisplayPanelHeader = forwardRef<HTMLDivElement, DisplayPanelHeaderProps>(
  ({ thread, handlePrint, isPrinting }, ref) => {
    const { setActiveThreadId } = useThreadAtom();
    const { removeLabelFromThread, addLabelToThread } = useThreadLabelAtom();
    const { t } = useTranslation();
    const { setFullscreenDisplayPanel, fullscreenDisplayPanel } = useGlobalAtom();
    const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
    const { openDialog } = useDialogs();
    const executeCommand = useExecuteCommand();
    const { trackEvent } = useUserTrackingData();
    const { labelsMapByAccount } = useLabelAtom();

    // Keyboard navigation
    const { registerItem, unregisterItem, registerAreaRef } = useKeyboardNavigationContext();

    // Refs for keyboard navigation
    const headerContainerRef = useRef<HTMLDivElement>(null);
    const closePanelRef = useRef<HTMLButtonElement>(null);
    const reminderRef = useRef<HTMLButtonElement>(null);
    const labelRef = useRef<HTMLButtonElement>(null);
    const starRef = useRef<HTMLButtonElement>(null);
    const doneRef = useRef<HTMLButtonElement>(null);
    const trashRef = useRef<HTMLButtonElement>(null);
    const moreRef = useRef<HTMLButtonElement>(null);
    // Opened with the mouse, the More menu shouldn't hand focus back to its
    // button on close (the next Enter would reopen it instead of Reply All).
    // Opened from the keyboard, focus returns as usual.
    const moreOpenedByPointerRef = useRef(false);
    // Register keyboard navigation items
    useEffect(() => {
      // Register the container area
      if (headerContainerRef.current) {
        registerAreaRef('display-header', headerContainerRef.current);
      }

      // Build navigation items array based on available buttons, in visual order
      const navigationItems = [{ id: 'close-panel', ref: closePanelRef.current }];

      if (thread) {
        navigationItems.push(
          { id: 'reminder', ref: reminderRef.current },
          { id: 'label', ref: labelRef.current },
          { id: 'star-toggle', ref: starRef.current },
          { id: 'done-toggle', ref: doneRef.current },
          { id: 'trash-toggle', ref: trashRef.current },
          { id: 'more', ref: moreRef.current }
        );
      }

      // Register each navigation item
      navigationItems.forEach((item) => {
        if (item.ref) {
          registerItem('display-header', item.id, item.ref);
        }
      });

      // Cleanup function
      return () => {
        navigationItems.forEach((item) => {
          unregisterItem('display-header', item.id);
        });
      };
    }, [thread?.id, registerItem, unregisterItem, registerAreaRef]);

    const handleDone = async () => {
      if (thread) {
        executeCommand('THREAD_DONE', { threadIds: [thread.id] });
        trackEvent('thread_doned', {
          thread_id: thread.id
        });
      }
    };
    // Trash / restore the open thread. THREAD_TRASH advances the reader to the
    // next email (it acts on the active thread), like the Backspace hotkey.
    const handleTrashToggle = async () => {
      if (!thread) return;
      const inTrash = thread.labelIds.includes('TRASH');
      executeCommand(inTrash ? 'THREAD_UNTRASH' : 'THREAD_TRASH', { threadIds: [thread.id] });
      trackEvent(inTrash ? 'thread_untrashed' : 'thread_trashed', { thread_id: thread.id });
    };

    const handleUnDone = async () => {
      if (thread) {
        executeCommand('THREAD_UNDONE', { threadIds: [thread.id] });
        trackEvent('thread_undoned', {
          thread_id: thread.id
        });
      }
    };

    const handleStarThread = async () => {
      if (thread) {
        executeCommand('THREAD_STAR', { threadIds: [thread.id] });
        trackEvent('thread_starred', { thread_id: thread.id });
      }
    };

    const handleUnstarThread = async () => {
      if (thread) {
        executeCommand('THREAD_UNSTAR', { threadIds: [thread.id] });
        trackEvent('thread_unstarred', { thread_id: thread.id });
      }
    };

    const handleRemoveLabel = async (labelId: string) => {
      if (!thread) return;
      const accountId = thread.accountId;
      if (!accountId) return;
      const threadId = thread.id;
      try {
        await removeLabelFromThread(accountId, [threadId], labelId);
      } catch (error) {
        console.error('Failed to remove label:', error);
        toast.error(t('toast.error.label_remove'));
        return;
      }

      trackEvent('removed_label', { thread_id: threadId });
      const labelName = labelsMapByAccount[accountId]?.[labelId]?.name?.replace('Mono/', '');
      toast(
        t('header.display.label_removed', {
          defaultValue: 'Removed label {{name}}',
          name: labelName ?? ''
        }),
        {
          action: {
            label: t('toast.undo', { defaultValue: 'Undo' }),
            onClick: () => {
              addLabelToThread(accountId, [threadId], labelId).catch((error) => {
                console.error('Failed to re-add label:', error);
                toast.error(t('toast.error.label_remove'));
              });
            }
          }
        }
      );
    };

    // Opening a thread marks it read, so after "Mark as unread" close the
    // reader (like Gmail) instead of letting it be re-marked read at once.
    const handleMarkUnread = () => {
      if (!thread) return;
      executeCommand('THREAD_MARK_UNREAD', { threadIds: [thread.id] });
      setActiveThreadId(null);
      trackEvent('thread_marked_unread', { thread_id: thread.id });
    };

    const handleClosePanel = async () => {
      if (thread) {
        setActiveThreadId(null);
        trackEvent('panel_closed', { thread_id: thread.id });
      }
    };

    const togglePanelFullscreen = () => {
      setFullscreenDisplayPanel((prev) => {
        const newState = !prev;
        trackEvent('panel_fullscreen_toggled', { fullscreen: newState });
        return newState;
      });
    };

    // Get the appropriate labels based on thread's account ID
    const threadLabels = useMemo(() => {
      if (!thread) return {};
      const accountId = thread.accountId;
      if (!accountId) return {};

      return labelsMapByAccount[accountId] || {};
    }, [thread, labelsMapByAccount]);
    // The Label page has nothing to offer for an account without user labels
    // (Microsoft 365 labels aren't loaded).
    const accountHasLabels = useMemo(
      () => Object.keys(threadLabels).some((id) => id.startsWith('Label_')),
      [threadLabels]
    );

    // Get unique label IDs to avoid React key warnings
    // Keyed on the label list itself: label edits mutate thread.labelIds on the
    // same thread object, so memoizing on [thread] left removed/added badges stale.
    const labelIdsKey = thread?.labelIds.join(',') ?? '';
    const uniqueLabelIds = useMemo(() => {
      if (!labelIdsKey) return [];
      // Create a Set of labelIds that start with 'Label_' to ensure uniqueness
      return [...new Set(labelIdsKey.split(',').filter((label) => label.includes('Label_')))];
    }, [labelIdsKey]);

    return (
      <div className="drag relative">
        <div ref={ref} className="w-full">
          <div
            ref={headerContainerRef}
            className="relative flex h-11 items-center"
            data-focusable-area="display-header"
          >
            {/* Back button — absolute left */}
            <div
              className={cn(
                'absolute left-0 flex items-center pl-4',
                !sidebarLoading && 'transition-all duration-200',
                sidebarCollapsed && isElectron && fullscreenDisplayPanel ? 'translate-x-[88px]' : ''
              )}
            >
              <Button
                ref={closePanelRef}
                className="text-muted-foreground hover:text-foreground"
                tooltip={t('header.display.close_panel')}
                variant="ghost"
                shortcut="ESC"
                sizeVariant="sm"
                typeVariant="icon"
                onMouseDown={keepFocus}
                onClick={handleClosePanel}
                data-keyboard-item="close-panel"
              >
                <MonoIcon type="ChevronsLeft" />
              </Button>
            </div>

            {/* Action buttons — centered */}
            {thread && !isComposeDraftId(thread.id) && (
              <div className="flex w-full items-center justify-center gap-[22px]">
                <Button
                  ref={reminderRef}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground"
                  tooltip={t('header.display.reminder')}
                  shortcut="H"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onClick={() => {
                    openDialog('commandPalette', { pages: ['REMINDER'] });
                    trackEvent('reminder_opened', { thread_id: thread.id });
                  }}
                  disabled={!thread}
                  onMouseDown={keepFocus}
                  data-keyboard-item="reminder"
                >
                  <MonoIcon type="Clock" />
                </Button>
                {accountHasLabels && (
                  <Button
                    ref={labelRef}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground"
                    tooltip={t('header.display.label')}
                    shortcut="L"
                    sizeVariant="sm"
                    variant="ghost"
                    typeVariant="icon"
                    onMouseDown={keepFocus}
                    onClick={() => {
                      openDialog('commandPalette', { pages: ['LABEL'] });
                      trackEvent('label_dialog_opened', { thread_id: thread.id });
                    }}
                    disabled={!thread}
                    data-keyboard-item="label"
                  >
                    <MonoIcon type="Label" />
                  </Button>
                )}
                {/* S toggles; a filled star shows the current state. */}
                <Button
                  ref={starRef}
                  className={cn(
                    'hover:bg-muted',
                    thread.labelIds.includes('STARRED')
                      ? 'text-secondary-accent'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  tooltip={
                    thread.labelIds.includes('STARRED')
                      ? t('header.display.unstar')
                      : t('header.display.star')
                  }
                  shortcut="S"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onMouseDown={keepFocus}
                  onClick={
                    thread.labelIds.includes('STARRED') ? handleUnstarThread : handleStarThread
                  }
                  data-keyboard-item="star-toggle"
                >
                  <MonoIcon type="Star" fill={thread.labelIds.includes('STARRED')} />
                </Button>
                <Button
                  ref={doneRef}
                  className={cn(
                    'hover:bg-muted',
                    !thread?.labelIds.includes('INBOX')
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  // Once done, clicking moves it back to the inbox — say so.
                  tooltip={
                    thread?.labelIds.includes('INBOX')
                      ? t('header.display.done')
                      : t('header.display.move_to_inbox', { defaultValue: 'Move to Inbox' })
                  }
                  shortcut="E"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onMouseDown={keepFocus}
                  onClick={thread?.labelIds.includes('INBOX') ? handleDone : handleUnDone}
                  disabled={!thread}
                  data-keyboard-item="done-toggle"
                >
                  <MonoIcon type="CheckCircle" fill={!thread?.labelIds.includes('INBOX')} />
                </Button>
                <Button
                  ref={trashRef}
                  className={cn(
                    'hover:bg-muted hover:text-destructive',
                    thread.labelIds.includes('TRASH') ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  tooltip={
                    thread.labelIds.includes('TRASH')
                      ? t('header.display.untrash')
                      : t('header.display.trash')
                  }
                  shortcut="Backspace"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onMouseDown={keepFocus}
                  onClick={handleTrashToggle}
                  data-keyboard-item="trash-toggle"
                >
                  <MonoIcon type="Trash" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      ref={moreRef}
                      className="text-muted-foreground hover:bg-muted hover:text-foreground"
                      tooltip={t('header.display.more', { defaultValue: 'More' })}
                      sizeVariant="sm"
                      variant="ghost"
                      typeVariant="icon"
                      onMouseDown={keepFocus}
                      onPointerDown={() => {
                        moreOpenedByPointerRef.current = true;
                      }}
                      onKeyDown={() => {
                        moreOpenedByPointerRef.current = false;
                      }}
                      data-keyboard-item="more"
                    >
                      <MonoIcon type="MoreHorizontal" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="dark min-w-48"
                    onCloseAutoFocus={(e) => {
                      if (moreOpenedByPointerRef.current) e.preventDefault();
                      moreOpenedByPointerRef.current = false;
                    }}
                  >
                    <DropdownMenuItem onClick={handleMarkUnread}>
                      <MonoIcon type="EnvelopeOpen" className="mr-2 text-muted-foreground" />
                      {t('header.display.mark_unread', { defaultValue: 'Mark as unread' })}
                      <DropdownMenuShortcut>
                        <ShortcutKeyboard variant={'flat'} shortcut={'U'} />
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isPrinting}
                      onClick={() => {
                        handlePrint();
                        trackEvent('thread_printed', { thread_id: thread.id });
                      }}
                    >
                      <MonoIcon type="print" className="mr-2 text-muted-foreground" />
                      {t('header.display.print', { defaultValue: 'Print' })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Labels / badges — absolute right */}
            {thread && (
              // Bounded so long label names never run under the centred actions.
              <div className="absolute right-4 flex max-w-[28%] items-center gap-2 overflow-hidden">
                {thread.labelIds.some((label) => label.includes('Label_')) && (
                  <div className="flex min-w-0 items-center gap-1">
                    {uniqueLabelIds.map((labelId) => {
                      const label = threadLabels[labelId];
                      return label && label.name.length > 0 ? (
                        <Badge
                          key={labelId}
                          className={cn('no-drag max-w-[140px] rounded-sm')}
                          style={{
                            color: label.color.textColor || '',
                            backgroundColor: label.color.backgroundColor || ''
                          }}
                          onClick={() => {
                            openDialog('commandPalette', { pages: ['LABEL'] });
                            trackEvent('label_dialog_opened', { thread_id: thread.id });
                          }}
                          sizeVariant={'xs'}
                        >
                          <div className="no-drag flex-1 overflow-hidden text-ellipsis">
                            <span className="whitespace-nowrap">
                              {label.name.replace('Mono/', '')}
                            </span>
                          </div>
                          <Button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRemoveLabel(labelId);
                            }}
                            className="ml-2 shrink-0 text-primary-foreground hover:text-primary-foreground"
                            style={{ color: label.color.textColor || '' }}
                            aria-label={`Remove label ${label.name.replace('Mono/', '')}`}
                            variant={'text'}
                            typeVariant={'inline'}
                          >
                            <MonoIcon type={'X'} className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
                {thread.labelIds.includes('TRASH') && (
                  <Badge className={cn('no-drag shrink-0 rounded-sm')} sizeVariant={'xs'}>
                    <div className="no-drag flex-1 overflow-hidden text-ellipsis">
                      <span className="whitespace-nowrap">
                        {t('header.display.in_trash', { defaultValue: 'In Trash' })}
                      </span>
                    </div>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

DisplayPanelHeader.displayName = 'DisplayPanelHeader';

export default DisplayPanelHeader;
