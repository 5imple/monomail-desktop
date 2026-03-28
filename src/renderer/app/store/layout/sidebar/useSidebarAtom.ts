import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const sidebarCollapsedAtom = atomWithStorage<boolean>(
  'layout:sidebar:collapsed',
  false,
  createIndexedDBStorage<boolean>({
    defaultValue: false
  })
);
export const sidebarHoveredAtom = atom<boolean>(false);
export const sidebarLoadingAtom = atom<boolean>(true);

// Define a type for nav state by space
export interface NavState {
  isMailOpen: boolean;
  expandedItems: Record<string, boolean>;
}

// Define a type for account nav state
export interface AccountNavState {
  isAccountOpen: boolean;
  isBookmarksOpen: boolean;
  isLabelsOpen: boolean;
}

// Store the navigation state for each space
export const navStateBySpaceAtom = atomWithStorage<Record<string, NavState>>(
  'layout:sidebar:nav:space',
  {},
  createIndexedDBStorage<Record<string, NavState>>({
    defaultValue: {}
  })
);

// Store the navigation state for each account
export const accountNavStateAtom = atomWithStorage<Record<string, AccountNavState>>(
  'layout:sidebar:nav:account',
  {},
  createIndexedDBStorage<Record<string, AccountNavState>>({
    defaultValue: {}
  })
);

export function useSidebarAtom() {
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [sidebarHovered, setSidebarHovered] = useAtom(sidebarHoveredAtom);
  const [navStateBySpace, setNavStateBySpace] = useAtom(navStateBySpaceAtom);
  const [accountNavState, setAccountNavState] = useAtom(accountNavStateAtom);
  const [sidebarLoading, setSidebarLoading] = useAtom(sidebarLoadingAtom);

  // Track when sidebar state is loaded from storage
  useEffect(() => {
    // Use a longer timeout to ensure storage has been read
    // This allows time for the IndexedDB storage to be properly initialized
    const timer = setTimeout(() => {
      setSidebarLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [setSidebarLoading]);

  // Helper to get nav state for a specific space
  const getNavStateForSpace = (spaceId: string): NavState => {
    return (
      navStateBySpace[spaceId] || {
        isMailOpen: true, // Default to closed
        expandedItems: {} // Default to no items expanded
      }
    );
  };

  // Helper to update nav state for a specific space
  const updateNavStateForSpace = (spaceId: string, newState: Partial<NavState>) => {
    const currentState = getNavStateForSpace(spaceId);
    setNavStateBySpace({
      ...navStateBySpace,
      [spaceId]: {
        ...currentState,
        ...newState
      }
    });
  };

  // Helper to toggle mail open state for a space
  const toggleMailOpenForSpace = (spaceId: string) => {
    const currentState = getNavStateForSpace(spaceId);
    updateNavStateForSpace(spaceId, {
      isMailOpen: !currentState.isMailOpen
    });
  };

  // Helper to toggle expanded state of an item for a space
  const toggleItemExpandedForSpace = (spaceId: string, itemId: string) => {
    const currentState = getNavStateForSpace(spaceId);
    const newExpandedItems = {
      ...currentState.expandedItems,
      [itemId]: !currentState.expandedItems[itemId]
    };

    updateNavStateForSpace(spaceId, {
      expandedItems: newExpandedItems
    });
  };

  // Account-specific nav state helpers
  const getAccountNavState = (accountId: string): AccountNavState => {
    return (
      accountNavState[accountId] || {
        isAccountOpen: true, // Default to closed
        isBookmarksOpen: false, // Default to closed
        isLabelsOpen: false // Default to closed
      }
    );
  };

  const updateAccountNavState = (accountId: string, newState: Partial<AccountNavState>) => {
    const currentState = getAccountNavState(accountId);
    setAccountNavState({
      ...accountNavState,
      [accountId]: {
        ...currentState,
        ...newState
      }
    });
  };

  const toggleAccountOpen = (accountId: string) => {
    const currentState = getAccountNavState(accountId);
    updateAccountNavState(accountId, {
      isAccountOpen: !currentState.isAccountOpen
    });
  };

  const toggleBookmarksOpen = (accountId: string) => {
    const currentState = getAccountNavState(accountId);
    updateAccountNavState(accountId, {
      isBookmarksOpen: !currentState.isBookmarksOpen
    });
  };

  const toggleLabelsOpen = (accountId: string) => {
    const currentState = getAccountNavState(accountId);
    updateAccountNavState(accountId, {
      isLabelsOpen: !currentState.isLabelsOpen
    });
  };

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarHovered,
    setSidebarHovered,
    sidebarLoading,
    getNavStateForSpace,
    updateNavStateForSpace,
    toggleMailOpenForSpace,
    toggleItemExpandedForSpace,
    getAccountNavState,
    updateAccountNavState,
    toggleAccountOpen,
    toggleBookmarksOpen,
    toggleLabelsOpen
  };
}

export function useDefaultNav() {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        id: 'in:inbox',
        query: 'in:inbox',
        title: t('sidebar.nav.all_inboxes'),
        icon: 'Inbox',
        parentIcon: 'InboxStack',
        hotkey: 'G+I',
        iconColor: 'text-primary'
      },
      {
        id: 'is:starred',
        title: t('sidebar.nav.star'),
        icon: 'Star',
        parentIcon: 'Star',
        query: 'is:starred',
        hotkey: 'G+S',
        iconColor: 'text-yellow-500'
      },
      {
        id: 'in:sent',
        title: t('sidebar.nav.sent'),
        icon: 'SendHorizontal',
        parentIcon: 'SendHorizontal',
        query: 'in:sent',
        hotkey: 'G+T',
        iconColor: 'text-primary'
      },
      {
        id: 'in:draft',
        title: t('sidebar.nav.draft'),
        icon: 'Pen',
        parentIcon: 'Pen',
        query: 'in:draft',
        hotkey: 'G+D',
        iconColor: 'text-primary'
      },
      {
        id: 'not_in:inbox',
        query: 'NOT in:inbox',
        title: t('sidebar.nav.done'),
        icon: 'CheckCircle',
        parentIcon: 'CheckCircle',
        iconColor: 'text-green-500',
        hotkey: 'G+E'
      },
      {
        id: 'in:trash',
        title: t('sidebar.nav.trash'),
        icon: 'Trash',
        parentIcon: 'Trash',
        query: 'in:trash'
      },
      {
        id: 'in:spam',
        title: t('sidebar.nav.spam'),
        icon: 'AlertCircle',
        parentIcon: 'AlertCircle',
        query: 'in:spam',
        iconColor: 'text-red-500'
      }
    ],
    [t]
  );
}
