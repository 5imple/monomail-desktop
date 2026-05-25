import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { ThreadListDenseItem } from '@/renderer/app/components/mail/thread/ThreadListDenseItem';
import { ThreadListCozyItem } from '@/renderer/app/components/mail/thread/ThreadListCozyItem';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import FilterOptionDropdownMenu from '@/renderer/app/containers/filter/FilterOptionDropdownMenu';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { useSyncThread } from '@/renderer/app/context/SyncThreadContext';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface ThreadListProps {
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

function ThreadList({ onScroll }: ThreadListProps) {
  const { t } = useTranslation();
  const { loadMore, hasMore, fetchThreadsHandler, loadingStatus, threadIds } = useThreadList();

  const { aggregatedSyncState } = useSyncThread();
  const { preference } = useAuth();

  const { activeThreadId, setActiveThreadId, setSelectedThreads, selectedThreads, threadsMap } =
    useThreadAtom();
  const { activateScope, deactivateScope } = useHotkeyScope();

  useEffect(() => {
    if (selectedThreads.length === 0 && !activeThreadId) {
      deactivateScope('CONVERSATION_SELECTED');
    } else {
      activateScope('CONVERSATION_SELECTED');
    }
  }, [activeThreadId, selectedThreads]);

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
    return selectedThreads.length > 0 ? selectedThreads[0] : activeThreadId;
  });

  useEffect(() => {
    if (selectedThreads.length === 1) {
      setAnchorThreadId(selectedThreads[0]);
    } else if (selectedThreads.length === 0) {
      setAnchorThreadId(activeThreadId);
    }
  }, [activeThreadId, selectedThreads]);

  // Update anchor when selection changes through keyboard navigation
  const handleItemClick = useCallback(
    (e: React.MouseEvent, threadId: string) => {
      const isCtrlPressed = e.ctrlKey || e.metaKey;
      const isShiftPressed = e.shiftKey;

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
          // Only proceed with shift selection if we have a valid anchor
          if (anchorThreadId) {
            const anchorIndex = threadIds.indexOf(anchorThreadId);
            const targetIndex = threadIds.indexOf(threadId);

            if (anchorIndex !== -1 && targetIndex !== -1) {
              const [start, end] =
                anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];

              return threadIds.slice(start, end + 1);
            }

            // If anchor not found in current threadIds, anchor might have been affected by sorting
            // Fall back to single selection and set new anchor
            setAnchorThreadId(threadId);
            return [threadId];
          } else {
            // No anchor set yet - treat this as a regular click to establish anchor
            setAnchorThreadId(threadId);
            return [threadId];
          }
        }

        // Regular row click opens the conversation. Selection checkboxes own batch selection.
        setActiveThreadId(threadId);
        setAnchorThreadId(threadId);
        return prevSelected;
      });
    },
    [anchorThreadId, setActiveThreadId, setSelectedThreads, setAnchorThreadId, threadIds]
  );

  const deduplicatedThreadIds = useMemo(() => {
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

  // Group threads by time period for section headers
  const threadIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    deduplicatedThreadIds.forEach((id, i) => map.set(id, i));
    return map;
  }, [deduplicatedThreadIds]);

  const groupedThreads = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisWeekStart = todayStart - daysToMonday * 86400000;
    const lastWeekStart = thisWeekStart - 7 * 86400000;
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const buckets: { label: string; ids: string[] }[] = [
      { label: 'Today', ids: [] },
      { label: 'This Week', ids: [] },
      { label: 'Last Week', ids: [] },
      { label: 'This Month', ids: [] },
      { label: 'Older', ids: [] }
    ];

    deduplicatedThreadIds.forEach((id) => {
      const ts = threadsMap[id]?.timestamp ?? 0;
      if (ts >= todayStart) buckets[0].ids.push(id);
      else if (ts >= thisWeekStart) buckets[1].ids.push(id);
      else if (ts >= lastWeekStart) buckets[2].ids.push(id);
      else if (ts >= thisMonthStart) buckets[3].ids.push(id);
      else buckets[4].ids.push(id);
    });

    return buckets.filter((b) => b.ids.length > 0);
  }, [deduplicatedThreadIds, threadsMap]);

  // Last valid thread ID for the infinite-scroll observer
  const lastValidThreadId = useMemo(() => {
    for (let i = deduplicatedThreadIds.length - 1; i >= 0; i--) {
      if (threadsMap[deduplicatedThreadIds[i]]) return deduplicatedThreadIds[i];
    }
    return null;
  }, [deduplicatedThreadIds, threadsMap]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* <ThreadListToolbar className="absolute left-2 top-2 z-50" /> */}
      <ScrollArea onScroll={onScroll} className="h-full" id="thread-list">
        <div className="flex h-full w-full flex-col pt-2">
          {groupedThreads.map((group, groupIndex) => (
            <div key={group.label}>
              <div className="flex items-center justify-between px-[10%] pb-1 pt-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </span>
                {groupIndex === 0 && <FilterOptionDropdownMenu showLabel />}
              </div>
              <AnimatePresence initial={false} mode="popLayout">
                {group.ids.map((threadId) => (
                  <motion.div
                    key={threadId}
                    ref={threadId === lastValidThreadId ? lastThreadElementRef : null}
                    layout
                    initial={false}
                    animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{
                      opacity: 0,
                      x: 56,
                      scale: 0.985,
                      filter: 'blur(2px)',
                      transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                    }}
                    transition={{ layout: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }}
                  >
                    <MemoizedThreadItem
                      threadId={threadId}
                      onClick={handleItemClick}
                      density={preference.appearance.density}
                      index={threadIndexMap.get(threadId) ?? 0}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))}
          {groupedThreads.length === 0 &&
            loadingStatus === 'DONE' &&
            !aggregatedSyncState.isSyncing && (
              <div className="flex flex-col items-center justify-center py-24 text-center duration-200 animate-in fade-in zoom-in-95">
                <MonoIcon type="CheckCircle" className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">All caught up</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  No emails match the current view
                </p>
              </div>
            )}

          {!hasMore &&
            loadingStatus === 'DONE' &&
            !aggregatedSyncState.isSyncing &&
            groupedThreads.length > 0 && (
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
          {((hasMore && loadingStatus !== 'ERROR') ||
            loadingStatus === 'LOADING' ||
            aggregatedSyncState.isSyncing) && (
            <div className="my-4 py-8 text-center text-sm text-muted-foreground">
              <Loader className="mx-auto mb-7" />
              {/* Loading */}
            </div>
          )}
        </div>
      </ScrollArea>
      {(hasMore || loadingStatus === 'LOADING' || aggregatedSyncState.isSyncing) && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent dark:from-background" />
      )}
    </div>
  );
}

const MemoizedThreadItem = React.forwardRef<
  HTMLDivElement,
  {
    threadId: string;
    onClick: (e: React.MouseEvent, threadId: string) => void;
    density: string;
    index: number;
  }
>(({ threadId, onClick, density, index }, ref) => {
  if (density === 'compact') {
    return <ThreadListDenseItem ref={ref} threadId={threadId} onClick={onClick} index={index} />;
  } else {
    return <ThreadListCozyItem ref={ref} threadId={threadId} onClick={onClick} index={index} />;
  }
});

MemoizedThreadItem.displayName = 'MemoizedThreadItem';

export default ThreadList;
