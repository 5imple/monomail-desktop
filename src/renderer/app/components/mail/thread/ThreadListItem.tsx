import { MonoMessage } from '@/main/models/message/MonoMessage';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AttachmentItem from '@/renderer/app/components/mail/attachment/AttachmentItem';
import ThreadItemContextMenu from '@/renderer/app/components/mail/thread/ThreadItemContextMenu';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { Toolbar } from '@/renderer/app/components/ui/toolbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { formatListDate } from '@/renderer/app/lib/formatDate';
import { highlightThreadText } from '@/renderer/app/lib/highlightThreadText';
import { cn } from '@/renderer/app/lib/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useTrackingAtom } from '@/renderer/app/store/tracking/useTrackingAtom';
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

interface ThreadListItemProps {
  threadId: string;
  onClick: (e: React.MouseEvent, id: string) => void;
  variant?: 'cozy' | 'compact';
}

export const ThreadListItem = React.memo(
  React.forwardRef<HTMLDivElement, ThreadListItemProps>(
    ({ threadId, onClick, variant = 'compact' }, forwardedRef) => {
      const { selectedThreads, threadsMap } = useThreadAtom();
      const { labelsMapByAccount } = useLabelAtom();
      const executeCommand = useExecuteCommand();
      const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
      const { getAccountByUid, accounts, preference } = useAuth();
      const { getMessageTrackingHistory } = useTrackingAtom();

      // Remove isRendering state and use a simpler loading approach
      const [isLoaded, setIsLoaded] = useState(false);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const itemRef = useRef<HTMLDivElement | null>(null);

      // Memoized search query for compact variant
      const memoizedSearchQuery = useCallback(searchNewQuery, [searchNewQuery]);

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
      }, [currentThread, labelsMapByAccount, threadsMap]);

      // Check tracking state for messages in the thread
      const trackingHistoryData = useMemo(() => {
        if (!currentThread || !currentThread.accountId)
          return { hasTracking: false, hasReads: false, totalCount: 0 };

        let totalCount = 0;
        let hasTracking = false;
        let hasReads = false;

        currentThread.items.forEach((item) => {
          if (item.type === 'message') {
            const message = item as MonoMessage;
            const trackingHistory = getMessageTrackingHistory(currentThread.accountId, message.id);

            if (trackingHistory) {
              hasTracking = true;
              if (trackingHistory.length > 0) {
                hasReads = true;
                totalCount += trackingHistory.length;
              }
            }
          }
        });

        return { hasTracking, hasReads, totalCount };
      }, [currentThread, getMessageTrackingHistory]);

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

      // Simplified intersection observer setup
      useEffect(() => {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setIsLoaded(true);
              }
            });
          },
          {
            root: document.getElementById('thread-list-scoll-root'),
            threshold: 0,
            rootMargin: variant === 'compact' ? '210px 0px 210px 0px' : '402.5px 0px 402.5px 0px'
          }
        );

        if (containerRef.current) {
          observer.observe(containerRef.current);
          // Remove ref registration since we're using filteredThreadIds
        }

        return () => {
          observer.disconnect();
          // Remove unregistration since we're using filteredThreadIds
        };
      }, [threadId, variant]);

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
      }, [currentThread?.labelIds]);

      // Render sender names - shared logic
      const renderSenderNames = useCallback(() => {
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
            let displayName = '';
            const message = item as MonoMessage;

            if (accounts.some((account) => account.email === message.from.email)) {
              displayName = 'Me';
            } else {
              displayName = message.from.name || message.from.email;
            }

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
      }, [currentThread, accounts]);

      // Render labels - shared logic
      const renderLabels = useCallback(() => {
        if (uniqueLabelIds.length === 0) return null;

        return (
          <div className="flex items-center gap-2">
            {uniqueLabelIds.map((labelId, index) => {
              const label = accountLabels[labelId];
              return label && label.name.length > 0 ? (
                <Badge
                  key={`${labelId}-${index}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const searchFn = variant === 'compact' ? memoizedSearchQuery : searchNewQuery;
                    searchFn(`label:${label.name}`, [currentThread.id]);
                  }}
                  className="rounded-sm"
                  style={{
                    color: label.color.textColor,
                    backgroundColor: label.color.backgroundColor
                  }}
                  sizeVariant={'xs'}
                >
                  <div className="no-drag flex-1 overflow-hidden text-ellipsis">
                    <span className="whitespace-nowrap">{label.name.replace('Mono/', '')}</span>
                  </div>
                </Badge>
              ) : null;
            })}
          </div>
        );
      }, [
        uniqueLabelIds,
        accountLabels,
        variant,
        memoizedSearchQuery,
        searchNewQuery,
        currentThread
      ]);

      // Render attachments - shared logic
      const renderAttachments = useCallback(() => {
        if (Object.keys(currentThread.attachments).length === 0) return null;

        const attachmentKeys = Object.keys(currentThread.attachments);

        return (
          <div className={cn('flex items-center gap-1', variant === 'cozy' ? 'mt-2' : 'mb-2 p-1')}>
            {attachmentKeys.slice(0, 2).map((id) => (
              <AttachmentItem
                accountId={currentThread.accountId}
                source={variant === 'cozy' && id.length === 36 ? 'draft' : 'message'}
                itemId={currentThread.id}
                preview
                key={variant === 'compact' ? currentThread.attachments[id].attachmentId : id}
                tabIndex={-1}
                attachment={currentThread.attachments[id]}
                {...(variant === 'compact' && { size: 'sm' })}
              />
            ))}

            {attachmentKeys.length > 2 && (
              <Button
                tabIndex={-1}
                variant={'secondary'}
                sizeVariant={'sm'}
                className="text-ellipsis text-sm font-normal"
              >
                + {attachmentKeys.length - 2}
              </Button>
            )}
          </div>
        );
      }, [currentThread, variant]);

      const containerHeight = variant === 'compact' ? 'h-[42px]' : 'h-[80.5px]';
      // Newton-style row container:
      //   - `relative` so the 3px unread leading bar can be absolutely
      //     positioned inside the row (Newton's signature accent).
      //   - Uniform card background for both read and unread rows; the
      //     read/unread distinction is carried by the leading bar +
      //     font-weight, not by a tinted background. (Tinted-read-rows
      //     was monomail's previous pattern — Newton's calmer aesthetic
      //     keeps the background still and lets typography do the work.)
      //   - Selection uses a soft accent tint with a thicker leading bar.
      const isUnread = currentThread?.labelIds.includes('UNREAD');
      const containerClasses = cn(
        'relative transition-opacity duration-100',
        'bg-card hover:bg-muted/60 dark:bg-card dark:hover:bg-muted/40',
        currentThread && !isUnread && 'text-muted-foreground',
        selectedThreads.includes(threadId) &&
          'bg-accent/10 hover:bg-accent/15 dark:bg-accent/15 dark:hover:bg-accent/20',
        !isLoaded ? 'opacity-0' : 'opacity-100',
        'focus-visible:bg-accent/10',
        variant === 'compact' && !currentThread && 'hidden'
      );

      return (
        <div
          ref={containerRef}
          onClick={handleClick}
          aria-pressed={selectedThreads.includes(threadId)}
          data-thread={threadId}
          data-thread-focused={selectedThreads.includes(threadId)}
          tabIndex={0}
          role="button"
          className={containerClasses}
        >
          {!currentThread || !isLoaded ? (
            <div
              className={cn(
                'h-full transition-[max-height] duration-300 ease-bouncy-in-out',
                containerHeight
              )}
            />
          ) : (
            <ThreadItemContextMenu thread={currentThread}>
              <div
                ref={variant === 'compact' ? setRefs : forwardedRef}
                className={cn(
                  'text-left text-sm transition-colors',
                  variant === 'cozy' ? 'p-3' : '',
                  selectedThreads.includes(threadId) && 'pl-[7.5px]'
                )}
              >
                {variant === 'cozy' ? (
                  // Normal variant layout
                  <div className="flex h-full w-full gap-2">
                    <div className="mt-[8px] w-2 shrink-0">
                      {currentThread.labelIds.includes('UNREAD') && (
                        <span
                          className="flex h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: currentThread.labelIds.includes('UNREAD')
                              ? (preference.account.accentColor[currentThread.accountId] ??
                                '#035ddf')
                              : 'transparent'
                          }}
                        />
                      )}
                    </div>

                    <div className="mr-2 flex h-full w-full flex-col items-start gap-1">
                      <div className="flex w-full flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-1 items-center gap-2">
                            {currentThread.from.length > 0 &&
                              preference.display.threadList?.showAvatar && (
                                <RecipientAvatar
                                  recipient={currentThread.from[0]}
                                  className="h-7 w-7 border"
                                />
                              )}
                            <div className="w-fit overflow-hidden text-ellipsis">
                              <span
                                className={cn(
                                  'text-md whitespace-nowrap',
                                  !currentThread.labelIds.includes('UNREAD') ? '' : 'font-semibold'
                                )}
                              >
                                {renderSenderNames()}
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
                                  executeCommand('THREAD_UNSTAR', {
                                    threadIds: [currentThread.id]
                                  });
                                }}
                              >
                                <MonoIcon type={'Star'} className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {trackingHistoryData.hasTracking && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <MonoIcon
                                    type={
                                      trackingHistoryData.hasReads
                                        ? trackingHistoryData.totalCount > 1
                                          ? 'CheckCheck'
                                          : 'Check'
                                        : 'Check'
                                    }
                                    className={cn(
                                      trackingHistoryData.hasReads
                                        ? 'text-accent'
                                        : 'text-muted-foreground'
                                    )}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {trackingHistoryData.hasReads
                                    ? `Read ${trackingHistoryData.totalCount} times`
                                    : 'Not read'}
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {preference.display.threadList?.showLabels && renderLabels()}
                          </div>
                          <div
                            className={cn(
                              'ml-auto line-clamp-1 text-end text-xs',
                              selectedThreads.includes(currentThread.id)
                                ? 'text-muted-foreground'
                                : 'text-muted-foreground'
                            )}
                          >
                            {formatListDate(currentThread.timestamp)}
                          </div>
                        </div>
                        <div
                          className="line-clamp-1 text-sm font-normal"
                          dangerouslySetInnerHTML={{
                            __html:
                              !highlightedContent.subject || highlightedContent.subject === ''
                                ? '(No subject)'
                                : highlightedContent.subject
                          }}
                        />
                      </div>
                      {preference.display.threadList?.showSnippet && highlightedContent.snippet && (
                        <div
                          className="line-clamp-1 min-h-[1rem] text-sm text-muted-foreground"
                          dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                        />
                      )}

                      {preference.display.threadList?.showAttachments != false &&
                        renderAttachments()}
                    </div>
                  </div>
                ) : (
                  // Newton-style compact variant: single horizontal row.
                  //
                  // Anatomy (left → right):
                  //   [3px red unread bar] [sender column 176px] · [subject · snippet flexbox] · [right metadata cluster]
                  //
                  // The 3px leading bar replaces the previous tiny round
                  // unread dot — Newton's signature is the architectural
                  // vertical accent instead of a pulsing-ish dot. Star,
                  // tracking, labels, and message-count all sit on the
                  // right next to the timestamp. All the original
                  // callbacks (DraggableSender, executeCommand, search-
                  // by-label) and accessibility wiring are preserved.
                  <>
                    {isUnread && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 z-10 w-[3px] bg-accent"
                      />
                    )}
                    <div
                      className={cn(
                        'flex items-center gap-4 px-6 py-2.5 sm:gap-6 sm:px-8',
                        selectedThreads.includes(threadId) && 'pl-[calc(2rem-3px)]'
                      )}
                    >
                      {/* Sender column (fixed width, anchor) */}
                      <div className="flex min-h-6 w-44 shrink-0 items-center gap-2.5 overflow-hidden">
                        {currentThread.from.length > 0 &&
                          preference.display.threadList?.showAvatar && (
                            <RecipientAvatar
                              recipient={currentThread.from[0]}
                              className="h-6 w-6 shrink-0 border"
                            />
                          )}
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
                        {preference.display.threadList?.showSnippet &&
                          highlightedContent.snippet && (
                            <>
                              <span aria-hidden className="shrink-0 text-muted-foreground/40">
                                ·
                              </span>
                              <span
                                className="hidden min-w-0 flex-1 truncate text-[13px] tracking-tight text-muted-foreground sm:inline"
                                dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                              />
                            </>
                          )}
                      </div>

                      {/* Right metadata cluster: star · tracking · labels · time */}
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

                        {trackingHistoryData.hasTracking && (
                          <Tooltip>
                            <TooltipTrigger>
                              <MonoIcon
                                type={
                                  trackingHistoryData.hasReads
                                    ? trackingHistoryData.totalCount > 1
                                      ? 'CheckCheck'
                                      : 'Check'
                                    : 'Check'
                                }
                                className={cn(
                                  'h-3.5 w-3.5',
                                  trackingHistoryData.hasReads
                                    ? 'text-accent'
                                    : 'text-muted-foreground'
                                )}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {trackingHistoryData.hasReads
                                ? `Read ${trackingHistoryData.totalCount} times`
                                : 'Not read'}
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {Object.keys(currentThread.attachments).length > 0 && (
                          <MonoIcon type={'Paperclip'} className="h-3 w-3 text-muted-foreground" />
                        )}

                        {preference.display.threadList?.showLabels && renderLabels()}

                        <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatListDate(currentThread.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Attachment previews — kept below the row when the
                        thread has attachments + the preference enables it.
                        Aligned to the sender-column inset so they tuck
                        under the subject area visually. */}
                    {preference.display.threadList?.showAttachments != false &&
                      Object.keys(currentThread.attachments).length > 0 && (
                        <div className="pl-[calc(11rem+2rem)] pr-6 sm:pl-[calc(11rem+2.5rem)]">
                          <ScrollArea className="mr-3">
                            {renderAttachments()}
                            <ScrollAreaScrollbar orientation={'horizontal'} />
                          </ScrollArea>
                        </div>
                      )}
                  </>
                )}
              </div>
            </ThreadItemContextMenu>
          )}
        </div>
      );
    }
  )
);

ThreadListItem.displayName = 'ThreadListItem';
