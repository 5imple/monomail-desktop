import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { ThreadListDenseItem } from '@/renderer/app/components/mail/thread/ThreadListDenseItem';
import { ThreadListCozyItem } from '@/renderer/app/components/mail/thread/ThreadListCozyItem';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import ThreadListSkeleton from '@/renderer/app/containers/list/ThreadListSkeleton';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { useSyncThread } from '@/renderer/app/context/SyncThreadContext';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadFilter } from '@/renderer/app/store/thread/useThreadFilter';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { fetchFullThread, threadNeedsFullBody } from '@/renderer/app/lib/threadBodyPrefetch';
import { isComposeDraftId } from '@/main/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAtomValue, useSetAtom } from 'jotai';
import { threadExitIntentAtom } from '@/renderer/app/store/thread/exitIntentAtom';
import {
  groupHeaderVariants,
  laneVariants,
  rowVariants,
  swipeVariants
} from '@/renderer/app/containers/list/threadRowMotion';
import { useTranslation } from 'react-i18next';
import { isEqual } from 'lodash';
import {
  beginRangeGesture,
  endRangeGesture,
  isRangeGestureActive,
  rangeGestureSelection,
  setSelectionAnchor
} from '@/renderer/app/store/thread/threadRangeSelection';

interface ThreadListProps {
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

// With a filter active and nothing matching yet, the list fetches this many
// more pages on its own before asking whether to keep looking.
const FILTERED_AUTO_LOAD_PAGES = 5;

function ThreadList({ onScroll }: ThreadListProps) {
  const { t } = useTranslation();
  const { loadMore, hasMore, fetchThreadsHandler, loadingStatus, threadIds } = useThreadList();

  const { aggregatedSyncState } = useSyncThread();
  const { preference } = useAuth();

  const {
    activeThreadId,
    setActiveThreadId,
    setSelectedThreads,
    selectedThreads,
    threadsMap,
    threadIds: loadedThreadIds
  } = useThreadAtom();
  const { activeFilters, setActiveFilters } = useThreadFilter();
  const { globalSearchQuery } = useGlobalAtom();
  const { activateScope, deactivateScope } = useHotkeyScope();

  useEffect(() => {
    if (selectedThreads.length === 0 && !activeThreadId) {
      deactivateScope('CONVERSATION_SELECTED');
    } else {
      activateScope('CONVERSATION_SELECTED');
    }
  }, [activeThreadId, selectedThreads]);

  // Pages fetched automatically while a filter matches nothing; reset when
  // the filter or the view changes.
  const filteredAutoLoadsRef = useRef(0);
  const [filteredAutoLoadsDone, setFilteredAutoLoadsDone] = React.useState(false);
  useEffect(() => {
    filteredAutoLoadsRef.current = 0;
    setFilteredAutoLoadsDone(false);
  }, [activeFilters, globalSearchQuery]);

  // ⌘-click toggles a row, Shift+click selects a range (see
  // threadRangeSelection), a plain click opens the conversation.
  const handleItemClick = useCallback(
    (e: React.MouseEvent, threadId: string) => {
      if (e.ctrlKey || e.metaKey) {
        setSelectionAnchor(threadId);
        setSelectedThreads((prev) =>
          prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId]
        );
        return;
      }

      if (e.shiftKey) {
        // With nothing selected, the range runs from the conversation that was
        // open last (if it's in the list) to the clicked row.
        beginRangeGesture(
          selectedThreads,
          threadIds,
          activeThreadId && threadIds.includes(activeThreadId) ? activeThreadId : threadId
        );
        const next = rangeGestureSelection(threadIds, threadId);
        if (next) setSelectedThreads(next);
        return;
      }

      setSelectionAnchor(threadId);
      setActiveThreadId(threadId);
    },
    [activeThreadId, selectedThreads, setActiveThreadId, setSelectedThreads, threadIds]
  );

