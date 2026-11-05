import { MonoThread } from '@/main/models/thread/MonoThread';
import { INBOX_VIEW_QUERIES, normalizeQuery } from '@/renderer/app/hooks/useIsSearchView';
import { BUILT_IN_TAB_IDS, orderTabIds } from '@/renderer/app/lib/filterTabOrder';
import {
  hiddenBySplitLabel,
  splitLabelsFor,
  threadMatchesFilters
} from '@/renderer/app/lib/threadFilters';
import { currentSearchQueryAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';
import { activeFiltersAtom, customLabelsAtom, filterTabOrderAtom, threadsMapAtom } from './atoms';

export function useThreadFilter() {
  const [activeFilters, setActiveFilters] = useAtom(activeFiltersAtom);
  const [threadsMap] = useAtom(threadsMapAtom);
  const { labelsMapByAccount } = useLabelAtom();

  // Helper function to get all label IDs across accounts that match a name
  const getLabelIdsByName = useCallback(
    (labelName: string): string[] => {
      const result: string[] = [];

      Object.entries(labelsMapByAccount).forEach(([accountId, labelsMap]) => {
        Object.entries(labelsMap).forEach(([labelId, label]) => {
          if (label.name.toLowerCase() === labelName.toLowerCase()) {
            result.push(labelId);
          }
        });
      });

      return result;
    },
    [labelsMapByAccount]
  );

  // Labels set to "only show here" (e.g. Others) take their mail out of every
  // other tab in the Inbox (All, Unread, the user's own labels…), like
  // Outlook's Other tab. Their own tab still shows it.
  const globalSearchQuery = useAtomValue(currentSearchQueryAtom);
  const customLabels = useAtomValue(customLabelsAtom);
  const savedTabOrder = useAtomValue(filterTabOrderAtom);
  const inInbox = INBOX_VIEW_QUERIES.has(normalizeQuery(globalSearchQuery ?? ''));
  // The tabs as shown: between two splits, the earlier one keeps the mail both match.
  const tabOrder = useMemo(
    () => orderTabIds(savedTabOrder, [...BUILT_IN_TAB_IDS, ...customLabels.map((l) => l.id)]),
    [savedTabOrder, customLabels]
  );
  const splitLabels = useMemo(
    () => splitLabelsFor(activeFilters, customLabels, inInbox, tabOrder),
    [activeFilters, customLabels, inInbox, tabOrder]
  );
  // Changes when the set of split labels does: the list is filtered again.
  const splitKey = useMemo(
    () => splitLabels.map((l) => `${l.id}:${JSON.stringify(l.rules)}`).join('|'),
    [splitLabels]
  );
  const isFiltering = activeFilters.length > 0 || splitLabels.length > 0;

  /** Whether a split label claims the thread (it then shows only under that label). */
  const isHiddenBySplit = useCallback(
    (thread: MonoThread): boolean =>
      splitLabels.length > 0 && hiddenBySplitLabel(thread, splitLabels, getLabelIdsByName),
    [splitLabels, getLabelIdsByName]
  );

  /** Whether a thread passes the active filters (rules: lib/threadFilters). */
  const applyFilters = useCallback(
    (thread: MonoThread): boolean =>
      threadMatchesFilters(thread, activeFilters, getLabelIdsByName) && !isHiddenBySplit(thread),
    [activeFilters, getLabelIdsByName, isHiddenBySplit]
  );

  /**
   * Filter thread IDs based on active filters
   */
  const filterThreadIds = useCallback(
    (threadIds: string[]): string[] => {
      if (!isFiltering) {
        return threadIds;
      }
      return threadIds.filter((id) => {
        const thread = threadsMap[id];
        if (!thread) return false;
        return applyFilters(thread);
      });
    },
    [isFiltering, threadsMap, applyFilters]
  );

  /**
   * Memoized value to track if any filters are active
   */
  const hasActiveFilters = useMemo(() => activeFilters.length > 0, [activeFilters]);

  return {
    applyFilters,
    isHiddenBySplit,
    isFiltering,
    splitKey,
    inInbox,
    tabOrder,
    filterThreadIds,
    hasActiveFilters,
    activeFilters,
    setActiveFilters,
    getLabelIdsByName
  };
}
