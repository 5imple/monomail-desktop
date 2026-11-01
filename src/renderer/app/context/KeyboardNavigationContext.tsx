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
import { currentSearchQueryAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  selectedThreadsAtom
} from '@/renderer/app/store/thread/atoms';
import { atom, useAtomValue } from 'jotai';
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
 * Just the registration functions, whose identity never changes. Components
 * that only register themselves (every list row, every message card) take
 * this one: the full context's value is rebuilt on every provider render —
 * each key press, each change to any thread — and re-rendered all of them.
 */
type KeyboardRegistration = Pick<
  KeyboardNavigationContextType,
  'registerItem' | 'updateItemRef' | 'registerItems' | 'unregisterItem' | 'registerAreaRef'
>;

const KeyboardRegistrationContext = createContext<KeyboardRegistration | null>(null);
KeyboardRegistrationContext.displayName = 'KeyboardRegistrationContext';

// Whether the keyboard is driving (rarely changes), for components that style
// themselves by it: the full context changes on every key press.
const KeyboardModeContext = createContext(false);
KeyboardModeContext.displayName = 'KeyboardModeContext';
export const useIsKeyboardMode = () => useContext(KeyboardModeContext);

export const useKeyboardRegistration = () => {
  const context = useContext(KeyboardRegistrationContext);
  if (!context) {
    throw new Error('useKeyboardRegistration must be used within a KeyboardNavigationProvider');
  }
  return context;
};

/**
 * Hook to create pivot context based on your app's atoms
 */
// Only the count: the provider wraps the whole layout, so subscribing it to
// the id list (or the whole thread store) re-rendered the app on every change.
const filteredThreadCountAtom = atom((get) => get(filteredThreadIdsAtom).length);

function useNavigationPivotContext(): NavigationPivotContext {
  const activeThreadId = useAtomValue(activeThreadIdAtom);
  const filteredThreadCount = useAtomValue(filteredThreadCountAtom);

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
    [activeThreadId, filteredThreadCount]
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
  const globalSearchQuery = useAtomValue(currentSearchQueryAtom);
  const activeThreadId = useAtomValue(activeThreadIdAtom);
  const selectedThreads = useAtomValue(selectedThreadsAtom);
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

  const { registerItem, updateItemRef, registerItems, unregisterItem, registerAreaRef } =
    navigation;
  const registration = useMemo(
    () => ({ registerItem, updateItemRef, registerItems, unregisterItem, registerAreaRef }),
    [registerItem, updateItemRef, registerItems, unregisterItem, registerAreaRef]
  );

  return (
    <KeyboardNavigationContext.Provider value={contextValue}>
      <KeyboardRegistrationContext.Provider value={registration}>
        <KeyboardModeContext.Provider value={navigation.isKeyboardMode}>
          <div className="keyboard-navigation-root">{children}</div>
        </KeyboardModeContext.Provider>
      </KeyboardRegistrationContext.Provider>
    </KeyboardNavigationContext.Provider>
  );
};
