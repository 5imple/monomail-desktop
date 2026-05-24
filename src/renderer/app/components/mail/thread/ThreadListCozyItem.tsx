import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import ThreadItemContextMenu from '@/renderer/app/components/mail/thread/ThreadItemContextMenu';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { ReschedulePopover } from '@/renderer/app/containers/queue/ReschedulePopover';
import { buildSchedulePresets } from '@/renderer/app/containers/queue/schedulePresets';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { formatListDate } from '@/renderer/app/lib/formatDate';
import { highlightThreadText } from '@/renderer/app/lib/highlightThreadText';
import { cn } from '@/renderer/app/lib/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useDraggable } from '@dnd-kit/core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

interface DraggableSenderProps {
  sender: string;
  threadId: string;
  index: number;
  email: string;
}

const DraggableSender = React.memo<DraggableSenderProps>(({ sender, threadId, index, email }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `thread-contact-${threadId}-${sender}-${index}`,
    attributes: {
      tabIndex: -1
    },
    data: {
      from: {
        name: sender,
        email: email
      }
    }
  });

  const style = {
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab'
  };

  return (
    <span ref={setNodeRef} {...attributes} {...listeners} style={style}>
      {sender}
    </span>
  );
});

DraggableSender.displayName = 'DraggableSender';

interface SnoozeButtonProps {
  thread: MonoThread;
  buttonClassName?: string;
}