  // Shift + moving the cursor across rows sweeps a range selection, with or
  // without a mouse button held. It begins only once the cursor crosses into
  // another row, so a Shift-wiggle on one row (e.g. reaching for a Shift
  // shortcut) never selects anything.
  const lastHoveredRowRef = useRef<string | null>(null);
  const sweepStartRowRef = useRef<string | null>(null);
  const handleSweepMove = useCallback(
    (e: React.MouseEvent) => {
      const row =
        (e.target as HTMLElement | null)?.closest?.('[data-thread]')?.getAttribute('data-thread') ??
        null;
      const previousRow = lastHoveredRowRef.current;
      lastHoveredRowRef.current = row;
      if (!row || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!isRangeGestureActive()) {
        sweepStartRowRef.current ??= previousRow ?? row;
        if (row === sweepStartRowRef.current) return;
        beginRangeGesture(selectedThreads, threadIds, sweepStartRowRef.current);
      }
      const next = rangeGestureSelection(threadIds, row);
      if (next && !isEqual(next, selectedThreads)) setSelectedThreads(next);
    },
    [selectedThreads, setSelectedThreads, threadIds]
  );

  // Releasing Shift (or leaving the window) ends the gesture.
  useEffect(() => {
    const end = () => {
      sweepStartRowRef.current = null;
      endRangeGesture();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') end();
    };
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', end);
    };
  }, []);

  // Shift+mousedown would otherwise extend the browser's text selection
  // across the rows — a blue wash that looks like (but isn't) a selection.
  const handleListMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey && (e.target as HTMLElement | null)?.closest?.('[data-thread]')) {
      e.preventDefault();
    }
  }, []);

  // Hover prefetch: the list holds metadata only, so a first open waited on a
  // full-body fetch before showing any text (~0.5–1.7 s on real threads). Start
  // that fetch once the pointer rests on a row; the reader then awaits the same
  // in-flight request (fetchFullThread de-dups) or finds the body cached.
  const { updateThread } = useThreadOperationAtom();
  const threadsMapRef = useRef(threadsMap);
  threadsMapRef.current = threadsMap;
  const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const prefetchedThreadIdsRef = useRef(new Set<string>());

  const handleRowHover = useCallback(
    (e: React.MouseEvent) => {
      const threadId = (e.target as HTMLElement)
        .closest?.('[data-thread]')
        ?.getAttribute('data-thread');
      clearTimeout(hoverPrefetchTimerRef.current);
      if (!threadId || prefetchedThreadIdsRef.current.has(threadId)) return;
      hoverPrefetchTimerRef.current = setTimeout(() => {
        const thread = threadsMapRef.current[threadId];
        if (!thread?.accountId || isComposeDraftId(thread.id) || !threadNeedsFullBody(thread))
          return;
        prefetchedThreadIdsRef.current.add(threadId);
        fetchFullThread(thread.accountId, thread.id, {
          cached: thread,
          onPartial: (partial) => updateThread(thread.accountId, partial)
        })
          .then((fullThread) => updateThread(thread.accountId, fullThread))
          .catch(() => prefetchedThreadIdsRef.current.delete(threadId));
      }, 120);
    },
    [updateThread]
  );

  useEffect(() => () => clearTimeout(hoverPrefetchTimerRef.current), []);

  // Archive / trash exit motion (see threadRowMotion). Intents are recorded by
  // the label operations; once rows finish leaving, drop the entries for rows
  // no longer listed so a later, unrelated removal just fades.
  // Rows swipe only in the inbox itself: an email archived / trashed while it's
  // open (the list hidden behind the reader, which has its own motion) just
  // closes its gap, settled before the reader closes on the inbox — even when
  // the reader closes while that row is still leaving.
  const exitIntents = useAtomValue(threadExitIntentAtom);
  const readerExitIdsRef = useRef(new Set<string>());
  const rowExitIntents = useMemo(() => {
    const readerExitIds = readerExitIdsRef.current;
    readerExitIds.forEach((id) => {
      if (!exitIntents[id]) readerExitIds.delete(id);
    });
    if (activeThreadId) Object.keys(exitIntents).forEach((id) => readerExitIds.add(id));
    if (readerExitIds.size === 0) return exitIntents;
    return Object.fromEntries(Object.entries(exitIntents).filter(([id]) => !readerExitIds.has(id)));
  }, [exitIntents, activeThreadId]);
  const setExitIntents = useSetAtom(threadExitIntentAtom);
  const reduceMotion = useReducedMotion();
  const listedThreadIdsRef = useRef<Set<string>>(new Set());
  const pruneExitIntents = useCallback(() => {
    setExitIntents((prev) => {
      const kept = Object.fromEntries(
        Object.entries(prev).filter(([id]) => listedThreadIdsRef.current.has(id))
      );
      return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
    });
  }, [setExitIntents]);

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
  listedThreadIdsRef.current = new Set(deduplicatedThreadIds);

  // First-load skeleton: only when there's nothing cached to show yet and a
  // fetch/sync is in flight. With cached threads we render content immediately.
  const isInitialLoading =
    deduplicatedThreadIds.length === 0 &&
    loadingStatus !== 'ERROR' &&
    (loadingStatus === 'LOADING' ||
      loadingStatus === 'INIT' ||
      aggregatedSyncState.isSyncing);

  const filtersActive = activeFilters.length > 0;
  const nothingShown = groupedThreads.length === 0;

  // Infinite scroll: a sentinel after the rows, watched against the list's own
  // scroll viewport with a bottom margin, so the next page starts loading
  // before the end is on screen. Rebuilt whenever loading settles, so a still-
  // visible sentinel (short or empty list) fires again.
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observer.current) observer.current.disconnect();
      if (!node) return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (!entries[0].isIntersecting || !hasMore || loadingStatus !== 'DONE') return;
          // With a filter matching nothing, only a few pages load on their own.
          if (filtersActive && nothingShown) {
            if (filteredAutoLoadsRef.current >= FILTERED_AUTO_LOAD_PAGES) {
              setFilteredAutoLoadsDone(true);
              return;
            }
            filteredAutoLoadsRef.current += 1;
          }
          loadMore();
        },
        {
          root: document.getElementById('thread-list-scroll-root'),
          rootMargin: '0px 0px 800px 0px'
        }
      );
      observer.current.observe(node);
    },
    [loadMore, hasMore, loadingStatus, filtersActive, nothingShown]
  );

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      onMouseOver={handleRowHover}
      onMouseMove={handleSweepMove}
      onMouseDown={handleListMouseDown}
    >
      {/* <ThreadListToolbar className="absolute left-2 top-2 z-50" /> */}
      <ScrollArea
        onScroll={onScroll}
        className="h-full"
        id="thread-list"
        // Root for the rows' IntersectionObserver pre-render margin. Without it
        // the observer fell back to the window and rows only rendered once
        // already on screen (blank rows popping in while scrolling).
        viewportId="thread-list-scroll-root"
      >
        <AnimatePresence mode="wait" initial={false}>
          {isInitialLoading ? (
            <motion.div
              key="thread-list-skeleton"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <ThreadListSkeleton density={preference.appearance.density} />
            </motion.div>
          ) : (
            <motion.div
              key="thread-list-content"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-full w-full flex-col pt-2"
            >
              {/* Headers and rows share one AnimatePresence so a row can swipe
                  away even when it was the last one in its date group. */}
              <AnimatePresence
                initial={false}
                custom={rowExitIntents}
                onExitComplete={pruneExitIntents}
              >
                {groupedThreads.flatMap((group) => [
                  <motion.div
                    key={`group-${group.label}`}
                    variants={groupHeaderVariants}
                    initial={false}
                    animate="present"
                    exit="exit"
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-[10%] pb-1 pt-3">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                  </motion.div>,
                  ...group.ids.map((threadId) => (
                    <motion.div
                      key={threadId}
                      // No `layout` here: when an email is open the list panel
                      // collapses to 0 width, and `layout` tweened each row's box
                      // from 0 -> full width on close — a left-to-right "sweep" of
                      // the inbox on every reader close. The exit motion
                      // (threadRowMotion) animates height instead.
                      variants={rowVariants(threadId, !!reduceMotion)}
                      initial={false}
                      animate="present"
                      exit="exit"
                      className="relative overflow-hidden"
                    >
                      {/* Lanes revealed behind the row as it swipes away. */}
                      <motion.div
                        variants={laneVariants(threadId, 'archive', !!reduceMotion)}
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-[10%] right-[10%] flex items-center gap-2 rounded-md bg-chart-1/15 pl-5 text-chart-1"
                      >
                        <MonoIcon type="CheckCircle" className="h-[18px] w-[18px]" />
                        <span className="text-[12px] font-medium">
                          {t('thread_list.toolbar.done')}
                        </span>
                      </motion.div>
                      <motion.div
                        variants={laneVariants(threadId, 'trash', !!reduceMotion)}
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-[10%] right-[10%] flex items-center justify-end gap-2 rounded-md bg-destructive/10 pr-5 text-destructive"
                      >
                        <span className="text-[12px] font-medium">
                          {t('thread_list.toolbar.trash')}
                        </span>
                        <MonoIcon type="Trash" className="h-[18px] w-[18px]" />
                      </motion.div>
                      {/* Opaque base: hover / keyboard / selection tints are
                          translucent, so the lane showed through the moving row. */}
                      <motion.div
                        variants={swipeVariants(threadId, !!reduceMotion)}
                        className="relative bg-background"
                      >
                        <MemoizedThreadItem
                          threadId={threadId}
                          onClick={handleItemClick}
                          density={preference.appearance.density}
                          index={threadIndexMap.get(threadId) ?? 0}
                        />
                      </motion.div>
                    </motion.div>
                  ))
                ])}
              </AnimatePresence>
          <div ref={sentinelRef} aria-hidden className="h-px w-full shrink-0" />

          {/* A filter (e.g. Unread) can match nothing on the loaded pages while
              more exist: look through a few more pages automatically, then
              ask instead of spinning forever or blaming "what's loaded". */}
          {nothingShown &&
            filtersActive &&
            hasMore &&
            loadingStatus !== 'ERROR' &&
            (filteredAutoLoadsDone &&
            loadingStatus === 'DONE' &&
            !aggregatedSyncState.isSyncing ? (
              <div className="flex flex-col items-center justify-center py-24 text-center duration-200 animate-in fade-in">
                <p className="text-sm font-medium text-muted-foreground">
                  {t('thread_list.empty_filtered_recent', {
                    defaultValue: 'No matching emails in your recent mail'
                  })}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button variant={'secondary'} onClick={() => setActiveFilters([])}>
                    {t('thread_list.show_all_mail', { defaultValue: 'Show all mail' })}
                  </Button>
                  <Button variant={'ghost'} onClick={() => loadMore()}>
                    {t('thread_list.keep_looking', { defaultValue: 'Keep looking' })}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center text-sm text-muted-foreground">
                <Loader className="mx-auto mb-4" />
                {t('thread_list.searching_filtered', {
                  defaultValue: 'Looking for matching emails…'
                })}
              </div>
            ))}
          {nothingShown &&
            !hasMore &&
            loadingStatus === 'DONE' &&
            !aggregatedSyncState.isSyncing && (
              <div className="flex flex-col items-center justify-center py-24 text-center duration-200 animate-in fade-in zoom-in-95">
                <MonoIcon type="CheckCircle" className="mb-3 h-8 w-8 text-muted-foreground/40" />
                {filtersActive ? (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('thread_list.empty_filtered', {
                        defaultValue: 'No emails match this filter'
                      })}
                    </p>
                    <Button
                      variant={'secondary'}
                      className="mt-4"
                      onClick={() => setActiveFilters([])}
                    >
                      {t('thread_list.clear_filter', { defaultValue: 'Clear filter' })}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('thread_list.all_caught_up', { defaultValue: 'All caught up' })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('thread_list.empty_view', { defaultValue: 'No emails in this view.' })}
                    </p>
                  </>
                )}
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

          {loadingStatus === 'ERROR' &&
            (loadedThreadIds.length > 0 ? (
              // Rows already on screen: a compact line under them.
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <MonoIcon type={'AlertCircle'} className="h-4 w-4 text-destructive" />
                {t('thread_list.load_more_error', { defaultValue: 'Couldn’t load more' })}
                <Button variant={'ghost'} sizeVariant={'sm'} onClick={() => fetchThreadsHandler(true)}>
                  {t('thread_list.try_again')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-center text-sm text-muted-foreground">
                <MonoIcon type={'AlertCircle'} className="mb-3 h-5 w-5 text-destructive" />
                <p className="font-medium text-foreground">
                  {t('thread_list.load_error_title', {
                    defaultValue: 'Couldn’t load your emails'
                  })}
                </p>
                <p className="mt-1">
                  {t('thread_list.load_error_body', {
                    defaultValue: 'Check your connection and try again.'
                  })}
                </p>
                {/* Nothing loaded yet: retry the first page, not a "load more". */}
                <Button
                  variant={'secondary'}
                  className="mt-4"
                  onClick={() => fetchThreadsHandler(false)}
                >
                  {t('thread_list.try_again')}
                </Button>
              </div>
            ))}
          {((hasMore && loadingStatus !== 'ERROR' && groupedThreads.length > 0) ||
            ((loadingStatus === 'LOADING' || aggregatedSyncState.isSyncing) &&
              !(nothingShown && filtersActive && hasMore))) && (
            <div className="my-4 py-8 text-center text-sm text-muted-foreground">
              <Loader className="mx-auto mb-7" />
              {/* Loading */}
            </div>
          )}
            </motion.div>
          )}
        </AnimatePresence>
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
