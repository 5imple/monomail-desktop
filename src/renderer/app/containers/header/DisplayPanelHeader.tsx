import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { isComposeDraftId } from '@/main/utils';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useKeyboardRegistration } from '@/renderer/app/context/KeyboardNavigationContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { threadListActions } from '@/renderer/app/lib/threadListActions';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { readerReturnLayoutAtom, useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  threadListHasMoreAtom,
  threadsMapAtom
} from '@/renderer/app/store/thread/atoms';
import { useIsSearchView } from '@/renderer/app/hooks/useIsSearchView';
import {
  isDoneViewQuery,
  readerBackTarget,
  readerPosition
} from '@/renderer/app/lib/readerBackLabel';
import { useStepConversation } from '@/renderer/app/hooks/useStepConversation';
import { pendingAdvanceAtom } from '@/renderer/app/store/thread/readerAdvance';
import { forwardRef, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { atom, useAtomValue, useSetAtom } from 'jotai';

// Where the open email sits in the list the reader covers, as "index/total"
// (-1 when it isn't in the list). A string, so the header re-renders only
// when that changes, not on every update of the thread store.
const listPositionAtom = atom((get) => {
  const activeThreadId = get(activeThreadIdAtom);
  if (!activeThreadId) return '-1/0';
  const threadsMap = get(threadsMapAtom);
  const ids = get(filteredThreadIdsAtom).filter((id) => threadsMap[id]);
  return `${ids.indexOf(activeThreadId)}/${ids.length}`;
});

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
  /** Some message is collapsed or folded away. */
  canExpandAll?: boolean;
  /** Some message is expanded. */
  canCollapseAll?: boolean;
}

