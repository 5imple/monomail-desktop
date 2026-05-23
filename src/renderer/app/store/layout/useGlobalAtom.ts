import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const loadingAtom = atom<boolean>(false);
export const activateTourAtom = atom<boolean>(false);
export const gmailStatusInvalidAtom = atom<boolean>(false);
export const fullscreenDisplayPanelAtom = atom<boolean>(false);
export const contactDisplayPanelAtom = atomWithStorage<boolean>('global:display:contact', true);
export const calendarDisplayPanelAtom = atomWithStorage<boolean>(
  'global:display:calendar',
  true,
  createIndexedDBStorage<boolean>({
    defaultValue: true
  })
);
export const currentSearchQueryAtom = atom<string>('category:primary');
export const searchHistoryAtom = atomWithStorage<string[]>(
  'global:search-history',
  [],
  createIndexedDBStorage<string[]>({
    defaultValue: []
  })
);
export type GlobalLayout = 'MAIL' | 'CATCHUP' | 'LATER';

export const activeLayoutAtom = atom<GlobalLayout>('MAIL');

import { useCallback } from 'react';

export function useGlobalAtom() {
  const { setSelectedContacts } = useContactAtom();
  const { setActiveThreadId, setSelectedThreads } = useThreadAtom();
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

  const searchNewQuery = useCallback(
    (query: string, threadIds?: string[], addToHistory = true) => {
      setGlobalSearchQuery(query);
      setSelectedThreads(threadIds ?? []);
      setActiveThreadId(threadIds?.length === 1 ? threadIds[0] : null);
      setSelectedContacts([]);
      setActiveLayout('MAIL');
      if (addToHistory) {
        addToSearchHistory(query);
      }
    },
    [
      setGlobalSearchQuery,
      setActiveThreadId,
      setSelectedThreads,
      setSelectedContacts,
      setActiveLayout,
      addToSearchHistory
    ]
  );

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
