// Types for our navigation system (Enhanced)
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

/**
 * Defines the main focusable areas in the email application
 */
export type FocusableArea =
  | 'space-nav' // Left top space cards
  | 'sidebar-nav' // Left sidebar navigation items (vertical)
  | 'pin-header' // Top of thread-list (horizontal)
  | 'thread-list' // Middle email thread list (vertical)
  | 'display-header' // Top of message-list (horizontal)
  | 'message-list' // Right side message content (vertical)
  | 'compose-inline'; // Inline reply compose area (vertical)

/**
 * List orientation for different navigation behaviors
 */
export type ListOrientation = 'vertical' | 'horizontal';

/**
 * Position within the application's navigation grid
 */
export type FocusPosition = {
  area: FocusableArea;
  index: number; // Position within that area
};

// Store references to focusable elements
export interface AreaRefsMap {
  'space-nav': HTMLDivElement | null;
  'sidebar-nav': HTMLDivElement | null;
  'pin-header': HTMLDivElement | null;
  'thread-list': HTMLDivElement | null;
  'display-header': HTMLDivElement | null;
  'message-list': HTMLDivElement | null;
  'compose-inline': HTMLDivElement | null;
}

/**
 * Navigation item data structure
 */
export interface NavigationItem {
  id: string;
  ref: HTMLElement | null;
}

/**
 * Pivot index map for each area - these can be set externally
 */
export type PivotIndexMap = Record<FocusableArea, number>;

/**
 * Disabled areas map - these areas will be skipped during navigation
 */
export type DisabledAreasMap = Record<FocusableArea, boolean>;

/**
 * Context for providing external state to determine pivot points and disabled areas
 */
export interface NavigationPivotContext {
  // Function to get the current pivot index for an area
  getPivotIndex: (area: FocusableArea) => number;
  // Function to check if pivot should be updated based on external state
  shouldUpdatePivot: (area: FocusableArea) => boolean;
  // Function to check if an area should be disabled
  isAreaDisabled?: (area: FocusableArea) => boolean;
}

/**
 * Area configuration with orientation and navigation relationships
 */
interface AreaConfig {
  orientation: ListOrientation;
  up?: FocusableArea;
  down?: FocusableArea;
  left?: FocusableArea;
  right?: FocusableArea;
  autoActivateOnMove?: boolean; // Whether to auto-activate items when navigating
}

/**
 * Custom hook for managing keyboard navigation throughout the app
 */
