import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import MonoIcon from '@/renderer/app/components/icons/icons';
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
import { ThreadListItem } from '@/renderer/app/components/mail/thread/ThreadListItem';

interface ThreadListProps {
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

function ThreadList({ onScroll }: ThreadListProps) {
  const { t } = useTranslation();
  const { loadMore, hasMore, fetchThreadsHandler, loadingStatus, threadIds } = useThreadList();

  const { aggregatedSyncState } = useSyncThread();
  const { preference } = useAuth();

  const { setSelectedThreads, selectedThreads, threadsMap } = useThreadAtom();
  const { activateScope, deactivateScope } = useHotkeyScope();

  useEffect(() => {
    if (selectedThreads.length === 0) {
      deactivateScope('CONVERSATION_SELECTED');
    } else {
      activateScope('CONVERSATION_SELECTED');
    }
  }, [selectedThreads]);

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

        // Handle regular click: Toggle off if clicking the only selected thread
        if (prevSelected.length === 1 && prevSelected[0] === threadId) {
          setAnchorThreadId(null);
          return [];
        }

        // Regular click - Select only the clicked thread and set as anchor
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

  // Find the last thread ID that exists in threadsMap
  const lastValidThreadIndex = useMemo(() => {
    for (let i = deduplicatedThreadIds.length - 1; i >= 0; i--) {
      if (threadsMap[deduplicatedThreadIds[i]]) {
        return i;
      }
    }
    return -1;
  }, [deduplicatedThreadIds, threadsMap]);

  return (
    <>
      {/* <ThreadListToolbar className="absolute left-2 top-2 z-50" /> */}
      <ScrollArea onScroll={onScroll} className="flex-1" id="thread-list">
        <div className="flex h-full w-full flex-col">
          {deduplicatedThreadIds.map((threadId, index) => (
            <ThreadListItem
              key={threadId}
              threadId={threadId}
              onClick={handleItemClick}
              ref={index === lastValidThreadIndex ? lastThreadElementRef : null}
              variant={preference.appearance.density}
            />
          ))}
          {!hasMore && loadingStatus === 'DONE' && !aggregatedSyncState.isSyncing && (
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
    </>
  );
}

const MemoizedThreadItem = React.forwardRef<
  HTMLDivElement,
  { threadId: string; onClick: (e: React.MouseEvent, threadId: string) => void; density: string }
>(({ threadId, onClick, density }, ref) => {
  if (density === 'compact') {
    return <ThreadListDenseItem ref={ref} threadId={threadId} onClick={onClick} />;
  } else {
    return <ThreadListCozyItem ref={ref} threadId={threadId} onClick={onClick} />;
  }
});

MemoizedThreadItem.displayName = 'MemoizedThreadItem';

export default ThreadList;