const SnoozeButton = React.memo<SnoozeButtonProps>(({ thread, buttonClassName }) => {
  const [open, setOpen] = useState(false);
  const { snoozeThread } = useQueueAtom();
  const presets = useMemo(() => buildSchedulePresets(new Date()), [open]);

  const handlePickPreset = useCallback(
    async (preset: { id: string; scheduledFor: string | null }) => {
      if (!preset.scheduledFor) return;
      const sender = thread.from?.[0];
      const res = await snoozeThread({
        threadId: thread.id,
        accountId: thread.accountId,
        snoozeUntil: preset.scheduledFor,
        threadSnapshot: {
          subject: thread.subject || '(No subject)',
          snippet: thread.snippet || '',
          from: {
            id: sender?.email || thread.id,
            name: sender?.name || sender?.email || 'Unknown',
            email: sender?.email || ''
          },
          isStarred: thread.labelIds?.includes('STARRED') ?? false
        }
      });
      setOpen(false);
      if (!res.ok) {
        toast.error(`Couldn't snooze: ${res.error}`);
        return;
      }
      toast.success(`Snoozed until ${new Date(preset.scheduledFor).toLocaleString()}`);
    },
    [thread, snoozeThread]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="text"
          typeVariant="inline"
          sizeVariant="xs"
          tabIndex={-1}
          className={
            buttonClassName ??
            'shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100'
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          tooltip="Snooze"
          aria-label="Snooze"
        >
          <MonoIcon type="Clock" size={18} weight={300} grade={0} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-auto border-none bg-transparent p-0 shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <ReschedulePopover
          presets={presets}
          heading="Snooze until"
          onPickPreset={handlePickPreset}
          onPickCustom={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
});
SnoozeButton.displayName = 'SnoozeButton';

interface ThreadListCozyItemProps {
  threadId: string;
  onClick: (e: React.MouseEvent, id: string) => void;
  index?: number;
}

export const ThreadListCozyItem = React.memo(
  React.forwardRef<HTMLDivElement, ThreadListCozyItemProps>(
    ({ threadId, onClick, index = 0 }, ref) => {
      const { activeThreadId, selectedThreads, setSelectedThreads, threadsMap } = useThreadAtom();
      const { labelsMapByAccount } = useLabelAtom();
      const executeCommand = useExecuteCommand();
      const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
      const { getAccountByUid, accounts, preference } = useAuth();

      const [isRendering, setIsRendering] = useState(false);
      const [opacity, setOpacity] = useState(0);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const hasBeenVisibleRef = useRef(false);

      // No memo on currentThread to ensure it always has the latest data
      const currentThread = threadsMap[threadId];

      const senderAvatarRecipient = useMemo(() => {
        if (!currentThread) return { email: '', name: '' };

        const latestSender = [...currentThread.items]
          .reverse()
          .find(
            (item): item is MonoMessage => item.type === 'message' && !!(item as MonoMessage).from
          )?.from;

        return latestSender ?? currentThread.from?.[0] ?? { email: '', name: '' };
      }, [currentThread]);

      const senderAccountImageSrc = useMemo(() => {
        const senderEmail = senderAvatarRecipient.email.trim().toLowerCase();
        if (!senderEmail) return null;

        return (
          accounts.find((account) => account.email.trim().toLowerCase() === senderEmail)
            ?.profileImageUrl ?? null
        );
      }, [accounts, senderAvatarRecipient.email]);

      const currentAccount = useMemo(
        () => (currentThread ? getAccountByUid(currentThread.accountId) : null),
        [currentThread, getAccountByUid]
      );

      // Re-fetch labels for this account whenever threadsMap or labelsMapByAccount changes
      const accountLabels = useMemo(() => {
        if (!currentThread) return {};
        return labelsMapByAccount[currentThread.accountId] || {};
      }, [currentThread, labelsMapByAccount, threadsMap]); // Added threadsMap dependency

      const highlightedContent = useMemo(() => {
        if (!currentThread || !globalSearchQuery) {
          return {
            subject: null,
            snippet: null
          };
        }

        return {
          subject: highlightThreadText(
            !currentThread.subject || currentThread.subject === ''
              ? '(No subject)'
              : currentThread.subject,
            globalSearchQuery
          ),
          snippet: currentThread.snippet
            ? highlightThreadText(currentThread.snippet, globalSearchQuery)
            : null
        };
      }, [currentThread?.subject, currentThread?.snippet, globalSearchQuery]);

      const { registerItem, unregisterItem } = useKeyboardNavigationContext();

      useEffect(() => {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setIsRendering(true); // Delay to ensure render
              } else {
                setIsRendering(false);
              }
            });
          },
          {
            root: document.getElementById('thread-list-scoll-root'),
            threshold: 0, // Trigger as soon as it intersects
            rootMargin: '402.5px 0px 402.5px 0px' // Trigger 50px before it enters the viewport
          }
        );
        if (containerRef.current) {
          observer.observe(containerRef.current);
          registerItem('thread-list', threadId, containerRef.current);
        }
        return () => {
          observer.disconnect();
          unregisterItem('thread-list', threadId);
        };
      }, [threadId, threadsMap]);

      useEffect(() => {
        if (isRendering) {
          setTimeout(() => setOpacity(100), 0);
        } else {
          setOpacity(0);
        }
      }, [isRendering]);

      useEffect(() => {
        if (opacity === 100) hasBeenVisibleRef.current = true;
      }, [opacity]);

      const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: 'thread-contact-' + threadId,
        attributes: {
          tabIndex: -1
        },
        data: {
          thread: currentThread
        }
      });

      const style = {
        opacity: isDragging ? 0.5 : 1
      };

      const handleClick = useCallback(
        (e: React.MouseEvent | React.KeyboardEvent) => {
          if (
            e.nativeEvent instanceof KeyboardEvent &&
            (e.nativeEvent.key !== 'Enter' || e.nativeEvent.metaKey) &&
            e.nativeEvent.key !== ' '
          ) {
            return;
          }
          if (currentThread) onClick(e as React.MouseEvent, currentThread.id);
        },
        [onClick, currentThread]
      );

      // Recalculate uniqueLabelIds whenever the thread's labelIds change
      const uniqueLabelIds = useMemo(() => {
        if (!currentThread) return [];
        return [
          ...new Set(currentThread.labelIds.filter((label) => label && label.includes('Label_')))
        ];
      }, [currentThread?.labelIds]); // Specifically depend on labelIds

      // Debugging removed to clean up console

      const isUnread = currentThread?.labelIds.includes('UNREAD');
      const isChecked = selectedThreads.includes(threadId);
      const isActive = activeThreadId === threadId;

      // Newton senders renderer (inlined — identical to ThreadListItem's
      // version). DraggableSender handles dnd-kit drag handles for "Me"
      // exclusion and draft labelling.
      const renderSenderNames = () => {
        const uniqueItems = new Set();
        const displayItems: React.ReactNode[] = [];
        [...currentThread.items].reverse().forEach((item, index) => {
          if (item.type === 'draft') {
            const key = 'draft';
            if (!uniqueItems.has(key)) {
              uniqueItems.add(key);
              displayItems.push(
                <span key={`draft-${index}`} className="font-medium text-destructive">
                  Draft
                </span>
              );
            }
          } else if (item.type === 'message' && (item as MonoMessage).from) {
            const message = item as MonoMessage;
            const displayName = accounts.some((a) => a.email === message.from.email)
              ? 'Me'
              : message.from.name || message.from.email;
            if (!uniqueItems.has(displayName)) {
              uniqueItems.add(displayName);
              if (displayName !== 'Me') {
                displayItems.push(
                  <DraggableSender
                    key={`message-${index}`}
                    sender={displayName}
                    email={message.from.email}
                    threadId={currentThread.id}
                    index={index}
                  />
                );
              } else {
                displayItems.push(<span key={`message-${index}`}>{displayName}</span>);
              }
            }
          }
        });
        return displayItems.map((item, i) => (
          <React.Fragment key={`fragment-${i}`}>
            {item}
            {i < displayItems.length - 1 && ', '}
          </React.Fragment>
        ));
      };

      // Done/Trash deletes the thread from threadsMap while its id can still be
      // in the rendered id list for a frame. The JSX below dereferences
      // currentThread.items/.id/etc. unguarded, so without this early return a
      // single stale id throws mid-render and unmounts the whole list — every
      // email vanishes until a refetch. Render nothing for a missing thread.
      if (!currentThread) return null;

      return (
        <div
          ref={containerRef}
          onClick={handleClick}
          aria-current={isActive ? 'true' : undefined}
          aria-pressed={isChecked}
          data-thread={threadId}
          data-thread-focused={isActive}
          data-thread-selected={isChecked}
          tabIndex={0}
          role="button"
          style={{
            transitionDelay:
              opacity === 0 && !hasBeenVisibleRef.current ? `${Math.min(index, 12) * 20}ms` : '0ms'
          }}
          className={cn(
            // `group` enables hover-revealed children (e.g. SnoozeButton).
            'group relative mx-[10%] rounded-md transition-colors transition-opacity duration-150 duration-200 ease-out',
            isChecked
              ? '!bg-foreground/[0.07] ring-1 ring-inset ring-foreground/10 hover:!bg-foreground/[0.07] dark:!bg-foreground/[0.12] dark:ring-foreground/15 dark:hover:!bg-foreground/[0.12]'
              : isActive
                ? 'bg-foreground/[0.07] ring-1 ring-inset ring-foreground/10 hover:bg-foreground/[0.07] dark:bg-foreground/[0.12] dark:ring-foreground/15 dark:hover:bg-foreground/[0.12]'
                : 'bg-card hover:bg-foreground/[0.07] dark:hover:bg-foreground/[0.12]',
            currentThread && !isUnread && 'text-muted-foreground',
            opacity == 0 ? 'opacity-0' : 'opacity-100',
            'focus-visible:bg-foreground/[0.07] dark:focus-visible:bg-foreground/[0.12]'
          )}
        >
          {!currentThread || !isRendering ? (
            <div className="h-[40px] transition-[height] duration-200 ease-bouncy-in-out" />
          ) : (
            <ThreadItemContextMenu thread={currentThread}>
              <div className="relative">
                {isChecked && (
                  <span
                    aria-hidden
                    className="absolute inset-y-[3px] left-0 z-20 w-[3px] rounded-r-full bg-muted-foreground/70"
                  />
                )}
                {/* Unread is indicated by the bold font only — no left accent bar. */}
                {/* Single-line Newton row: avatar · sender (fixed) · subject – snippet · date */}
                <div
                  ref={ref}
                  className={cn(
                    'flex items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-sm transition-colors'
                  )}
                >
                  {/* Hover checkbox */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={isChecked ? 'Deselect email' : 'Select email'}
                    aria-pressed={isChecked}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (e.shiftKey) {
                        onClick(e, threadId);
                        return;
                      }
                      setSelectedThreads((prev) =>
                        prev.includes(threadId)
                          ? prev.filter((id) => id !== threadId)
                          : [...prev, threadId]
                      );
                    }}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity duration-150',
                      isChecked
                        ? 'opacity-100'
                        : 'opacity-20 hover:!opacity-100 focus-visible:!opacity-100 group-hover:!opacity-100'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,color,transform] duration-150',
                        isChecked
                          ? 'border-muted-foreground bg-muted-foreground text-background shadow-none'
                          : 'border-muted-foreground/20 text-muted-foreground/45 hover:scale-105 hover:border-muted-foreground/70 hover:bg-muted/70 hover:text-foreground group-hover:scale-105 group-hover:border-muted-foreground/70 group-hover:bg-muted/70 group-hover:text-foreground'
                      )}
                    >
                      <MonoIcon
                        type="Check"
                        className={cn(
                          'stroke-[1.5]',
                          isChecked ? 'h-3.5 w-3.5' : 'h-3 w-3',
                          isChecked ? 'opacity-100' : 'opacity-80 group-hover:text-foreground'
                        )}
                      />
                    </div>
                  </button>

                  {/* Avatar */}
                  <RecipientAvatar
                    className="h-8 w-8 shrink-0"
                    recipient={senderAvatarRecipient}
                    accountId={currentThread.accountId}
                    preferredImageSrc={senderAccountImageSrc}
                  />

                  {/* Sender — fixed column so subject always starts at the same x */}
                  <div className="flex w-40 shrink-0 items-center gap-1.5 overflow-hidden">
                    {isUnread && (
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                      />
                    )}
                    <span
                      className={cn(
                        'truncate text-[13px] tracking-tight',
                        isUnread
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-muted-foreground'
                      )}
                    >
                      {renderSenderNames()}
                    </span>
                    {currentThread.items.length > 1 && (
                      <span className="shrink-0 text-[11px] text-muted-foreground/70">
                        {currentThread.items.length}
                      </span>
                    )}
                  </div>

                  {/* Subject + snippet — fills remaining space */}
                  <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
                    <span
                      className={cn(
                        'shrink-0 truncate text-[13px] tracking-tight',
                        isUnread
                          ? 'font-medium text-foreground'
                          : 'font-normal text-foreground/80'
                      )}
                      dangerouslySetInnerHTML={{
                        __html:
                          !highlightedContent.subject || highlightedContent.subject === ''
                            ? '(No subject)'
                            : highlightedContent.subject
                      }}
                    />
                    {highlightedContent.snippet && (
                      <>
                        <span aria-hidden className="shrink-0 text-muted-foreground/40">
                          –
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-[13px] tracking-tight text-muted-foreground"
                          dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                        />
                      </>
                    )}
                  </div>

                  {/* Right cluster — reserves min-w so the hover action bar fits without overlapping snippet text */}
                  <div className="relative flex min-w-[140px] shrink-0 items-center justify-end gap-2">
                    {uniqueLabelIds.length > 0 && (
                      <div className="flex items-center gap-1">
                        {uniqueLabelIds.slice(0, 2).map((labelId, index) => {
                          const label = accountLabels[labelId];
                          return label && label.name.length > 0 ? (
                            <Badge
                              key={`${labelId}-${index}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                searchNewQuery(`label:${label.name}`, [currentThread.id], false);
                              }}
                              className="rounded-sm"
                              style={{
                                color: label.color.textColor,
                                backgroundColor: label.color.backgroundColor
                              }}
                              sizeVariant="xs"
                            >
                              <span className="whitespace-nowrap">
                                {label.name.replace('Mono/', '')}
                              </span>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}

                    {Object.keys(currentThread.attachments).length > 0 && (
                      <MonoIcon type="Paperclip" className="h-3 w-3 text-muted-foreground/60" />
                    )}

                    <span className="shrink-0 whitespace-nowrap text-right text-[11px] text-muted-foreground/70 transition-opacity duration-150 group-hover:opacity-0">
                      {formatListDate(currentThread.timestamp)}
                    </span>

                    {/* Hover action bar */}
                    <div className="absolute right-0 flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label="Done"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          executeCommand('THREAD_DONE', { threadIds: [currentThread.id] });
                        }}
                      >
                        <MonoIcon type="Check" size={18} weight={300} grade={0} />
                      </button>
                      <SnoozeButton
                        thread={currentThread}
                        buttonClassName="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label="Delete"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          executeCommand('THREAD_TRASH', { threadIds: [currentThread.id] });
                        }}
                      >
                        <MonoIcon type="Trash" size={18} weight={300} grade={0} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </ThreadItemContextMenu>
          )}
        </div>
      );
    }
  )
);

ThreadListCozyItem.displayName = 'ThreadListCozyItem';