const DisplayPanelHeader = forwardRef<HTMLDivElement, DisplayPanelHeaderProps>(
  (
    {
      thread,
      handlePrint,
      isPrinting,
      handleCollapseAll,
      handleExpandAll,
      canExpandAll = true,
      canCollapseAll = true
    },
    ref
  ) => {
    const setActiveThreadId = useSetAtom(activeThreadIdAtom);
    const stepConversation = useStepConversation();
    const { t } = useTranslation();
    const { activeLayout, globalSearchQuery } = useGlobalAtom();
    // Opened from Later: Back returns there (useReaderReturn).
    const readerReturnLayout = useAtomValue(readerReturnLayoutAtom);
    const { accounts } = useAuth();
    const isSearch = useIsSearchView();
    const { openDialog } = useDialogs();
    const executeCommand = useExecuteCommand();
    const { trackEvent } = useUserTrackingData();
    const { labelsMapByAccount } = useLabelAtom();

    // Keyboard navigation
    const { registerItem, unregisterItem, registerAreaRef } = useKeyboardRegistration();

    // Refs for keyboard navigation
    const headerContainerRef = useRef<HTMLDivElement>(null);
    const closePanelRef = useRef<HTMLButtonElement>(null);
    const previousThreadRef = useRef<HTMLButtonElement>(null);
    const nextThreadRef = useRef<HTMLButtonElement>(null);
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
          { id: 'previous-thread', ref: previousThreadRef.current },
          { id: 'next-thread', ref: nextThreadRef.current },
          { id: 'done-toggle', ref: doneRef.current },
          { id: 'reminder', ref: reminderRef.current },
          { id: 'label', ref: labelRef.current },
          { id: 'star-toggle', ref: starRef.current },
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

    // Previous / Next walk the list the reader covers, in its order; the ends
    // are disabled so "Next" never wraps back to an earlier conversation.
    const [positionIndex, positionTotal] = useAtomValue(listPositionAtom).split('/').map(Number);
    const listHasMore = useAtomValue(threadListHasMoreAtom);
    const listPosition = {
      hasPrevious: positionIndex > 0,
      // At the end of what's loaded, Next loads the next page first.
      hasNext: positionIndex >= 0 && (positionIndex < positionTotal - 1 || listHasMore),
      label: readerPosition(positionIndex, positionTotal, listHasMore)
    };

    // "← Inbox": names the view Back returns to.
    const backTarget = readerBackTarget(
      readerReturnLayout ?? activeLayout,
      globalSearchQuery,
      isSearch
    );
    const backLabel = {
      inbox: t('nav.inbox', 'Inbox'),
      later: t('header.display.back_later', 'Later'),
      starred: t('nav.star', 'Starred'),
      sent: t('nav.sent', 'Sent'),
      drafts: t('nav.draft', 'Drafts'),
      done: t('nav.done', 'Done'),
      trash: t('nav.trash', 'Trash'),
      spam: t('nav.spam', 'Spam'),
      results: t('header.display.back_results', 'Results'),
      back: t('header.display.close_panel', 'Back')
    }[backTarget];

    // Next at the last loaded email: load the next page, then step once it
    // lands (the list itself can't scroll to load while the reader covers it).
    const pendingNextRef = useRef(false);
    const goNext = () => {
      if (stepConversation(1)) return;
      if (!listHasMore) return;
      pendingNextRef.current = true;
      threadListActions.loadMore();
    };
    useEffect(() => {
      if (!pendingNextRef.current) return;
      if (stepConversation(1) || !listHasMore) pendingNextRef.current = false;
    }, [positionTotal, listHasMore, stepConversation]);
    useEffect(() => {
      pendingNextRef.current = false;
    }, [thread?.id]);

    // Reply / Reply all / Forward from the More menu: the reply box under the
    // conversation steps aside while a draft is open there. Same targets as
    // the R / Enter / F keys: Reply answers the latest message from someone
    // else (your own if there is none), the other two take the newest.
    const latestMessage = (preferOthers: boolean): MonoMessage | null => {
      if (!thread) return null;
      const messages = thread.items.filter((item) => item.type === 'message') as MonoMessage[];
      const own = new Set(accounts.map((account) => account.email.trim().toLowerCase()));
      const fromOthers = messages.filter(
        (message) => !own.has(message.from?.email?.trim().toLowerCase())
      );
      const pool = preferOthers && fromOthers.length > 0 ? fromOthers : messages;
      return pool[pool.length - 1] ?? null;
    };
    const hasMessages = !!thread && thread.items.some((item) => item.type === 'message');
    const compose = (
      command: 'COMPOSE_REPLY_MESSAGE' | 'COMPOSE_REPLY_ALL_MESSAGE' | 'COMPOSE_FORWARD_MESSAGE'
    ) => {
      const message = latestMessage(command === 'COMPOSE_REPLY_MESSAGE');
      if (!thread || !message) return;
      executeCommand(command, { message, accountId: thread.accountId });
    };

    const handleDone = async () => {
      if (thread) {
        executeCommand('THREAD_DONE', { threadIds: [thread.id] });
        trackEvent('thread_doned', {
          thread_id: thread.id
        });
      }
    };
    // Trash / restore the open thread. THREAD_TRASH moves the reader on to the
    // next email when it acts on the open thread, like Done and the Backspace
    // hotkey.
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

    const inInbox = !!thread?.labelIds.includes('INBOX');
    // Outside the Inbox, E moves an email back in only in the Done view (and
    // for an email opened from Later); in Sent or Starred it's a quiet
    // "Move to Inbox" icon, not the primary button (useRegisterHotkeys).
    const eMovesBack =
      !inInbox && (isDoneViewQuery(globalSearchQuery) || readerReturnLayout === 'LATER');
    const doneIsPrimary = inInbox || eMovesBack;
    const starred = !!thread?.labelIds.includes('STARRED');
    const inTrash = !!thread?.labelIds.includes('TRASH');
    const isEmail = !!thread && !isComposeDraftId(thread.id);
    const waitingToLeave = useAtomValue(pendingAdvanceAtom)?.leavingId === thread?.id && !!thread;
    const iconButton = 'text-muted-foreground hover:bg-muted hover:text-foreground';

    return (
      <div className="drag relative">
        {/* One row, lined up with the email below it (the well's mx-3 and the
            content column's width and padding): where you are on the left,
            what to do with this email on the right. Reply / Reply all /
            Forward sit under the conversation (ThreadReplyBar). */}
        <div ref={ref} className="mx-3">
          <div
            ref={headerContainerRef}
            className="mx-auto flex h-10 max-w-[920px] items-center gap-3 px-6"
            data-focusable-area="display-header"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <Button
                ref={closePanelRef}
                className="no-drag -ml-2 h-8 min-w-0 gap-1 px-2 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                tooltip={
                  backTarget === 'back'
                    ? t('header.display.close_panel', 'Back')
                    : t('header.display.back_to', {
                        defaultValue: 'Back to {{view}}',
                        view: backLabel
                      })
                }
                variant="ghost"
                shortcut="ESC"
                sizeVariant="sm"
                onMouseDown={keepFocus}
                onClick={handleClosePanel}
                data-keyboard-item="close-panel"
              >
                <MonoIcon type="ArrowLeft" size={16} className="shrink-0" />
                <span className="truncate">{backLabel}</span>
              </Button>
              {isEmail && (
                <div className="no-drag ml-1 flex shrink-0 items-center">
                  <Button
                    ref={previousThreadRef}
                    className={cn(iconButton, 'h-7 w-7')}
                    tooltip={t('header.display.previous_conversation')}
                    shortcut="K"
                    variant="ghost"
                    sizeVariant="sm"
                    typeVariant="icon"
                    disabled={!listPosition.hasPrevious}
                    onMouseDown={keepFocus}
                    onClick={() => stepConversation(-1)}
                    data-keyboard-item="previous-thread"
                  >
                    <MonoIcon type="ChevronLeft" size={18} />
                  </Button>
                  {listPosition.label && (
                    <span
                      // Hidden in a narrow window, where the row has no room.
                      className="hidden min-w-[4.5rem] select-none text-center text-xs tabular-nums text-muted-foreground md:inline"
                      aria-label={t('header.display.position', {
                        defaultValue: 'Conversation {{position}}',
                        position: listPosition.label
                      })}
                    >
                      {listPosition.label}
                    </span>
                  )}
                  <Button
                    ref={nextThreadRef}
                    className={cn(iconButton, 'h-7 w-7')}
                    tooltip={t('header.display.next_conversation')}
                    shortcut="J"
                    variant="ghost"
                    sizeVariant="sm"
                    typeVariant="icon"
                    disabled={!listPosition.hasNext}
                    onMouseDown={keepFocus}
                    onClick={goNext}
                    data-keyboard-item="next-thread"
                  >
                    <MonoIcon type="ChevronRight" size={18} />
                  </Button>
                </div>
              )}
            </div>

            {thread && isEmail && (
              // While the reader waits for the next page after Done, the email
              // shown has already left: its actions are off (a second Done
              // made an Undo that undid nothing). A fieldset disables them all.
              <fieldset
                disabled={waitingToLeave}
                aria-busy={waitingToLeave}
                className={cn(
                  'no-drag m-0 flex min-w-0 shrink-0 items-center gap-1 border-0 p-0',
                  waitingToLeave && 'opacity-50'
                )}
              >
                {/* Done is what you do with most email: the one labelled
                    button. Once done, it moves the email back to the Inbox. */}
                <Button
                  ref={doneRef}
                  className={
                    doneIsPrimary
                      ? 'mr-1 h-8 gap-1.5 rounded-full px-3 text-[13px] font-medium'
                      : iconButton
                  }
                  tooltip={
                    inInbox
                      ? t('header.display.done_tooltip', {
                          defaultValue: 'Done: archive and go to the next email'
                        })
                      : t('header.display.move_to_inbox', { defaultValue: 'Move to Inbox' })
                  }
                  shortcut={doneIsPrimary ? 'E' : undefined}
                  sizeVariant="sm"
                  variant={doneIsPrimary ? 'outline' : 'ghost'}
                  typeVariant={doneIsPrimary ? undefined : 'icon'}
                  onMouseDown={keepFocus}
                  onClick={inInbox ? handleDone : handleUnDone}
                  data-keyboard-item="done-toggle"
                >
                  <MonoIcon type={inInbox ? 'Check' : 'Inbox'} size={16} />
                  <span className={doneIsPrimary ? 'hidden md:inline' : 'sr-only'}>
                    {inInbox
                      ? t('header.display.done', 'Done')
                      : t('header.display.move_to_inbox_short', { defaultValue: 'Inbox' })}
                  </span>
                </Button>
                <Button
                  ref={reminderRef}
                  className={iconButton}
                  tooltip={t('header.display.later', { defaultValue: 'Later' })}
                  shortcut="H"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onClick={() => {
                    openDialog('commandPalette', { pages: ['REMINDER'] });
                    trackEvent('reminder_opened', { thread_id: thread.id });
                  }}
                  onMouseDown={keepFocus}
                  data-keyboard-item="reminder"
                >
                  <MonoIcon type="Clock" />
                </Button>
                {accountHasLabels && (
                  <Button
                    ref={labelRef}
                    className={iconButton}
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
                    starred
                      ? 'text-secondary-accent'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  tooltip={starred ? t('header.display.unstar') : t('header.display.star')}
                  shortcut="S"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onMouseDown={keepFocus}
                  onClick={starred ? handleUnstarThread : handleStarThread}
                  data-keyboard-item="star-toggle"
                >
                  <MonoIcon type="Star" fill={starred} />
                </Button>
                <Button
                  ref={trashRef}
                  className={cn(
                    'hover:bg-muted hover:text-destructive',
                    inTrash ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  tooltip={inTrash ? t('header.display.untrash') : t('header.display.trash')}
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
                      className={iconButton}
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
                    {hasMessages && (
                      <>
                        <DropdownMenuItem onClick={() => compose('COMPOSE_REPLY_MESSAGE')}>
                          <MonoIcon type="Reply" className="mr-2 text-muted-foreground" />
                          {t('message_card.reply')}
                          <DropdownMenuShortcut>
                            <ShortcutKeyboard variant={'flat'} shortcut={'R'} />
                          </DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => compose('COMPOSE_REPLY_ALL_MESSAGE')}>
                          <MonoIcon type="reply_all" className="mr-2 text-muted-foreground" />
                          {t('message_card.reply_all', { defaultValue: 'Reply all' })}
                          <DropdownMenuShortcut>
                            <ShortcutKeyboard variant={'flat'} shortcut={'Enter'} />
                          </DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => compose('COMPOSE_FORWARD_MESSAGE')}>
                          <MonoIcon type="Forward" className="mr-2 text-muted-foreground" />
                          {t('message_card.forward')}
                          <DropdownMenuShortcut>
                            <ShortcutKeyboard variant={'flat'} shortcut={'F'} />
                          </DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleMarkUnread}>
                      <MonoIcon type="EnvelopeOpen" className="mr-2 text-muted-foreground" />
                      {t('header.display.mark_unread', { defaultValue: 'Mark as unread' })}
                      <DropdownMenuShortcut>
                        <ShortcutKeyboard variant={'flat'} shortcut={'U'} />
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    {/* Move and Report spam had keys (M, !) and palette entries
                        but no button; a mouse user had no way to them. */}
                    <DropdownMenuItem
                      onClick={() => {
                        openDialog('commandPalette', { pages: ['MOVE'] });
                        trackEvent('move_dialog_opened', { thread_id: thread.id });
                      }}
                    >
                      <MonoIcon type="ArrowRight" className="mr-2 text-muted-foreground" />
                      {t('command.move_ellipsis', { defaultValue: 'Move to…' })}
                      <DropdownMenuShortcut>
                        <ShortcutKeyboard variant={'flat'} shortcut={'M'} />
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    {!thread.labelIds.includes('SPAM') && (
                      <DropdownMenuItem
                        onClick={() => {
                          executeCommand('THREAD_REPORT_SPAM', { threadIds: [thread.id] });
                          trackEvent('thread_reported_spam', { thread_id: thread.id });
                        }}
                      >
                        <MonoIcon type="AlertCircle" className="mr-2 text-muted-foreground" />
                        {t('command.thread_report_spam')}
                        <DropdownMenuShortcut>
                          <ShortcutKeyboard variant={'flat'} shortcut={'!'} />
                        </DropdownMenuShortcut>
                      </DropdownMenuItem>
                    )}
                    {/* The whole conversation open, or down to one line per message. */}
                    <DropdownMenuItem disabled={!canExpandAll} onClick={handleExpandAll}>
                      <MonoIcon type="unfold_more" className="mr-2 text-muted-foreground" />
                      {t('header.display.expand_all', { defaultValue: 'Expand all' })}
                      <DropdownMenuShortcut>
                        <ShortcutKeyboard variant={'flat'} shortcut={';'} />
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canCollapseAll} onClick={handleCollapseAll}>
                      <MonoIcon type="unfold_less" className="mr-2 text-muted-foreground" />
                      {t('header.display.collapse_all', { defaultValue: 'Collapse all' })}
                      <DropdownMenuShortcut>
                        <ShortcutKeyboard variant={'flat'} shortcut={':'} />
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
              </fieldset>
            )}
          </div>
        </div>
      </div>
    );
  }
);

DisplayPanelHeader.displayName = 'DisplayPanelHeader';

export default DisplayPanelHeader;
