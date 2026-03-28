import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import MonoIcon from '@/renderer/app/components/icons/icons';
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
            // 'transition-all duration-200',
            'transition-opacity duration-200',
            'bg-card hover:bg-muted-low dark:bg-muted dark:hover:bg-primary/20 hover:dark:bg-muted-low/50',
            currentThread && !currentThread.labelIds.includes('UNREAD') && 'text-muted-foreground',
            currentThread && !currentThread.labelIds.includes('UNREAD') && 'bg-muted dark:bg-card',
            selectedThreads.includes(threadId) &&
              'border-l-[3px] border-l-primary bg-primary/10 hover:bg-primary/10 dark:bg-primary/20 dark:hover:bg-primary/20',
            opacity == 0 ? 'opacity-0' : 'opacity-100',
            // 'outline-ring focus-visible:bg-primary/10 focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-ring'
            'focus-visible:bg-primary/15',

            !currentThread && 'hidden'
            // 'focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-ring'
          )}
        >
          {!currentThread || !isRendering ? (
            <div
              className={cn(
                'h-full transition-[height] duration-200 ease-bouncy-in-out',
                'h-[42px]'
              )}
            ></div>
          ) : (
            <ThreadItemContextMenu thread={currentThread}>
              {/* <ThreadSummaryHoverCard threadId={currentThread.id}> */}
              <div
                ref={setRefs} // Use our combined ref function
                className={cn('text-left text-sm transition-colors')}
              >
                <div className={cn('relative flex items-center gap-2 p-3')}>
                  <div className="flex-shrink-0">
                    <span
                      className={cn(
                        `mt-[1px] flex h-2 w-2 shrink-0 rounded-full`,
                        Object.keys(currentThread.attachments).length > 0 && ''
                      )}
                      style={{
                        backgroundColor: currentThread.labelIds.includes('UNREAD')
                          ? (preference.account.accentColor[currentThread.accountId] ?? '#035ddf')
                          : 'transparent'
                      }}
                    ></span>
                  </div>
                  <div className="flex min-h-6 w-32 items-center gap-2 overflow-hidden">
                    <div className="w-fit overflow-hidden text-ellipsis">
                      <span
                        className={cn(
                          'text-md whitespace-nowrap',
                          !currentThread.labelIds.includes('UNREAD') ? '' : 'font-semibold'
                        )}
                      >
                        {(() => {
                          // Use a Set to store unique names/labels
                          const uniqueItems = new Set();
                          const displayItems: React.ReactNode[] = [];

                          // Process items in reverse order
                          [...currentThread.items].reverse().forEach((item, index) => {
                            if (item.type === 'draft') {
                              const key = 'draft';
                              if (!uniqueItems.has(key)) {
                                uniqueItems.add(key);
                                displayItems.push(
                                  <span
                                    key={`draft-${index}`}
                                    className="font-semibold text-destructive"
                                  >
                                    {(item as MonoDraft).isAiGenerated && (
                                      <MonoIcon
                                        className="mb-1 mr-1 inline text-destructive"
                                        type={'Sparkles'}
                                      />
                                    )}
                                    Draft
                                  </span>
                                );
                              }
                            } else if (item.type === 'message' && (item as MonoMessage).from) {
                              let displayName = '';

                              if (
                                accounts.some(
                                  (account) => account.email === (item as MonoMessage).from.email
                                )
                              ) {
                                // if (currentAccount && item.from.email === currentAccount.email) {
                                displayName = 'Me';
                              } else {
                                displayName =
                                  (item as MonoMessage).from.name ||
                                  (item as MonoMessage).from.email;
                              }

                              if (!uniqueItems.has(displayName)) {
                                uniqueItems.add(displayName);

                                // Use DraggableSender for non-draft and non-Me senders
                                if (displayName !== 'Me') {
                                  displayItems.push(
                                    <DraggableSender
                                      key={`message-${index}`}
                                      sender={displayName}
                                      email={(item as MonoMessage).from.email}
                                      threadId={currentThread.id}
                                      index={index}
                                    />
                                  );
                                } else {
                                  displayItems.push(
                                    <span key={`message-${index}`}>{displayName}</span>
                                  );
                                }
                              }
                            }
                          });

                          // Join with commas
                          return displayItems.map((item, i) => (
                            <React.Fragment key={`fragment-${i}`}>
                              {item}
                              {i < displayItems.length - 1 && ', '}
                            </React.Fragment>
                          ));
                        })()}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
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

                    {uniqueLabelIds.length > 0 && (
                      <div className="flex items-center gap-2">
                        {uniqueLabelIds.map((labelId, index) => {
                          const label = accountLabels[labelId];
                          return label && label.name.length > 0 ? (
                            <Badge
                              key={`${labelId}-${index}`} // Ensure unique key
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                memoizedSearchQuery(`label:${label.name}`, [currentThread.id]);
                              }}
                              className={cn('rounded-sm')}
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

                    {currentThread.items.length > 1 && (
                      <span className="font-regular text-xs text-muted-foreground">
                        {currentThread.items.length}
                      </span>
                    )}
                    <div className="static flex overflow-hidden">
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center overflow-hidden">
                          <div className="inline-flex min-w-0 shrink">
                            <span
                              className="text-md line-clamp-1 font-normal"
                              dangerouslySetInnerHTML={{
                                __html:
                                  !highlightedContent.subject || highlightedContent.subject === ''
                                    ? '(No subject)'
                                    : highlightedContent.subject
                              }}
                            ></span>
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden text-ellipsis">
                            {highlightedContent.snippet && (
                              <span
                                className="ml-2 line-clamp-1 text-muted-foreground"
                                dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                              ></span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'flex-0 whitespace-nowrap text-end text-xs',
                      // 'transition-colors duration-200',
                      selectedThreads.includes(currentThread.id)
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {formatListDate(currentThread.timestamp)}
                  </div>
                </div>

                <div className="ml-40">
                  <ScrollArea className="mr-3">
                    {Object.keys(currentThread.attachments).length > 0 && (
                      <div className="mb-2 flex items-center gap-1 p-1">
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
                            className="text-ellipsis text-sm font-normal"
                          >
                            + {Object.keys(currentThread.attachments).length - 2}
                          </Button>
                        )}
                      </div>
                    )}
                    <ScrollAreaScrollbar orientation={'horizontal'} />
                  </ScrollArea>
                </div>
              </div>
              {/* </ThreadSummaryHoverCard> */}
            </ThreadItemContextMenu>
          )}
        </div>
      );
    }
  )
);

ThreadListDenseItem.displayName = 'ThreadListDenseItem';