export function useKeyboardNavigation(pivotContext?: NavigationPivotContext) {
  // Current focus position state
  const [focusPosition, setFocusPosition] = useState<FocusPosition>({
    area: 'thread-list',
    index: -1
  });

  // Track if we're in keyboard navigation mode
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const isKeyboardModeRef = useRef(false);
  isKeyboardModeRef.current = isKeyboardMode;

  // The thread row the mouse is over, so arrow nav can start from it when the
  // user switches from mouse hover to the keyboard.
  const hoveredThreadIdRef = useRef<string | null>(null);

  // Track if we're currently applying programmatic focus to prevent loops
  const isProgrammaticFocus = useRef(false);

  // Store which areas are disabled
  const [disabledAreas, setDisabledAreas] = useState<DisabledAreasMap>({
    'sidebar-nav': false,
    'space-nav': false,
    'pin-header': false,
    'thread-list': false,
    'display-header': false,
    'message-list': false,
    'compose-inline': false
  });

  // Store the pivot index for each area (can be updated externally)
  const [pivotIndexMap, setPivotIndexMap] = useState<PivotIndexMap>({
    'sidebar-nav': 0,
    'space-nav': 0,
    'pin-header': 0,
    'thread-list': 0,
    'display-header': 0,
    'message-list': 0,
    'compose-inline': 0
  });

  // Track when we should auto-activate items
  const [shouldAutoActivate, setShouldAutoActivate] = useState<{
    area: FocusableArea;
    index: number;
  } | null>(null);

  // Track when we last updated pivots to avoid infinite loops
  const lastPivotUpdate = useRef<Record<FocusableArea, number>>({
    'sidebar-nav': 0,
    'space-nav': 0,
    'pin-header': 0,
    'thread-list': -1,
    'display-header': 0,
    'message-list': 0,
    'compose-inline': 0
  });

  // List of items in each area for proper navigation bounds
  const [navigationState, setNavigationState] = useState<{
    spaceNavItems: NavigationItem[];
    sidebarNavItems: NavigationItem[];
    pinHeaderItems: NavigationItem[];
    threadListItems: NavigationItem[];
    displayHeaderItems: NavigationItem[];
    messageListItems: NavigationItem[];
    composeInlineItems: NavigationItem[];
  }>({
    spaceNavItems: [],
    sidebarNavItems: [],
    pinHeaderItems: [],
    threadListItems: [],
    displayHeaderItems: [],
    messageListItems: [],
    composeInlineItems: []
  });

  // Refs to main container elements for scrolling and focus visualization
  const areaRefs = useRef<Partial<AreaRefsMap>>({});

  const { setSelectedThreads } = useThreadAtom();

  // Define area configurations with orientation and navigation relationships
  const areaConfigs: Record<FocusableArea, AreaConfig> = {
    'sidebar-nav': {
      orientation: 'vertical',
      right: 'thread-list',
      up: 'space-nav'
    },
    'space-nav': {
      orientation: 'horizontal',
      right: 'pin-header',
      down: 'sidebar-nav'
    },
    'pin-header': {
      orientation: 'horizontal',
      left: 'sidebar-nav',
      right: 'display-header',
      down: 'thread-list'
    },
    'thread-list': {
      orientation: 'vertical',
      left: 'sidebar-nav',
      right: 'message-list',
      up: 'pin-header',
      autoActivateOnMove: false
    },
    'display-header': {
      orientation: 'horizontal',
      left: 'pin-header',
      down: 'message-list'
    },
    'message-list': {
      orientation: 'vertical',
      left: 'thread-list',
      up: 'display-header'
    },
    'compose-inline': {
      orientation: 'vertical',
      left: 'thread-list'
    }
  };

  /**
   * Sets the disabled state for specific areas
   */
  const setAreaDisabled = useCallback((area: FocusableArea, disabled: boolean) => {
    setDisabledAreas((prev) => ({
      ...prev,
      [area]: disabled
    }));
  }, []);

  /**
   * Sets multiple areas disabled state at once
   */
  const setAreasDisabled = useCallback((areas: Partial<DisabledAreasMap>) => {
    setDisabledAreas((prev) => ({
      ...prev,
      ...areas
    }));
  }, []);

  /**
   * Checks if an area is disabled
   */
  const isAreaDisabled = useCallback(
    (area: FocusableArea): boolean => {
      // Check external context first
      if (pivotContext?.isAreaDisabled) {
        return pivotContext.isAreaDisabled(area);
      }
      // Fall back to internal state
      return disabledAreas[area];
    },
    [disabledAreas, pivotContext]
  );

  /**
   * Finds the next enabled area in a given direction
   */
  const findNextEnabledArea = useCallback(
    (
      currentArea: FocusableArea,
      direction: 'up' | 'down' | 'left' | 'right'
    ): FocusableArea | null => {
      const config = areaConfigs[currentArea];
      const nextArea = config[direction];

      if (!nextArea) {
        return null;
      }

      // If the next area is disabled, recursively check the next one
      if (isAreaDisabled(nextArea)) {
        return findNextEnabledArea(nextArea, direction);
      }

      return nextArea;
    },
    [isAreaDisabled]
  );

  /**
   * Gets the item list for a given area
   */
  const getItemList = useCallback(
    (area: FocusableArea): NavigationItem[] => {
      switch (area) {
        case 'sidebar-nav':
          return navigationState.sidebarNavItems;
        case 'space-nav':
          return navigationState.spaceNavItems;
        case 'pin-header':
          return navigationState.pinHeaderItems;
        case 'thread-list': {
          // Build items straight from the rendered rows so the nav always
          // matches what's on screen. The list renders from the context's
          // threadIds, which can diverge from the filteredThreadIds atom — when
          // it did, the nav had zero items and arrow keys did nothing.
          return Array.from(document.querySelectorAll<HTMLElement>('[data-thread]')).map((el) => ({
            id: el.getAttribute('data-thread') ?? '',
            ref: el
          }));
        }
        case 'display-header':
          return navigationState.displayHeaderItems;
        case 'message-list':
          return navigationState.messageListItems;
        case 'compose-inline':
          return navigationState.composeInlineItems;
        default:
          return [];
      }
    },
    [navigationState]
  );

  /**
   * Updates the pivot index for a specific area
   */
  const updatePivotIndex = useCallback((area: FocusableArea, index: number) => {
    setPivotIndexMap((prev) => ({
      ...prev,
      [area]: index
    }));
    lastPivotUpdate.current[area] = index;
  }, []);

  /**
   * Sets pivot index for an area (external API)
   */
  const setPivotIndex = useCallback(
    (area: FocusableArea, index: number) => {
      updatePivotIndex(area, index);
    },
    [updatePivotIndex]
  );

  /**
   * Finds the index of an item by its ID in a given area
   */
  const findItemIndexById = useCallback(
    (area: FocusableArea, itemId: string): number => {
      const itemList = getItemList(area);
      return itemList.findIndex((item) => item.id === itemId);
    },
    [getItemList]
  );

  /**
   * Gets a safe index for an area, handling out-of-bounds scenarios and disabled areas
   */
  const getSafeIndex = useCallback(
    (area: FocusableArea, preferredIndex?: number): number => {
      // If area is disabled, return -1
      if (isAreaDisabled(area)) {
        return -1;
      }

      const itemList = getItemList(area);
      const maxIndex = itemList.length - 1;

      if (itemList.length === 0) {
        return -1; // No items available
      }

      // Special handling for message-list: ONLY use last index when NO preferred index is given
      // AND when we're switching TO message-list from another area
      if (area === 'message-list' && preferredIndex === undefined) {
        // Check if we're currently in message-list - if so, don't force to last
        if (focusPosition.area === 'message-list') {
          // We're already in message-list, use current index but clamp it
          const currentIndex = focusPosition.index;
          return Math.min(Math.max(0, currentIndex), maxIndex);
        }
        // We're switching TO message-list, start at last
        return maxIndex;
      }

      // Use preferred index if provided, otherwise use pivot index
      const targetIndex = preferredIndex !== undefined ? preferredIndex : pivotIndexMap[area];

      // Clamp to valid bounds for all areas
      if (targetIndex > maxIndex) {
        return area === 'message-list' ? maxIndex : 0; // For message-list, go to last; others go to first
      }

      if (targetIndex < 0) {
        return 0; // Ensure minimum is 0
      }

      return targetIndex;
    },
    [getItemList, pivotIndexMap, isAreaDisabled, focusPosition.area, focusPosition.index]
  );

  /**
   * Updates pivot index based on external item ID (e.g., from atoms)
   */
  const updatePivotByItemId = useCallback(
    (area: FocusableArea, itemId: string) => {
      const index = findItemIndexById(area, itemId);
      if (index >= 0) {
        updatePivotIndex(area, index);
      }
    },
    [findItemIndexById, updatePivotIndex]
  );

  /**
   * Update pivots based on external context
   */
  useEffect(() => {
    if (!pivotContext) return;

    // Exclude message-list from external pivot updates since it always uses last index
    const areas: FocusableArea[] = ['sidebar-nav', 'space-nav', 'thread-list', 'compose-inline'];

    areas.forEach((area) => {
      if (pivotContext.shouldUpdatePivot(area)) {
        const newPivotIndex = pivotContext.getPivotIndex(area);

        // Only update if the value has actually changed
        if (newPivotIndex !== lastPivotUpdate.current[area]) {
          updatePivotIndex(area, newPivotIndex);
        }
      }
    });
  }, [pivotContext]);

  /**
   * Finds the area and index of an element based on its reference
   */
  const findElementPosition = useCallback(
    (element: HTMLElement): FocusPosition | null => {
      // Check all areas for the element
      const areas: FocusableArea[] = [
        'sidebar-nav',
        'space-nav',
        'thread-list',
        'message-list',
        'compose-inline'
      ];

      for (const area of areas) {
        // Skip disabled areas
        if (isAreaDisabled(area)) continue;

        const items = getItemList(area);
        const index = items.findIndex(
          (item) => item.ref === element || item.ref?.contains(element)
        );

        if (index !== -1) {
          return { area, index };
        }
      }

      return null;
    },
    [getItemList, isAreaDisabled]
  );

  /**
   * Handles focus events from mouse clicks or tab navigation
   */
  const handleElementFocus = useCallback(
    (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      const position = findElementPosition(target);

      if (position) {
        // Update the focus position when clicking
        setFocusPosition(position);
        updatePivotIndex(position.area, position.index);
        // Don't automatically enter keyboard mode on focus - wait for arrow keys
      }
    },
    [findElementPosition, updatePivotIndex]
  );

  /**
   * Global focus event listener to sync with real DOM focus
   */
  useEffect(() => {
    const handleGlobalFocus = (event: FocusEvent) => {
      handleElementFocus(event);
    };

    document.addEventListener('focusin', handleGlobalFocus, true);
    return () => {
      document.removeEventListener('focusin', handleGlobalFocus, true);
    };
  }, [handleElementFocus]);

  /**
   * Validates and updates focus position when navigation state changes
   */
  useEffect(() => {
    const currentItemList = getItemList(focusPosition.area);
    const safeIndex = getSafeIndex(focusPosition.area, focusPosition.index);

    // If current area is disabled, move to the first available area
    if (isAreaDisabled(focusPosition.area)) {
      const enabledAreas = (
        [
          'sidebar-nav',
          'space-nav',
          'thread-list',
          'message-list',
          'compose-inline'
        ] as FocusableArea[]
      ).filter((area) => !isAreaDisabled(area));

      if (enabledAreas.length > 0) {
        const fallbackArea = enabledAreas[0];
        const fallbackIndex = getSafeIndex(fallbackArea);
        if (fallbackIndex >= 0) {
          setFocusPosition({ area: fallbackArea, index: fallbackIndex });
          updatePivotIndex(fallbackArea, fallbackIndex);
        }
      }
      return;
    }

    if (safeIndex === -1) {
      // No items in current area, stay at current position but don't focus
      return;
    }

    if (focusPosition.index !== safeIndex) {
      setFocusPosition((prev) => ({
        ...prev,
        index: safeIndex
      }));
      updatePivotIndex(focusPosition.area, safeIndex);
    }
  }, [navigationState, focusPosition.area, focusPosition.index]);

  /**
   * Registers an item with its reference for keyboard navigation
   */
  const registerItem = useCallback(
    (area: FocusableArea, id: string, ref: HTMLElement | null, replace: boolean = true) => {
      if (!id || !ref) return;

      // Make element focusable if it's not already
      if (ref instanceof HTMLElement && typeof ref.focus === 'function') {
        if (ref.tabIndex === undefined || ref.tabIndex < 0) {
          ref.tabIndex = 0;
        }
      }

      const item: NavigationItem = { id, ref };

      setNavigationState((prev) => {
        const getUpdatedItems = (currentItems: NavigationItem[]) => {
          const existingIndex = currentItems.findIndex((item) => item.id === id);

          if (existingIndex !== -1) {
            if (!replace) return currentItems;
            const updatedItems = [...currentItems];
            updatedItems[existingIndex] = item;
            return updatedItems;
          }

          return [...currentItems, item];
        };

        switch (area) {
          case 'sidebar-nav':
            return { ...prev, sidebarNavItems: getUpdatedItems(prev.sidebarNavItems) };
          case 'space-nav':
            return { ...prev, spaceNavItems: getUpdatedItems(prev.spaceNavItems) };
          case 'pin-header':
            return { ...prev, pinHeaderItems: getUpdatedItems(prev.pinHeaderItems) };
          case 'thread-list':
            return { ...prev, threadListItems: getUpdatedItems(prev.threadListItems) };
          case 'display-header':
            return { ...prev, displayHeaderItems: getUpdatedItems(prev.displayHeaderItems) };
          case 'message-list':
            return { ...prev, messageListItems: getUpdatedItems(prev.messageListItems) };
          case 'compose-inline':
            return { ...prev, composeInlineItems: getUpdatedItems(prev.composeInlineItems) };
          default:
            return prev;
        }
      });
    },
    []
  );

  /**
   * Bulk register multiple items at once
   */
  const registerItems = useCallback(
    (
      area: FocusableArea,
      items: { id: string; ref: HTMLElement | null }[],
      replace: boolean = true
    ) => {
      items.forEach((item) => {
        registerItem(area, item.id, item.ref, replace);
      });
    },
    [registerItem]
  );

  /**
   * Updates the ref for an existing item
   */
  const updateItemRef = useCallback((area: FocusableArea, id: string, ref: HTMLElement | null) => {
    if (!id) return;

    // Make element focusable if it's not already
    if (ref && ref instanceof HTMLElement && typeof ref.focus === 'function') {
      if (ref.tabIndex === undefined || ref.tabIndex < 0) {
        ref.tabIndex = 0;
      }
    }

    setNavigationState((prev) => {
      const updateItems = (items: NavigationItem[]) =>
        items.map((item) => (item.id === id ? { ...item, ref } : item));

      switch (area) {
        case 'sidebar-nav':
          return { ...prev, sidebarNavItems: updateItems(prev.sidebarNavItems) };
        case 'space-nav':
          return { ...prev, spaceNavItems: updateItems(prev.spaceNavItems) };
        case 'pin-header':
          return { ...prev, pinHeaderItems: updateItems(prev.pinHeaderItems) };
        case 'thread-list':
          return { ...prev, threadListItems: updateItems(prev.threadListItems) };
        case 'display-header':
          return { ...prev, displayHeaderItems: updateItems(prev.displayHeaderItems) };
        case 'message-list':
          return { ...prev, messageListItems: updateItems(prev.messageListItems) };
        case 'compose-inline':
          return { ...prev, composeInlineItems: updateItems(prev.composeInlineItems) };
        default:
          return prev;
      }
    });
  }, []);

  /**
   * Registers a reference to a container element for an area
   */
  const registerAreaRef = useCallback((area: FocusableArea, ref: HTMLDivElement | null) => {
    if (ref) {
      areaRefs.current[area] = ref;
    }
  }, []);

  /**
   * Removes an item from navigation
   */
  const unregisterItem = useCallback((area: FocusableArea, id: string) => {
    if (!id) return;

    setNavigationState((prev) => {
      const filterItems = (items: NavigationItem[]) => items.filter((item) => item.id !== id);

      switch (area) {
        case 'sidebar-nav':
          return { ...prev, sidebarNavItems: filterItems(prev.sidebarNavItems) };
        case 'space-nav':
          return { ...prev, spaceNavItems: filterItems(prev.spaceNavItems) };
        case 'pin-header':
          return { ...prev, pinHeaderItems: filterItems(prev.pinHeaderItems) };
        case 'thread-list':
          return { ...prev, threadListItems: filterItems(prev.threadListItems) };
        case 'display-header':
          return { ...prev, displayHeaderItems: filterItems(prev.displayHeaderItems) };
        case 'message-list':
          return { ...prev, messageListItems: filterItems(prev.messageListItems) };
        case 'compose-inline':
          return { ...prev, composeInlineItems: filterItems(prev.composeInlineItems) };
        default:
          return prev;
      }
    });
  }, []);

  /**
   * Primary navigation handler that processes arrow key presses
   * Enhanced to support both vertical and horizontal lists and skip disabled areas
   */
  const handleArrowNavigation = useCallback(
    (key: string) => {
      const enteringKeyboardMode = !isKeyboardMode;
      // Enter keyboard mode when arrow keys are used
      setIsKeyboardMode(true);

      // Get current state directly instead of using setState callback. When the
      // user switches from mouse hover to the keyboard, start from the row the
      // mouse is over so the highlight continues from where they're looking
      // (instead of jumping from a stale position).
      let current = focusPosition;
      if (enteringKeyboardMode && hoveredThreadIdRef.current) {
        const hoveredIndex = getItemList('thread-list').findIndex(
          (item) => item.id === hoveredThreadIdRef.current
        );
        if (hoveredIndex >= 0) {
          current = { area: 'thread-list', index: hoveredIndex };
        }
      }
      const { area, index } = current;
      const config = areaConfigs[area];
      const currentItemList = getItemList(area);
      const maxIndex = currentItemList.length - 1;

      let newPosition = current;
      let shouldActivate = false;

      if (config.orientation === 'vertical') {
        // Vertical list: up/down moves index, left/right moves area
        switch (key) {
          case 'ArrowUp': {
            if (index <= 0) {
              // Try to move to area above
              const upArea = findNextEnabledArea(area, 'up');
              if (upArea) {
                const safeIndex = getSafeIndex(upArea);
                if (safeIndex >= 0) {
                  newPosition = { area: upArea, index: safeIndex };
                }
              }
            } else {
              newPosition = { ...current, index: Math.max(0, index - 1) };
              shouldActivate = config.autoActivateOnMove || false;
            }
            break;
          }

          case 'ArrowDown': {
            if (index >= maxIndex) {
              // Try to move to area below
              const downArea = findNextEnabledArea(area, 'down');
              if (downArea) {
                const safeIndex = getSafeIndex(downArea);
                if (safeIndex >= 0) {
                  newPosition = { area: downArea, index: safeIndex };
                }
              }
            } else {
              newPosition = { ...current, index: Math.min(maxIndex, index + 1) };
              shouldActivate = config.autoActivateOnMove || false;
            }
            break;
          }

          case 'ArrowLeft': {
            const leftArea = findNextEnabledArea(area, 'left');
            if (leftArea) {
              const safeIndex = getSafeIndex(leftArea);
              if (safeIndex >= 0) {
                newPosition = { area: leftArea, index: safeIndex };
              }
            }
            break;
          }

          case 'ArrowRight': {
            const rightArea = findNextEnabledArea(area, 'right');
            if (rightArea) {
              const safeIndex = getSafeIndex(rightArea);
              if (safeIndex >= 0) {
                newPosition = { area: rightArea, index: safeIndex };
              }
            }
            break;
          }
        }
      } else {
        // Horizontal list: left/right moves index, up/down moves area
        switch (key) {
          case 'ArrowLeft': {
            if (index <= 0) {
              // Try to move to area on the left
              const leftArea = findNextEnabledArea(area, 'left');
              if (leftArea) {
                const safeIndex = getSafeIndex(leftArea);
                if (safeIndex >= 0) {
                  newPosition = { area: leftArea, index: safeIndex };
                }
              }
            } else {
              newPosition = { ...current, index: Math.max(0, index - 1) };
              shouldActivate = config.autoActivateOnMove || false;
            }
            break;
          }

          case 'ArrowRight': {
            if (index >= maxIndex) {
              // Try to move to area on the right
              const rightArea = findNextEnabledArea(area, 'right');
              if (rightArea) {
                const safeIndex = getSafeIndex(rightArea);
                if (safeIndex >= 0) {
                  newPosition = { area: rightArea, index: safeIndex };
                }
              }
            } else {
              newPosition = { ...current, index: Math.min(maxIndex, index + 1) };
              shouldActivate = config.autoActivateOnMove || false;
            }
            break;
          }

          case 'ArrowUp': {
            const upArea = findNextEnabledArea(area, 'up');
            if (upArea) {
              const safeIndex = getSafeIndex(upArea);
              if (safeIndex >= 0) {
                newPosition = { area: upArea, index: safeIndex };
              }
            }
            break;
          }

          case 'ArrowDown': {
            const downArea = findNextEnabledArea(area, 'down');
            if (downArea) {
              const safeIndex = getSafeIndex(downArea);
              if (safeIndex >= 0) {
                newPosition = { area: downArea, index: safeIndex };
              }
            }
            break;
          }
        }
      }

      // Only update if position actually changed
      if (newPosition.area !== current.area || newPosition.index !== current.index) {
        setFocusPosition(newPosition);

        if (newPosition.area !== current.area && newPosition.area === 'message-list') {
          // Switching TO message-list - don't update pivot, let it stay at -1
        } else if (newPosition.area !== 'message-list') {
          // Update pivot for all other areas
          updatePivotIndex(newPosition.area, newPosition.index);
        }

        // Mark for auto-activation if needed
        if (shouldActivate) {
          setShouldAutoActivate({ area: newPosition.area, index: newPosition.index });
        }
      }
    },
    [
      focusPosition,
      getItemList,
      getSafeIndex,
      updatePivotIndex,
      findNextEnabledArea,
      isKeyboardMode
    ]
  );

  const resetMessageListToLast = useCallback(() => {
    const messageItems = getItemList('message-list');
    if (messageItems.length > 0) {
      const lastIndex = messageItems.length - 1;
      setFocusPosition((prev) =>
        prev.area === 'message-list' ? { ...prev, index: lastIndex } : prev
      );
      updatePivotIndex('message-list', -1); // Use -1 to indicate "last"
    }
  }, [getItemList, updatePivotIndex]);

  /**
   * Effect to handle auto-activation of items
   */
  useEffect(() => {
    if (!shouldAutoActivate) return;

    const { area, index } = shouldAutoActivate;
    const config = areaConfigs[area];

    if (config.autoActivateOnMove) {
      const itemList = getItemList(area);
      const itemRef = itemList[index]?.ref;

      if (itemRef && itemRef instanceof HTMLElement) {
        try {
          if (typeof itemRef.click === 'function') {
            itemRef.click();
          }
        } catch (error) {
          console.warn('Failed to auto-activate item:', error);
        }
      }
    }

    // Clear the auto-activation flag
    setShouldAutoActivate(null);
  }, [shouldAutoActivate]);

  /**
   * Checks if an element is focusable
   */
  const isFocusable = useCallback((element: HTMLElement | null): element is HTMLElement => {
    if (!element || typeof element.focus !== 'function') {
      return false;
    }

    const focusableTags = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'A'];
    const tagName = element.tagName.toUpperCase();

    return (
      (focusableTags.includes(tagName) || element.tabIndex >= 0) &&
      !element.hasAttribute('disabled')
    );
  }, []);

  /**
   * Applies real DOM focus and visual focus to the currently focused element
   */
  const applyRealFocus = useCallback(() => {
    const { area, index } = focusPosition;

    // Skip if area is disabled
    if (isAreaDisabled(area)) {
      return;
    }

    const currentItemList = getItemList(area);
    const currentRef = currentItemList[index]?.ref || null;

    if (currentRef && isFocusable(currentRef)) {
      try {
        // Set flag to prevent focus event loop
        isProgrammaticFocus.current = true;
        currentRef.focus();
        // Reset flag after a brief delay to allow the focus event to process
        setTimeout(() => {
          isProgrammaticFocus.current = false;
        }, 0);
      } catch (error) {
        console.warn('Failed to focus element:', error);
        isProgrammaticFocus.current = false;
        return;
      }

      // Add visual focus indicators only in keyboard mode
      if (isKeyboardMode) {
        // Remove previous focus indicators
        document.querySelectorAll('.keyboard-focused').forEach((el) => {
          el.classList.remove('keyboard-focused');
          el.setAttribute('data-focused', 'false');
        });

        // Add focus class and styling
        currentRef.classList.add('keyboard-focused');
        currentRef.setAttribute('data-focused', 'true');
      }

      // Scroll into view if needed
      currentRef.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Also provide focus to the parent area container for context
    const areaRef = areaRefs.current[area];
    if (areaRef && isKeyboardMode) {
      // Clear all previous container focus
      Object.values(areaRefs.current).forEach((ref) => {
        if (ref) ref.setAttribute('data-focused-container', 'false');
      });

      // Set focus on current container
      areaRef.setAttribute('data-focused-container', 'true');
    }
  }, [focusPosition, getItemList, isKeyboardMode, isFocusable, isAreaDisabled]);

  // Apply focus when position changes
  useEffect(() => {
    applyRealFocus();
  }, [focusPosition]);

  // Exit keyboard mode on real mouse interaction, and track the hovered thread
  // row so arrow nav can resume from where the mouse is.
  useEffect(() => {
    const exitKeyboardMode = () => {
      if (!isKeyboardModeRef.current) return;
      setIsKeyboardMode(false);
      // Remove all keyboard focus indicators
      document.querySelectorAll('.keyboard-focused').forEach((el) => {
        el.classList.remove('keyboard-focused');
        el.setAttribute('data-focused', 'false');
      });
      Object.values(areaRefs.current).forEach((ref) => {
        if (ref) ref.setAttribute('data-focused-container', 'false');
      });
    };

    let lastX = -1;
    let lastY = -1;
    const handleMouseMove = (e: MouseEvent) => {
      // Smooth-scroll under a stationary cursor fires mousemove with unchanged
      // coordinates — ignore those so arrow-nav scrolling doesn't drop us out
      // of keyboard mode (which would flicker the highlight off).
      if (e.clientX === lastX && e.clientY === lastY) return;
      lastX = e.clientX;
      lastY = e.clientY;
      const row = (e.target as HTMLElement | null)?.closest?.('[data-thread]') ?? null;
      hoveredThreadIdRef.current = row ? row.getAttribute('data-thread') : null;
      exitKeyboardMode();
    };

    document.addEventListener('mousedown', exitKeyboardMode);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousedown', exitKeyboardMode);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Set up global hotkeys for arrow navigation with key repeat support
  useHotkeys(
    'down',
    (e) => {
      e.preventDefault();
      handleArrowNavigation('ArrowDown');
    },
    { scopes: ['GLOBAL'] }
  );

  useHotkeys(
    'up',
    (e) => {
      e.preventDefault();
      handleArrowNavigation('ArrowUp');
    },
    { scopes: ['GLOBAL'] }
  );

  useHotkeys(
    'left',
    (e) => {
      e.preventDefault();
      handleArrowNavigation('ArrowLeft');
    },
    { scopes: ['GLOBAL'] }
  );

  useHotkeys(
    'right',
    (e) => {
      e.preventDefault();
      handleArrowNavigation('ArrowRight');
    },
    { scopes: ['GLOBAL'] }
  );

  /**
   * Handles infinite tab navigation with circular wrapping
   */
  const handleTabNavigation = useCallback(
    (direction: 'forward' | 'backward') => {
      // Enter keyboard mode when tab keys are used
      setIsKeyboardMode(true);

      setFocusPosition((current) => {
        const { area } = current;

        // Define the tab order for different starting contexts
        const getTabOrder = (currentArea: FocusableArea): FocusableArea[] => {
          // If we're in a horizontal area (pin-header or display-header),
          // include them in the tab cycle
          if (currentArea === 'pin-header' || currentArea === 'display-header') {
            return ['pin-header', 'display-header', 'sidebar-nav', 'thread-list', 'message-list'];
          }

          // For vertical areas, use the main navigation cycle
          return ['sidebar-nav', 'thread-list', 'message-list'];
        };

        const tabOrder = getTabOrder(area);

        // Filter out disabled areas
        const enabledTabOrder = tabOrder.filter((tabArea) => !isAreaDisabled(tabArea));

        if (enabledTabOrder.length === 0) {
          // No enabled areas, stay where we are
          return current;
        }

        const currentIndex = enabledTabOrder.indexOf(area);
        let nextIndex: number;

        if (direction === 'forward') {
          // Tab: move to next area, wrap to first if at end
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % enabledTabOrder.length;
        } else {
          // Shift+Tab: move to previous area, wrap to last if at beginning
          nextIndex =
            currentIndex === -1
              ? enabledTabOrder.length - 1
              : (currentIndex - 1 + enabledTabOrder.length) % enabledTabOrder.length;
        }

        const nextArea = enabledTabOrder[nextIndex];
        const safeIndex = getSafeIndex(nextArea);

        if (safeIndex >= 0) {
          const newPosition = { area: nextArea, index: safeIndex };

          // Update pivot for the new area (except message-list which uses special logic)
          if (nextArea !== 'message-list') {
            updatePivotIndex(nextArea, safeIndex);
          }

          return newPosition;
        }

        return current;
      });
    },
    [isAreaDisabled, getSafeIndex, updatePivotIndex]
  );

  useHotkeys(
    'tab',
    (e) => {
      e.preventDefault();
      handleTabNavigation('forward');
    },
    { scopes: ['GLOBAL'] }
  );

  useHotkeys(
    'shift+tab',
    (e) => {
      e.preventDefault();
      handleTabNavigation('backward');
    },
    { scopes: ['GLOBAL'] }
  );

  /**
   * Activates the currently focused item
   */
  const activateFocusedItem = useCallback(() => {
    const { area, index } = focusPosition;

    // Skip if area is disabled
    if (isAreaDisabled(area)) {
      return;
    }

    const currentItemList = getItemList(area);
    const currentRef = currentItemList[index]?.ref || null;

    if (currentRef && currentRef instanceof HTMLElement) {
      // Check if the current ref is actually the focused element
      // If not, focus it first before activating
      const activeElement = document.activeElement;
      console.log('activeElement: ', activeElement);

      if (activeElement !== currentRef && !currentRef.contains(activeElement)) {
        // The navigation system's tracked element is not the currently focused element
        // Focus our tracked element first
        // try {
        //   isProgrammaticFocus.current = true;
        //   currentRef.focus();
        //   setTimeout(() => {
        //     isProgrammaticFocus.current = false;
        //   }, 0);
        // } catch (error) {
        //   console.warn('Failed to focus element before activation:', error);
        //   isProgrammaticFocus.current = false;
        //   return;
        // }
        return;
      }

      // Now activate the element
      try {
        if (typeof currentRef.click === 'function') {
          currentRef.click();
        }

        if (currentRef.tagName === 'BUTTON') {
          (currentRef as HTMLButtonElement).click();
        } else if (['INPUT', 'TEXTAREA', 'SELECT'].includes(currentRef.tagName)) {
          if (isFocusable(currentRef)) {
            currentRef.focus();
          }
        }
      } catch (error) {
        console.warn('Failed to activate focused item:', error);
      }
    }
  }, [focusPosition, getItemList, isFocusable, isAreaDisabled]);

  // Toggle selection (checkbox) of the focused thread, Gmail-style. Outside
  // the thread list, fall back to activating the focused item.
  const toggleSelectFocusedThread = useCallback(() => {
    if (focusPosition.area !== 'thread-list') {
      activateFocusedItem();
      return;
    }
    const threadId = getItemList('thread-list')[focusPosition.index]?.id;
    if (!threadId) return;
    setSelectedThreads((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId]
    );
  }, [focusPosition, getItemList, setSelectedThreads, activateFocusedItem]);

  // Enter opens the focused item.
  useHotkeys(
    'enter',
    () => {
      activateFocusedItem();
    },
    { scopes: ['GLOBAL'] }
  );

  // Space selects/deselects the focused thread.
  useHotkeys(
    'space',
    (e) => {
      e.preventDefault();
      toggleSelectFocusedThread();
    },
    { scopes: ['GLOBAL'] }
  );

  /**
   * Effect to handle initial activation of the first thread when thread list loads
   */
  useEffect(() => {
    const { area, index } = focusPosition;

    // Only auto-activate on initial load for thread-list
    if (area === 'thread-list' && index === 0) {
      const threadItems = getItemList('thread-list');

      // Check if we just got the first thread items and should auto-activate
      if (threadItems.length > 0 && threadItems[0]?.ref) {
        const isFirstLoad = lastPivotUpdate.current['thread-list'] === -1;

        if (isFirstLoad) {
          // Mark that we've handled the first load
          lastPivotUpdate.current['thread-list'] = 0;

          // Auto-activate the first thread
          setTimeout(() => {
            setShouldAutoActivate({ area: 'thread-list', index: 0 });
          });
        }
      }
    }
  }, [navigationState.threadListItems, focusPosition, getItemList]);

  // Alternative approach: Add an initialization method to the hook's return object
  // const initializeWithFirstThread = useCallback(() => {
  //   const threadItems = getItemList('thread-list');

  //   if (threadItems.length > 0 && !isAreaDisabled('thread-list')) {
  //     // Set focus to first thread
  //     setFocusPosition({ area: 'thread-list', index: 0 });
  //     updatePivotIndex('thread-list', 0);

  //     // Auto-activate the first thread
  //     setShouldAutoActivate({ area: 'thread-list', index: 0 });
  //   }
  // }, [getItemList, isAreaDisabled, updatePivotIndex]);

  return {
    focusPosition,
    setFocusPosition,
    registerItem,
    updateItemRef,
    registerItems,
    unregisterItem,
    registerAreaRef,
    activateFocusedItem,
    navigationState,
    isKeyboardMode,
    pivotIndexMap,
    setPivotIndex, // External API to set pivot points
    findItemIndexById, // Find index by item ID
    updatePivotByItemId, // Update pivot using item ID
    setAreaDisabled,
    setAreasDisabled,
    isAreaDisabled,
    disabledAreas,
    resetMessageListToLast
  };
}
