import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { ThreadListDenseItem } from '@/renderer/app/components/mail/thread/ThreadListDenseItem';
import { ThreadListCozyItem } from '@/renderer/app/components/mail/thread/ThreadListCozyItem';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { useSyncThread } from '@/renderer/app/context/SyncThreadContext';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useTranslation } from 'react-i18next';
import DateSeparator from '@/renderer/app/components/mail/thread/DateSeparator';
import { ScrollAreaScrollbar } from '@radix-ui/react-scroll-area';

// Define types for thread processing
interface ThreadWithTimestamp {
  id: string;
  timestamp: number;
  dateGroup: string;
}

interface ThreadGroup {
  dateGroup: string;
  firstThreadTimestamp: number;
  threads: string[];
}

// Helper function to get date group label
const getDateGroup = (timestamp: number): string => {
  const date = new Date(timestamp);
  const today = new Date();

  // Set to beginning of day for comparison
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  // Yesterday date
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);

  // Start of current week (Sunday)
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - todayStart.getDay());

  // Start of last week
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);

  // Start of current month
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Start of last month
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  // Check date ranges
  if (date >= todayStart) {
    return 'Today';
  } else if (date >= yesterdayStart) {
    return 'Yesterday';
  } else if (date >= weekStart) {
    // If in current week, return day name
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else if (date >= lastWeekStart) {
    return 'Last Week';
  } else if (date >= monthStart) {
    return 'This Month';
  } else if (date >= lastMonthStart) {
    // For last month, return month name
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else {
    // For older, return Month Year
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
};

interface ThreadListWithDateProps {
  setKeyPressed: (keyPressed: boolean) => void;
  isScrolled: boolean;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

function ThreadListWithDate({ isScrolled, setKeyPressed, onScroll }: ThreadListWithDateProps) {
  const { t } = useTranslation();
  const { loadMore, hasMore, fetchThreadsHandler, loadingStatus, threadIds } = useThreadList();

  const { aggregatedSyncState } = useSyncThread();
  const { preference } = useAuth();

  const { setSelectedThreads, selectNextThread, selectPreviousThread, selectedThreads } =
    useThreadAtom();
  const { activateScope, deactivateScope, activeScopes } = useHotkeyScope();
  const { threadsMap } = useThreadAtom();

  useEffect(() => {
    if (selectedThreads.length === 0) {
      deactivateScope('CONVERSATION_SELECTED');
    } else {
      activateScope('CONVERSATION_SELECTED');
    }
  }, [selectedThreads]);

  const isNavigationEnabled = useCallback(() => {
    return (
      !activeScopes.includes('DIALOG') &&
      !activeScopes.includes('DROPDOWN_MENU') &&
      !activeScopes.includes('GLOBAL_COMPOSE')
    );
  }, [activeScopes]);

  useHotkeys(
    'down',
    (e) => {
      setKeyPressed(false);
    },
    {
      scopes: ['GLOBAL'],
      preventDefault: true,
      keyup: true,
      enabled: isNavigationEnabled()
    },
    [setKeyPressed]
  );

  useHotkeys(
    'down',
    (e) => {
      setKeyPressed(true);
      selectNextThread();
    },
    {
      scopes: ['GLOBAL'],
      preventDefault: true,
      keydown: true,
      enabled: isNavigationEnabled()
    },
    [setKeyPressed, selectNextThread]
  );

  useHotkeys(
    'up',
    (e) => {
      setKeyPressed(false);
    },
    {
      scopes: ['GLOBAL'],
      preventDefault: true,
      keyup: true,
      enabled: isNavigationEnabled()
    },
    [setKeyPressed]
  );

  useHotkeys(
    'up',
    (e) => {
      setKeyPressed(true);
      selectPreviousThread();
    },
    {
      scopes: ['GLOBAL'],
      preventDefault: true,
      keydown: true,
      enabled: isNavigationEnabled()
    },
    [setKeyPressed, selectPreviousThread]
  );

  const observer = useRef<IntersectionObserver | null>(null);
  const lastThreadElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && loadingStatus !== 'LOADING') {
          loadMore();
        }
      });
      if (node) observer.current.observe(node);
    },
    [loadMore, hasMore, loadingStatus]
  );

  // Initialize with the first selected thread if there is one
  const [anchorThreadId, setAnchorThreadId] = useState<string | null>(() => {
    return selectedThreads.length > 0 ? selectedThreads[0] : null;
  });

  // Update anchor when selection changes through keyboard navigation
  useEffect(() => {
    if (selectedThreads.length === 1) {
      setAnchorThreadId(selectedThreads[0]);
    } else if (selectedThreads.length === 0) {
      setAnchorThreadId(null);
    }
  }, [selectedThreads]);

  const handleItemClick = useCallback(
    (e: React.MouseEvent, threadId: string) => {
      const isCtrlPressed = e.ctrlKey || e.metaKey;
      const isShiftPressed = e.shiftKey;

      // If there's no anchor yet, set the clicked thread as anchor
      if (anchorThreadId === null && !isShiftPressed) {
        setAnchorThreadId(threadId);
      }

      setSelectedThreads((prevSelected) => {
        // Handle Ctrl+Click: Toggle selection of the clicked thread
        if (isCtrlPressed) {
          // If adding a new thread
          if (!prevSelected.includes(threadId)) {
            setAnchorThreadId(threadId);
            return [...prevSelected, threadId];
          }
          // If removing a thread
          else {
            const newSelection = prevSelected.filter((id) => id !== threadId);
            // If we're removing the anchor and there are other selected threads
            if (threadId === anchorThreadId && newSelection.length > 0) {
              setAnchorThreadId(newSelection[0]);
            }
            // If we're removing the last thread
            else if (newSelection.length === 0) {
              setAnchorThreadId(null);
            }
            return newSelection;
          }
        }

        // Handle Shift+Click: Select range between anchor and clicked thread
        if (isShiftPressed) {
          // If no anchor yet, use the first thread in the existing selection or the clicked thread
          const effectiveAnchor =
            anchorThreadId || (prevSelected.length > 0 ? prevSelected[0] : threadId);

          const anchorIndex = threadIds.indexOf(effectiveAnchor);
          const targetIndex = threadIds.indexOf(threadId);

          if (anchorIndex !== -1 && targetIndex !== -1) {
            const [start, end] =
              anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];

            // Keep the original anchor for future shift selections
            if (anchorThreadId === null) {
              setAnchorThreadId(effectiveAnchor);
            }

            return threadIds.slice(start, end + 1);
          }
        }

        if (prevSelected.length === 1 && prevSelected[0] === threadId) {
          setAnchorThreadId(null);
          return [];
        }

        setAnchorThreadId(threadId);
        return [threadId];
      });
    },
    [setSelectedThreads, setAnchorThreadId, anchorThreadId, threadIds]
  );

  const deduplicatedThreadIds = useMemo(() => {
    // Use a Set to remove duplicates while preserving order
    const uniqueIds = new Set<string>();
    const result: string[] = [];

    threadIds.forEach((id) => {
      if (!uniqueIds.has(id)) {
        uniqueIds.add(id);
        result.push(id);
      }
    });

    return result;
  }, [threadIds]);

  // Process threads and group them by date
  const processedThreads = useMemo<ThreadGroup[]>(() => {
    if (!threadsMap || deduplicatedThreadIds.length === 0) return [];

    // 1. Get all valid threads with timestamps
    const threadsWithTimestamps: ThreadWithTimestamp[] = deduplicatedThreadIds
      .map((id) => {
        const thread = threadsMap[id];
        if (!thread) return null;

        return {
          id,
          timestamp: thread.timestamp,
          dateGroup: getDateGroup(thread.timestamp)
        };
      })
      .filter((thread): thread is ThreadWithTimestamp => thread !== null);

    // 2. Sort by timestamp (newest first)
    threadsWithTimestamps.sort((a, b) => b.timestamp - a.timestamp);

    // 3. Group by date while maintaining order
    const groupedThreads: ThreadGroup[] = [];
    let currentGroup: string | null = null;
    let currentGroupThreads: ThreadWithTimestamp[] = [];

    threadsWithTimestamps.forEach((thread) => {
      if (currentGroup !== thread.dateGroup) {
        // Save previous group if exists
        if (currentGroup !== null) {
          groupedThreads.push({
            dateGroup: currentGroup,
            firstThreadTimestamp: currentGroupThreads[0].timestamp,
            threads: currentGroupThreads.map((t) => t.id)
          });
        }

        // Start new group
        currentGroup = thread.dateGroup;
        currentGroupThreads = [thread];
      } else {
        // Add to current group
        currentGroupThreads.push(thread);
      }
    });

    // Add the last group
    if (currentGroup !== null && currentGroupThreads.length > 0) {
      groupedThreads.push({
        dateGroup: currentGroup,
        firstThreadTimestamp: currentGroupThreads[0].timestamp,
        threads: currentGroupThreads.map((t) => t.id)
      });
    }

    return groupedThreads;
  }, [deduplicatedThreadIds, threadsMap]);

  return (
    <>
      <ScrollArea onScroll={onScroll} className="flex-1" id="thread-list">
        <div className="mx-auto flex h-full w-full max-w-[1080px] flex-col">
          {processedThreads.map((group, groupIndex) => (
            <React.Fragment key={group.dateGroup}>
              {/* Date separator with timestamp of first thread in group */}
              <DateSeparator
                isScrolled={isScrolled}
                date={group.dateGroup}
                firstThreadTimestamp={group.firstThreadTimestamp}
              />

              {/* Threads in this date group — staggered fade-in (~40ms
                  per row, capped at 400ms) so the inbox loads as a calm
                  waterfall instead of a flash of unstyled list. New rows
                  appearing later via pagination also animate, which makes
                  paginated loads feel intentional. */}
              {group.threads.map((threadId, index) => {
                const isLastThreadInList =
                  index === group.threads.length - 1 && groupIndex === processedThreads.length - 1;

                return (
                  <div
                    key={threadId}
                    ref={isLastThreadInList ? lastThreadElementRef : null}
                    className="duration-300 animate-in fade-in-0"
                    style={{
                      animationDelay: `${Math.min(index * 40, 400)}ms`,
                      animationFillMode: 'both'
                    }}
                  >
                    <MemoizedThreadItem
                      threadId={threadId}
                      onClick={handleItemClick}
                      density={preference.appearance.density}
                    />
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {!hasMore && loadingStatus === 'DONE' && (
            <div className="my-4 py-8 text-center text-sm text-muted-foreground">
              <MonoIcon type={'CheckCircle'} className="mx-auto mb-2" />
              {t('thread_list.up_to_date')}
            </div>
          )}

          {loadingStatus === 'ERROR' && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <MonoIcon type={'AlertCircle'} className="mx-auto mb-4 h-4 w-4 text-destructive" />
              <Button variant={'secondary'} onClick={() => fetchThreadsHandler(true)}>
                {t('thread_list.try_again')}
              </Button>
            </div>
          )}
          {((hasMore && loadingStatus !== 'ERROR') || loadingStatus === 'LOADING') && (
            <div className="my-4 py-8 text-center text-sm text-muted-foreground">
              <Loader className="mx-auto mb-7" />
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

const MemoizedThreadItem = React.memo(
  React.forwardRef<HTMLDivElement, { threadId: string; onClick: any; density: string }>(
    ({ threadId, onClick, density }, ref) => {
      if (density === 'compact') {
        return <ThreadListDenseItem ref={ref} threadId={threadId} onClick={onClick} />;
      } else {
        return <ThreadListCozyItem ref={ref} threadId={threadId} onClick={onClick} />;
      }
    }
  ),
  (prev, next) => prev.threadId === next.threadId && prev.density === next.density
);

MemoizedThreadItem.displayName = 'MemoizedThreadItem';

export default ThreadListWithDate;
