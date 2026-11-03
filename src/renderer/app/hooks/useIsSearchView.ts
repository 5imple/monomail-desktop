import { useCustomSidebarAtom } from '@/renderer/app/store/space/useCustomSidebarAtom';
import { currentSearchQueryAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

/** Queries of the built-in views (Inbox, Sent, Trash…), as opposed to searches. */
export const NAMED_VIEW_QUERIES = new Set([
  'category:primary',
  'in:inbox',
  'is:starred',
  'in:sent',
  'in:draft',
  'in:all -in:trash',
  'not in:inbox',
  'in:trash',
  'in:spam',
  'is:important',
  'is:snoozed',
  'category:social',
  'category:promotions',
  'category:updates',
  'category:forums'
]);

/** The inbox queries: an empty result there is "all caught up". */
export const INBOX_VIEW_QUERIES = new Set(['category:primary', 'in:inbox']);

export const normalizeQuery = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

/** Whether the list shows a search, not a named view (Inbox, Sent, a label…). */
export const useIsSearchView = () => {
  const globalSearchQuery = useAtomValue(currentSearchQueryAtom);
  const { getCurrentSidebarState } = useCustomSidebarAtom();

  const sidebarQueries = useMemo(() => {
    const state = getCurrentSidebarState();
    return new Set(
      Object.values(state?.items ?? {})
        .map((item) => (item.query ? normalizeQuery(item.query) : ''))
        .filter(Boolean)
    );
  }, [getCurrentSidebarState]);

  const normalized = normalizeQuery(globalSearchQuery);
  return (
    normalized.length > 0 && !NAMED_VIEW_QUERIES.has(normalized) && !sidebarQueries.has(normalized)
  );
};
