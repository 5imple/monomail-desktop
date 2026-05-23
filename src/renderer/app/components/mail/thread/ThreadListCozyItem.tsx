import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/icons';
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
}

const SnoozeButton = React.memo<SnoozeButtonProps>(({ thread }) => {
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
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          tooltip="Snooze"
        >
          <MonoIcon type="Clock" className="h-3.5 w-3.5" />
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
}

export const ThreadListCozyItem = React.memo(
  React.forwardRef<HTMLDivElement, ThreadListCozyItemProps>(({ threadId, onClick }, ref) => {
    const { selectedThreads, threadsMap } = useThreadAtom();
    const { labelsMapByAccount } = useLabelAtom();
    const executeCommand = useExecuteCommand();
    const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
    const { getAccountByUid, accounts, preference } = useAuth();

    const [isRendering, setIsRendering] = useState(false);
    const [opacity, setOpacity] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // No memo on currentThread to ensure it always has the latest data
    const currentThread = threadsMap[threadId];

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
          event instanceof KeyboardEvent &&
          (event.key !== 'Enter' || event.metaKey) &&
          event.key !== ' '
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
              <span key={`draft-${index}`} className="font-semibold text-destructive">
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

    return (
      <div
        ref={containerRef}
        onClick={handleClick}
        aria-pressed={selectedThreads.includes(threadId)}
        data-thread={threadId}
        data-thread-focused={selectedThreads.includes(threadId)}
        tabIndex={0}
        role="button"
        className={cn(
          // `group` enables hover-revealed children (e.g. SnoozeButton).
          'group relative transition-opacity duration-200',
          'bg-card hover:bg-muted/60 dark:bg-card dark:hover:bg-muted/40',
          currentThread && !isUnread && 'text-muted-foreground',
          selectedThreads.includes(threadId) &&
            'bg-accent/10 hover:bg-accent/15 dark:bg-accent/15 dark:hover:bg-accent/20',
          opacity == 0 ? 'opacity-0' : 'opacity-100',
          'focus-visible:bg-accent/15'
        )}
      >
        {!currentThread || !isRendering ? (
          <div className="h-[52px] transition-[height] duration-200 ease-bouncy-in-out" />
        ) : (
          <ThreadItemContextMenu thread={currentThread}>
            {isUnread && (
              <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-[3px] bg-accent" />
            )}
            {/* Single-line Newton row: avatar · sender (fixed) · subject – snippet · date */}
            <div
              ref={ref}
              className={cn(
                'flex items-center gap-4 border-b border-border/20 px-8 py-3 text-left text-sm transition-colors',
                selectedThreads.includes(threadId) && 'pl-[calc(2rem-3px)]'
              )}
            >
              {/* Avatar */}
              <RecipientAvatar
                className="h-8 w-8 shrink-0"
                recipient={currentThread.from?.[0] ?? { email: '', name: '' }}
              />

              {/* Sender — fixed column so subject always starts at the same x */}
              <div className="flex w-40 shrink-0 items-center gap-1.5 overflow-hidden">
                <span
                  className={cn(
                    'truncate text-[13.5px] tracking-tight',
                    isUnread
                      ? 'font-semibold text-foreground'
                      : 'font-medium text-muted-foreground'
                  )}
                >
                  {renderSenderNames()}
                </span>
                {currentThread.items.length > 1 && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {currentThread.items.length}
                  </span>
                )}
              </div>

              {/* Subject + snippet — fills remaining space */}
              <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
                <span
                  className={cn(
                    'shrink-0 truncate text-[13.5px] tracking-tight',
                    isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
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
                    <span aria-hidden className="shrink-0 text-muted-foreground/40">–</span>
                    <span
                      className="min-w-0 flex-1 truncate text-[13px] tracking-tight text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                    />
                  </>
                )}
              </div>

              {/* Right cluster: labels · star · snooze · date */}
              <div className="flex shrink-0 items-center gap-2">
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

                {currentThread.labelIds.includes('STARRED') && (
                  <Button
                    variant="text"
                    typeVariant="inline"
                    sizeVariant="xs"
                    tabIndex={-1}
                    className="text-yellow-500 hover:text-yellow-400 dark:hover:text-yellow-600"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      executeCommand('THREAD_UNSTAR', { threadIds: [currentThread.id] });
                    }}
                  >
                    <MonoIcon type="Star" className="h-3.5 w-3.5" />
                  </Button>
                )}

                {Object.keys(currentThread.attachments).length > 0 && (
                  <MonoIcon type="Paperclip" className="h-3 w-3 text-muted-foreground" />
                )}

                <SnoozeButton thread={currentThread} />

                <span className="w-14 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatListDate(currentThread.timestamp)}
                </span>
              </div>
            </div>
          </ThreadItemContextMenu>
        )}
      </div>
    );
  })
);

ThreadListCozyItem.displayName = 'ThreadListCozyItem';
