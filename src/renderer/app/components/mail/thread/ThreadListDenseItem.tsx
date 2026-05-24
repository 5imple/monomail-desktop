import { MonoMessage } from '@/main/models/message/MonoMessage';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import AttachmentItem from '@/renderer/app/components/mail/attachment/AttachmentItem';
import ThreadItemContextMenu from '@/renderer/app/components/mail/thread/ThreadItemContextMenu';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { formatListDate } from '@/renderer/app/lib/formatDate';
import { highlightThreadText } from '@/renderer/app/lib/highlightThreadText';
import { cn } from '@/renderer/app/lib/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useDraggable } from '@dnd-kit/core';
import { ScrollAreaScrollbar } from '@radix-ui/react-scroll-area';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

interface ThreadListDenseItemProps {
  threadId: string;
  onClick: (e: React.MouseEvent, id: string) => void;
  index?: number;
}

export const ThreadListDenseItem = React.memo(
  React.forwardRef<HTMLDivElement, ThreadListDenseItemProps>(
    ({ threadId, onClick, index = 0 }, forwardedRef) => {
      const [isRendering, setIsRendering] = useState(false);
      const [opacity, setOpacity] = useState(0);
      const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
      const { getAccountByUid, accounts, preference } = useAuth();
      const memoizedSearchQuery = useCallback(searchNewQuery, [searchNewQuery]);

      const { labelsMapByAccount } = useLabelAtom();
      const { activeThreadId, threadsMap, selectedThreads, setSelectedThreads } = useThreadAtom();
      const containerRef = useRef<HTMLDivElement | null>(null);
      const itemRef = useRef<HTMLDivElement | null>(null);
      const hasBeenVisibleRef = useRef(false);
      const executeCommand = useExecuteCommand();

      // Use direct access to thread instead of memoizing to ensure we always have latest data
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

      // Get labels for the current thread's account with proper dependencies
      const accountLabels = useMemo(() => {
        if (!currentThread) return {};
        return labelsMapByAccount[currentThread.accountId] || {};
      }, [currentThread, labelsMapByAccount, threadsMap]); // Added threadsMap dependency

      // Combine refs to handle both forwarded ref and internal ref
      const setRefs = useCallback(
        (node: HTMLDivElement | null) => {
          itemRef.current = node;

          // Handle forwarded ref
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        },
        [forwardedRef]
      );

      useEffect(() => {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                if (currentThread) {
                  setIsRendering(true);
                }
              } else {
                setIsRendering(false);
              }
            });
          },
          {
            root: document.getElementById('thread-list-scoll-root'),
            threshold: 0, // Trigger as soon as it intersects
            rootMargin: '210px 0px 210px 0px' // Trigger 50px before it enters the viewport
          }
        );

        if (containerRef.current) {
          observer.observe(containerRef.current);
        }

        // Register the actual interactive element for keyboard navigation
        if (containerRef.current) {
          registerItem('thread-list', threadId, containerRef.current);
        }

        return () => {
          observer.disconnect();
          unregisterItem('thread-list', threadId);
        };
      }, [currentThread]);

      useEffect(() => {
        if (isRendering) {
          requestAnimationFrame(() => setOpacity(100));
        } else {
          setOpacity(0);
        }
      }, [isRendering]);

      useEffect(() => {
        if (opacity === 100) hasBeenVisibleRef.current = true;
      }, [opacity]);

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

      // Function to get unique label IDs with specific dependency on labelIds
      const uniqueLabelIds = useMemo(() => {
        if (!currentThread) return [];
        return [
          ...new Set(currentThread.labelIds.filter((label) => label && label.includes('Label_')))
        ];
      }, [currentThread?.labelIds]); // Specific dependency on labelIds for reactivity

      const isUnread = currentThread?.labelIds.includes('UNREAD');
      const isChecked = selectedThreads.includes(threadId);
      const isActive = activeThreadId === threadId;

      // Same sender renderer used by the other two row variants.
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
          style={{
            transitionDelay:
              opacity === 0 && !hasBeenVisibleRef.current ? `${Math.min(index, 12) * 20}ms` : '0ms'
          }}
          data-thread-selected={isChecked}
          tabIndex={0}
          role="button"
          className={cn(
            'group relative mx-[10%] rounded-md transition-colors transition-opacity duration-150 duration-200 ease-out',
            isChecked
              ? '!bg-foreground/[0.07] ring-1 ring-inset ring-foreground/10 hover:!bg-foreground/[0.07] dark:!bg-foreground/[0.12] dark:ring-foreground/15 dark:hover:!bg-foreground/[0.12]'
              : isActive
                ? 'bg-foreground/[0.07] ring-1 ring-inset ring-foreground/10 hover:bg-foreground/[0.07] dark:bg-foreground/[0.12] dark:ring-foreground/15 dark:hover:bg-foreground/[0.12]'
                : 'bg-card hover:bg-foreground/[0.07] dark:hover:bg-foreground/[0.12]',
            currentThread && !isUnread && 'text-muted-foreground',
            opacity == 0 ? 'opacity-0' : 'opacity-100',
            'focus-visible:bg-foreground/[0.07] dark:focus-visible:bg-foreground/[0.12]',
            !currentThread && 'hidden'
          )}
        >
          {!currentThread || !isRendering ? (
            <div className="h-[36px] transition-[height] duration-200 ease-bouncy-in-out" />
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
                <div ref={setRefs} className={cn('text-left text-sm transition-colors')}>
                  {/* Newton dense row: single line, narrower sender column
                    (w-36) compared to compact (w-44), tighter vertical
                    padding (py-2). No avatar in this variant. */}
                  <div
                    className={cn('flex items-center gap-3 border-b border-border/40 px-3 py-1.5')}
                  >
                    {/* Unread dot + hover checkbox share the same slot: an unread
                        row shows the blue dot here at rest; on hover the checkbox
                        takes over (hover behavior unchanged). */}
                    <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                      {isUnread && !isChecked && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 transition-opacity duration-150 group-hover:opacity-0"
                        />
                      )}
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
                          'flex h-7 w-7 items-center justify-center rounded-full transition-opacity duration-150',
                          isChecked
                            ? 'opacity-100'
                            : cn(
                                'hover:!opacity-100 focus-visible:!opacity-100 group-hover:!opacity-100',
                                isUnread ? 'opacity-0' : 'opacity-20'
                              )
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
                    </div>

                    {/* Avatar */}
                    <RecipientAvatar
                      className="h-8 w-8 shrink-0"
                      recipient={senderAvatarRecipient}
                      accountId={currentThread.accountId}
                      preferredImageSrc={senderAccountImageSrc}
                    />

                    {/* Sender column */}
                    <div className="flex w-32 shrink-0 items-center gap-2 overflow-hidden">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <span
                          className={cn(
                            'block truncate text-[13px] tracking-tight',
                            isUnread
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-muted-foreground'
                          )}
                        >
                          {renderSenderNames()}
                        </span>
                      </div>
                      {currentThread.items.length > 1 && (
                        <span className="shrink-0 text-[11px] text-muted-foreground/70">
                          {currentThread.items.length}
                        </span>
                      )}
                    </div>

                    {/* Subject + snippet flow */}
                    <div className="flex min-w-0 flex-1 items-baseline gap-3 overflow-hidden">
                      <span
                        className={cn(
                          'max-w-[45%] shrink-0 truncate text-[13px] tracking-tight',
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
                            className="hidden min-w-0 flex-1 truncate text-[13px] tracking-tight text-muted-foreground sm:inline"
                            dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                          />
                        </>
                      )}
                    </div>

                    {/* Right metadata cluster — reserves min-w so the hover action bar fits without overlapping snippet text */}
                    <div className="relative flex min-w-[110px] shrink-0 items-center justify-end gap-2">
                      {uniqueLabelIds.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {uniqueLabelIds.map((labelId, index) => {
                            const label = accountLabels[labelId];
                            return label && label.name.length > 0 ? (
                              <Badge
                                key={`${labelId}-${index}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  memoizedSearchQuery(`label:${label.name}`, [currentThread.id]);
                                }}
                                className="rounded-sm"
                                style={{
                                  color: label.color.textColor,
                                  backgroundColor: label.color.backgroundColor
                                }}
                                sizeVariant={'xs'}
                              >
                                <div className="no-drag flex-1 overflow-hidden text-ellipsis">
                                  <span className="whitespace-nowrap">
                                    {label.name.replace('Mono/', '')}
                                  </span>
                                </div>
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}

                      {Object.keys(currentThread.attachments).length > 0 && (
                        <MonoIcon type={'Paperclip'} className="h-3 w-3 text-muted-foreground/60" />
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

                  {/* Attachment thumbnails — tucked under the subject column */}
                  {Object.keys(currentThread.attachments).length > 0 && (
                    <div className="pl-[calc(2rem+0.75rem+8rem+1.5rem)] pr-6 sm:pl-[calc(2rem+1rem+8rem+2rem)]">
                      <ScrollArea className="mr-3">
                        <div className="mb-2 flex items-center gap-1.5 p-1">
                          {Object.keys(currentThread.attachments)
                            .slice(0, 2)
                            .map((id) => (
                              <AttachmentItem
                                accountId={currentThread.accountId}
                                source={'message'}
                                size={'sm'}
                                itemId={currentThread.id}
                                key={currentThread.attachments[id].attachmentId}
                                preview
                                tabIndex={-1}
                                attachment={currentThread.attachments[id]}
                              />
                            ))}
                          {Object.keys(currentThread.attachments).length > 2 && (
                            <Button
                              variant={'secondary'}
                              sizeVariant={'sm'}
                              tabIndex={-1}
                              className="font-mono text-[11px] font-normal"
                            >
                              + {Object.keys(currentThread.attachments).length - 2}
                            </Button>
                          )}
                        </div>
                        <ScrollAreaScrollbar orientation={'horizontal'} />
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </div>
            </ThreadItemContextMenu>
          )}
        </div>
      );
    }
  )
);

ThreadListDenseItem.displayName = 'ThreadListDenseItem';
