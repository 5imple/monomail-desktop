import { createIndexedDBStorage, nonSuspendingStorageAtom } from '@/renderer/app/lib/db/jotai-idb';
import { selectedContactAtoms } from '@/renderer/app/store/contact/atoms';
import { activeThreadIdAtom, selectedThreadsAtom } from '@/renderer/app/store/thread/atoms';
import { atom, useAtom, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const loadingAtom = atom<boolean>(false);
export const activateTourAtom = atom<boolean>(false);
export const gmailStatusInvalidAtom = atom<boolean>(false);
export const fullscreenDisplayPanelAtom = atom<boolean>(false);
export const contactDisplayPanelAtom = atomWithStorage<boolean>('global:display:contact', true);
export const calendarDisplayPanelAtom = nonSuspendingStorageAtom(
  atomWithStorage<boolean>(
    'global:display:calendar',
    true,
    createIndexedDBStorage<boolean>({
      defaultValue: true
    })
  ),
  true
);
export const currentSearchQueryAtom = atom<string>('category:primary');
export const searchHistoryAtom = nonSuspendingStorageAtom(
  atomWithStorage<string[]>(
    'global:search-history',
    [],
    createIndexedDBStorage<string[]>({
      defaultValue: []
    })
  ),
  []
);
export type GlobalLayout = 'MAIL' | 'CATCHUP' | 'LATER';

export const activeLayoutAtom = atom<GlobalLayout>('MAIL');

/**
 * The view an email was opened from when that view is not the mail list
 * (Later): closing the email (Esc, U, back) returns there (useReaderReturn).
 */
export const readerReturnLayoutAtom = atom<GlobalLayout | null>(null);

import { useCallback } from 'react';

/**
 * Run a new search (or open a view by its query) without subscribing to any
 * state: the returned function is stable and the caller does not re-render
 * when the query, selection or history change. For list rows and menus.
 */
export function useSearchNewQuery() {
  const setGlobalSearchQuery = useSetAtom(currentSearchQueryAtom);
  const setSelectedContacts = useSetAtom(selectedContactAtoms);
  const setActiveThreadId = useSetAtom(activeThreadIdAtom);
  const setSelectedThreads = useSetAtom(selectedThreadsAtom);
  const setActiveLayout = useSetAtom(activeLayoutAtom);
  const setSearchHistory = useSetAtom(searchHistoryAtom);
  const setReaderReturnLayout = useSetAtom(readerReturnLayoutAtom);

  return useCallback(
    (query: string, threadIds?: string[], addToHistory = true) => {
      // Going somewhere on purpose: closing the reader no longer returns to Later.
      setReaderReturnLayout(null);
      setGlobalSearchQuery(query);
      setSelectedThreads(threadIds ?? []);
      setActiveThreadId(threadIds?.length === 1 ? threadIds[0] : null);
      setSelectedContacts([]);
      setActiveLayout('MAIL');
      const trimmedQuery = query.trim();
      if (addToHistory && trimmedQuery) {
        setSearchHistory(async (prev) => {
          const filtered = (await prev).filter((item) => item !== trimmedQuery);
          return [trimmedQuery, ...filtered].slice(0, 5);
        });
      }
    },
    [
      setGlobalSearchQuery,
      setSelectedThreads,
      setActiveThreadId,
      setSelectedContacts,
      setActiveLayout,
      setSearchHistory,
      setReaderReturnLayout
    ]
  );
}

export function useGlobalAtom() {
  // No thread/contact subscriptions here: this hook is used widely, and going
  // through useThreadAtom / useContactAtom for two setters re-rendered every
  // caller on any thread or contact change.
  const [loading, setLoading] = useAtom(loadingAtom);
  const [gmailStatusInvalid, setGmailStatusInvalid] = useAtom(gmailStatusInvalidAtom);
  const [activateTour, setActivateTour] = useAtom(activateTourAtom);
  const [globalSearchQuery, setGlobalSearchQuery] = useAtom(currentSearchQueryAtom);
  const [contactDisplayPanel, setContactDisplayPanel] = useAtom(contactDisplayPanelAtom);
  const [calendarDisplayPanel, setCalendarDisplayPanel] = useAtom(calendarDisplayPanelAtom);
  const [activeLayout, setActiveLayout] = useAtom(activeLayoutAtom);
  const [fullscreenDisplayPanel, setFullscreenDisplayPanel] = useAtom(fullscreenDisplayPanelAtom);
  const [searchHistory, setSearchHistory] = useAtom(searchHistoryAtom);

  const addToSearchHistory = useCallback(
    (query: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      setSearchHistory(async (prev) => {
        // Remove existing instance of this query if it exists
        const filtered = (await prev).filter((item) => item !== trimmedQuery);
        // Add to beginning and limit to 5 items
        return [trimmedQuery, ...filtered].slice(0, 5);
      });
    },
    [setSearchHistory]
  );

  const removeFromSearchHistory = useCallback(
    (query: string) => {
      setSearchHistory(async (prev) => {
        const filtered = (await prev).filter((item) => item !== query);
        return filtered;
      });
    },
    [setSearchHistory]
  );

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
  }, [setSearchHistory]);

  const searchNewQuery = useSearchNewQuery();

  return {
    gmailStatusInvalid,
    setGmailStatusInvalid,
    activateTour,
    setActivateTour,
    loading,
    setLoading,
    globalSearchQuery,
    setGlobalSearchQuery,
    searchNewQuery, // Now memoized
    activeLayout,
    setActiveLayout,
    fullscreenDisplayPanel,
    setFullscreenDisplayPanel,
    contactDisplayPanel,
    setContactDisplayPanel,
    calendarDisplayPanel,
    setCalendarDisplayPanel,
    searchHistory,
    addToSearchHistory,
    removeFromSearchHistory,
    clearSearchHistory
  };
}
