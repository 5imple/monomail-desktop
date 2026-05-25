/**
 * Enhanced context provider for the keyboard navigation system with atom integration and space support
 */
import {
  useKeyboardNavigation,
  FocusPosition,
  FocusableArea,
  NavigationItem,
  NavigationPivotContext,
  DisabledAreasMap
} from '@/renderer/app/hooks/useKeyboardNavigation';
import { useComposeWindowAtom } from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';

import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';

// Create context for the keyboard navigation system
interface KeyboardNavigationContextType {
  focusPosition: FocusPosition;
  setFocusPosition: React.Dispatch<React.SetStateAction<FocusPosition>>;
  registerItem: (
    area: FocusableArea,
    id: string,
    ref: HTMLElement | null,
    replace?: boolean
  ) => void;
  updateItemRef: (
    area: FocusableArea,
    id: string,
    ref: HTMLElement | null,
    replace?: boolean
  ) => void;
  registerItems: (
    area: FocusableArea,
    items: { id: string; ref: HTMLElement | null }[],
    replace?: boolean
  ) => void;
  unregisterItem: (area: FocusableArea, id: string) => void;
  registerAreaRef: (area: FocusableArea, ref: HTMLDivElement | null) => void;
  activateFocusedItem: () => void;
  navigationState: {
    spaceNavItems: NavigationItem[];
    sidebarNavItems: NavigationItem[];
    pinHeaderItems: NavigationItem[];
    threadListItems: NavigationItem[];
    displayHeaderItems: NavigationItem[];
    messageListItems: NavigationItem[];
    composeInlineItems: NavigationItem[];
  };
  isKeyboardMode: boolean;
  setPivotIndex: (area: FocusableArea, index: number) => void;
  findItemIndexById: (area: FocusableArea, itemId: string) => number;
  getHighlightedItemId: (area: FocusableArea) => string | null;
  updatePivotByItemId: (area: FocusableArea, itemId: string) => void;
  // New disable functionality
  setAreaDisabled: (area: FocusableArea, disabled: boolean) => void;
  setAreasDisabled: (areas: Partial<DisabledAreasMap>) => void;
  isAreaDisabled: (area: FocusableArea) => boolean;
  disabledAreas: DisabledAreasMap;
  resetMessageListToLast: () => void;
}

export const KeyboardNavigationContext = createContext<KeyboardNavigationContextType | null>(null);
KeyboardNavigationContext.displayName = 'KeyboardNavigationContext';

export const useKeyboardNavigationContext = () => {
  const context = useContext(KeyboardNavigationContext);
  if (!context) {
    throw new Error(
      'useKeyboardNavigationContext must be used within a KeyboardNavigationProvider'
    );
  }
  return context;
};

/**
 * Hook to create pivot context based on your app's atoms
 */
function useNavigationPivotContext(): NavigationPivotContext {
  const { globalSearchQuery } = useGlobalAtom();
  const { globalDraftWindows } = useComposeWindowAtom();
  const { activeThreadId, filteredThreadIds } = useThreadAtom();
  const { activeSpace } = useSpaceAtom();

  const getPivotIndex = useCallback((area: FocusableArea): number => {
    // This is now just a fallback - the real logic is in the provider's useEffect
    return 0;
  }, []);

  const shouldUpdatePivot = useCallback((area: FocusableArea): boolean => {
    switch (area) {
      case 'space-nav':
        // Update when active space changes
        return true;

      case 'sidebar-nav':
        // Update when globalSearchQuery changes
        return true;

      case 'thread-list':
        // Update when the active/opened thread or checked threads change
        return true;

      case 'message-list':
        // You can add conditions here for when to update message list pivot
        return false;

      case 'compose-inline':
        // Usually don't need to update compose pivot automatically
        return false;

      default:
        return false;
    }
  }, []);

  const isAreaDisabled = useCallback(
    (area: FocusableArea): boolean => {
      switch (area) {
        case 'message-list':
        case 'display-header':
          // Disable message-list and display-header when no thread is open
          return !activeThreadId;

        case 'compose-inline':
          // Disable compose when no thread is open
          return !activeThreadId;

        case 'space-nav':
        case 'sidebar-nav':
        case 'pin-header':
          // These areas are always enabled
          return false;

        default:
          return false;
      }
    },
    [activeThreadId, filteredThreadIds.length]
  );

  return useMemo(
    () => ({
      getPivotIndex,
      shouldUpdatePivot,
      isAreaDisabled
    }),
    [getPivotIndex, shouldUpdatePivot, isAreaDisabled]
  );
}

