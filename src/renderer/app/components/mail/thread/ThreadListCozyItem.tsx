import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AttachmentItem from '@/renderer/app/components/mail/attachment/AttachmentItem';
import ThreadItemContextMenu from '@/renderer/app/components/mail/thread/ThreadItemContextMenu';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
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
            'border-l-[3px] border-l-primary bg-primary/10 hover:bg-primary/10 dark:bg-primary/15 dark:hover:bg-primary/15',
          opacity == 0 ? 'opacity-0' : 'opacity-100',

          // 'focus-visible:-outline-offset-3 outline-ring focus-visible:bg-primary/10 focus-visible:outline-1 focus-visible:outline-ring',
          'focus-visible:bg-primary/15'
          // 'focus-visible:outline-4 focus-visible:-outline-offset-2 focus-visible:outline-ring'
        )}
      >
        {!currentThread || !isRendering ? (
          <div
            className={cn(
              'h-full transition-[max-height] duration-300 ease-bouncy-in-out',
              'h-[80.5px]'
            )}
          ></div>
        ) : (
          <ThreadItemContextMenu thread={currentThread}>
            <div ref={ref} className={cn('p-3 text-left text-sm transition-colors')}>
              <div className="flex h-full w-full gap-2">
                <div className="mt-1.5 w-2 shrink-0">
                  {currentThread.labelIds.includes('UNREAD') && (
                    <span
                      className="flex h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: currentThread.labelIds.includes('UNREAD')
                          ? (preference.account.accentColor[currentThread.accountId] ?? '#035ddf')
                          : 'transparent'
                      }}
                    />
                  )}
                </div>

                {/* <RecipientAvatar className="w-7 h-7 shrink-0 mr-2" recipient={currentThread.from[0]} /> */}

                <div className="mr-2 flex h-full w-full flex-col items-start gap-1">
                  <div className="flex w-full flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 items-center gap-2">
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
                                  const message = item as MonoMessage;

                                  if (
                                    accounts.some((account) => account.email === message.from.email)
                                  ) {
                                    displayName = 'Me';
                                  } else {
                                    displayName = message.from.name || message.from.email;
                                  }

                                  if (!uniqueItems.has(displayName)) {
                                    uniqueItems.add(displayName);

                                    // Use DraggableSender for non-draft and non-Me senders
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

                        {currentThread.items.length > 1 && (
                          <div className="font-regular text-xs text-muted-foreground">
                            {currentThread.items.length}
                          </div>
                        )}
                        {currentThread.labelIds.includes('STARRED') && (
                          <Button
                            variant={'text'}
                            typeVariant={'inline'}
                            sizeVariant={'xs'}
                            className={
                              'text-yellow-500 hover:text-yellow-400 dark:hover:text-yellow-600'
                            }
                            tabIndex={-1}
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
                                    searchNewQuery(
                                      `label:${label.name}`,
                                      [currentThread.id],
                                      false
                                    );
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
                      </div>
                      <div
                        className={cn(
                          'ml-auto line-clamp-1 text-end text-xs',
                          // 'transition-colors duration-200',
                          selectedThreads.includes(currentThread.id)
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        {formatListDate(currentThread.timestamp)}
                      </div>
                    </div>
                    <div
                      className={cn('line-clamp-1 text-sm font-normal')}
                      dangerouslySetInnerHTML={{
                        __html:
                          !highlightedContent.subject || highlightedContent.subject === ''
                            ? '(No subject)'
                            : highlightedContent.subject
                      }}
                    ></div>
                  </div>
                  {highlightedContent.snippet && (
                    <div
                      className={cn('line-clamp-1 min-h-[1rem] text-sm text-muted-foreground')}
                      dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                    ></div>
                  )}

                  {Object.keys(currentThread.attachments).length > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      {Object.keys(currentThread.attachments)
                        .slice(0, 2)
                        .map((id) => (
                          <AttachmentItem
                            accountId={currentThread.accountId}
                            source={id.length === 36 ? 'draft' : 'message'}
                            itemId={currentThread.id}
                            preview
                            key={id}
                            tabIndex={-1}
                            attachment={currentThread.attachments[id]}
                          />
                        ))}

                      {Object.keys(currentThread.attachments).length > 2 && (
                        <Button
                          tabIndex={-1}
                          variant={'secondary'}
                          sizeVariant={'sm'}
                          className="text-ellipsis text-sm font-normal"
                        >
                          + {Object.keys(currentThread.attachments).length - 2}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ThreadItemContextMenu>
        )}
      </div>
    );
  })
);

ThreadListCozyItem.displayName = 'ThreadListCozyItem';
