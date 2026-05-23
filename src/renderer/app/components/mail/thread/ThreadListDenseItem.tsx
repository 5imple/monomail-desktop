import { MonoMessage } from '@/main/models/message/MonoMessage';
import MonoIcon from '@/renderer/app/components/icons/icons';
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
}

export const ThreadListDenseItem = React.memo(
  React.forwardRef<HTMLDivElement, ThreadListDenseItemProps>(
    ({ threadId, onClick }, forwardedRef) => {
      const [isRendering, setIsRendering] = useState(false);
      const [opacity, setOpacity] = useState(0);
      const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
      const { getAccountByUid, accounts, preference } = useAuth();
      const memoizedSearchQuery = useCallback(searchNewQuery, [searchNewQuery]);

      const { labelsMapByAccount } = useLabelAtom();
      const { threadsMap, selectedThreads } = useThreadAtom();
      const containerRef = useRef<HTMLDivElement | null>(null);
      const itemRef = useRef<HTMLDivElement | null>(null);
      const executeCommand = useExecuteCommand();

      // Use direct access to thread instead of memoizing to ensure we always have latest data
      const currentThread = threadsMap[threadId];

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

      // Function to get unique label IDs with specific dependency on labelIds
      const uniqueLabelIds = useMemo(() => {
        if (!currentThread) return [];
        return [
          ...new Set(currentThread.labelIds.filter((label) => label && label.includes('Label_')))
        ];
      }, [currentThread?.labelIds]); // Specific dependency on labelIds for reactivity

      const isUnread = currentThread?.labelIds.includes('UNREAD');

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
            'relative transition-opacity duration-200',
            'bg-card hover:bg-muted/60 dark:bg-card dark:hover:bg-muted/40',
            currentThread && !isUnread && 'text-muted-foreground',
            selectedThreads.includes(threadId) &&
              'bg-accent/10 hover:bg-accent/15 dark:bg-accent/15 dark:hover:bg-accent/20',
            opacity == 0 ? 'opacity-0' : 'opacity-100',
            'focus-visible:bg-accent/10',
            !currentThread && 'hidden'
          )}
        >
          {!currentThread || !isRendering ? (
            <div className="h-[42px] transition-[height] duration-200 ease-bouncy-in-out" />
          ) : (
            <ThreadItemContextMenu thread={currentThread}>
              {isUnread && (
                <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-[3px] bg-accent" />
              )}
              <div ref={setRefs} className={cn('text-left text-sm transition-colors')}>
                {/* Newton dense row: single line, narrower sender column
                    (w-36) compared to compact (w-44), tighter vertical
                    padding (py-2). No avatar in this variant. */}
                <div
                  className={cn(
                    'flex items-center gap-4 border-b border-border/20 px-8 py-2.5',
                    selectedThreads.includes(threadId) && 'pl-[calc(2rem-3px)]'
                  )}
                >
                  {/* Avatar */}
                  <RecipientAvatar
                    className="h-8 w-8 shrink-0"
                    recipient={currentThread.from?.[0] ?? { email: '', name: '' }}
                  />

                  {/* Sender column */}
                  <div className="flex min-h-6 w-32 shrink-0 items-center gap-2 overflow-hidden">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <span
                        className={cn(
                          'block truncate text-[14px] tracking-tight',
                          isUnread
                            ? 'font-semibold text-foreground'
                            : 'font-medium text-muted-foreground'
                        )}
                      >
                        {renderSenderNames()}
                      </span>
                    </div>
                    {currentThread.items.length > 1 && (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {currentThread.items.length}
                      </span>
                    )}
                  </div>

                  {/* Subject + snippet flow */}
                  <div className="flex min-w-0 flex-1 items-baseline gap-3 overflow-hidden">
                    <span
                      className={cn(
                        'max-w-[45%] shrink-0 truncate text-[14px] tracking-tight',
                        isUnread
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-foreground/80'
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
                          className="hidden min-w-0 flex-1 truncate text-[13px] tracking-tight text-muted-foreground sm:inline"
                          dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                        />
                      </>
                    )}
                  </div>

                  {/* Right metadata cluster */}
                  <div className="flex shrink-0 items-center gap-2.5">
                    {currentThread.labelIds.includes('STARRED') && (
                      <Button
                        variant={'text'}
                        typeVariant={'inline'}
                        sizeVariant={'xs'}
                        tabIndex={-1}
                        className={
                          'text-yellow-500 hover:text-yellow-400 dark:hover:text-yellow-600'
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          executeCommand('THREAD_UNSTAR', { threadIds: [currentThread.id] });
                        }}
                      >
                        <MonoIcon type={'Star'} className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {Object.keys(currentThread.attachments).length > 0 && (
                      <MonoIcon type={'Paperclip'} className="h-3 w-3 text-muted-foreground" />
                    )}

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

                    <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatListDate(currentThread.timestamp)}
                    </span>
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
            </ThreadItemContextMenu>
          )}
        </div>
      );
    }
  )
);

ThreadListDenseItem.displayName = 'ThreadListDenseItem';