export const KeyboardNavigationProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const pivotContext = useNavigationPivotContext();
  const navigation = useKeyboardNavigation(pivotContext);
  const { globalSearchQuery } = useGlobalAtom();
  const { activeThreadId, selectedThreads } = useThreadAtom();
  const { activeSpace, spaces } = useSpaceAtom();

  // Update space navigation pivot based on active space
  useEffect(() => {
    if (activeSpace && spaces.length > 0) {
      navigation.updatePivotByItemId('space-nav', activeSpace.id);
    }
  }, [activeSpace, spaces, navigation.updatePivotByItemId]);

  // Update pivot indices based on atom changes using registered item IDs
  useEffect(() => {
    // Update sidebar navigation pivot based on globalSearchQuery
    // The sidebar items should register with IDs that match the query patterns
    // e.g., registerItem('sidebar-nav', 'category:primary', ref)
    if (globalSearchQuery) {
      navigation.updatePivotByItemId('sidebar-nav', globalSearchQuery);
    }
  }, [globalSearchQuery, navigation.updatePivotByItemId]);

  useEffect(() => {
    // Update thread list pivot based on the open thread, falling back to checked selection.
    if (activeThreadId) {
      navigation.updatePivotByItemId('thread-list', activeThreadId);
    } else if (selectedThreads.length > 0) {
      const lastSelectedThread = selectedThreads[selectedThreads.length - 1];
      navigation.updatePivotByItemId('thread-list', lastSelectedThread);
    }
  }, [activeThreadId, selectedThreads, navigation.updatePivotByItemId]);

  const contextValue = useMemo(
    () => ({
      ...navigation
      // Add any additional methods or computed values here
    }),
    [navigation]
  );

  return (
    <KeyboardNavigationContext.Provider value={contextValue}>
      <div className="keyboard-navigation-root">{children}</div>
    </KeyboardNavigationContext.Provider>
  );
};

/**
 * Helper hook to manually control pivot points from components
 */
export const useNavigationPivotControl = () => {
  const { setPivotIndex } = useKeyboardNavigationContext();
  const { globalSearchQuery, setGlobalSearchQuery } = useGlobalAtom();
  const { activeThreadId, selectedThreads, setActiveThreadId, filteredThreadIds } = useThreadAtom();
  const { activeSpace, switchSpace, spaces } = useSpaceAtom();

  /**
   * Update space pivot based on active space
   */
  const updateSpacePivot = useCallback(
    (spaceId: string) => {
      switchSpace(spaceId);
      // The pivot will be automatically updated via the context
    },
    [switchSpace]
  );

  /**
   * Update sidebar pivot based on search query
   */
  const updateSidebarPivot = useCallback(
    (query: string) => {
      setGlobalSearchQuery(query);
      // The pivot will be automatically updated via the context
    },
    [setGlobalSearchQuery]
  );

  /**
   * Update thread list pivot based on selected thread
   */
  const updateThreadListPivot = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      // The pivot will be automatically updated via the context
    },
    [setActiveThreadId]
  );

  /**
   * Manually set pivot for any area (useful for special cases)
   */
  const setManualPivot = useCallback(
    (area: FocusableArea, index: number) => {
      setPivotIndex(area, index);
    },
    [setPivotIndex]
  );

  /**
   * Get current space index for a given space ID
   */
  const getSpaceIndex = useCallback(
    (spaceId: string): number => {
      return spaces.findIndex((space) => space.id === spaceId);
    },
    [spaces]
  );

  /**
   * Get current thread index for a given thread ID
   */
  const getThreadIndex = useCallback(
    (threadId: string): number => {
      return filteredThreadIds.findIndex((id) => id === threadId);
    },
    [filteredThreadIds]
  );

  return {
    updateSpacePivot,
    updateSidebarPivot,
    updateThreadListPivot,
    setManualPivot,
    getSpaceIndex,
    getThreadIndex,
    currentActiveSpace: activeSpace,
    currentQuery: globalSearchQuery,
    currentSelectedThreads: selectedThreads,
    currentActiveThreadId: activeThreadId
  };
};

/**
 * Helper hook to easily disable/enable navigation areas based on your app state
 */
export const useNavigationAreaControl = () => {
  const { setAreaDisabled, setAreasDisabled, isAreaDisabled } = useKeyboardNavigationContext();
  const { activeThreadId, filteredThreadIds } = useThreadAtom();

  /**
   * Convenience method to disable message panel when no thread is selected
   */
  const updateMessagePanelState = useCallback(() => {
    const shouldDisable = !activeThreadId;
    setAreasDisabled({
      'message-list': shouldDisable,
      'display-header': shouldDisable,
      'compose-inline': shouldDisable
    });
  }, [activeThreadId, setAreasDisabled]);

  /**
   * Convenience method to disable thread list when no threads available
   */
  const updateThreadListState = useCallback(() => {
    const shouldDisable = filteredThreadIds.length === 0;
    setAreaDisabled('thread-list', shouldDisable);
  }, [filteredThreadIds.length, setAreaDisabled]);

  /**
   * Update all area states based on current app state
   */
  const updateAllAreaStates = useCallback(() => {
    updateMessagePanelState();
    updateThreadListState();
  }, [updateMessagePanelState, updateThreadListState]);

  // Auto-update when relevant state changes
  useEffect(() => {
    updateAllAreaStates();
  }, []);

  return {
    setAreaDisabled,
    setAreasDisabled,
    isAreaDisabled,
    updateMessagePanelState,
    updateThreadListState,
    updateAllAreaStates
  };
};
