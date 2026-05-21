import spaceApi from '@/main/api/space/spaceApi';
import {
  CustomNavItem,
  CustomSidebarState,
  UpdateCustomSidebarRequest,
  AddCustomSidebarItemRequest,
  CreateCustomSidebarFolderRequest,
  ReorderCustomSidebarRequest,
  MoveCustomSidebarItemRequest
} from '@/main/api/space/types';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';
import { activeSpaceAtom, spacesAtom } from '@/renderer/app/store/space/atom';
import { atom, useAtom } from 'jotai';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useSidebarMigration } from '@/renderer/app/store/space/migrateSidebarAtom';

// Re-export types for other components to use
export type { CustomNavItem, CustomSidebarState };

/**
 * Semantic icon colors for default sidebar nav items.
 *
 * Centralized here so we can recolor a category (e.g. "warning" → amber
 * instead of yellow) in one place instead of touching every default.
 * `CustomNavItem.iconColor` is still typed as a raw Tailwind class string;
 * these constants are the canonical values to use for the defaults.
 */
export const NAV_ICON_COLOR = {
  primary: 'text-primary',
  muted: 'text-muted-foreground',
  warning: 'text-yellow-500',
  positive: 'text-green-500',
  destructive: 'text-red-500',
  feature: 'text-purple-500'
} as const;

// Atom for custom sidebar state by space ID
export const customSidebarBySpaceAtom = atom<Record<string, CustomSidebarState>>({});

// Cache key for custom sidebar
const CUSTOM_SIDEBAR_CACHE_KEY = 'cache:space:sidebar';

// Utility function to get cached sidebar from IndexedDB
export const getCachedCustomSidebar = async (
  spaceId: string
): Promise<CustomSidebarState | null> => {
  try {
    const cacheKey = `${CUSTOM_SIDEBAR_CACHE_KEY}:${spaceId}`;
    const cachedSidebar = await monoLocalStorageDb.getItem<CustomSidebarState>(cacheKey);
    return cachedSidebar || null;
  } catch (error) {
    console.warn('Failed to get cached custom sidebar:', error);
    return null;
  }
};

// Cache custom sidebar to IndexedDB AND update atom
const cacheCustomSidebar = async (
  spaceId: string,
  sidebarState: CustomSidebarState,
  updateAtom: (
    updater: (prev: Record<string, CustomSidebarState>) => Record<string, CustomSidebarState>
  ) => void
): Promise<void> => {
  try {
    // Update atom first for immediate UI update
    updateAtom((prev) => ({
      ...prev,
      [spaceId]: sidebarState
    }));

    // Then update cache
    const cacheKey = `${CUSTOM_SIDEBAR_CACHE_KEY}:${spaceId}`;
    await monoLocalStorageDb.setItem(cacheKey, sidebarState);
  } catch (error) {
    console.warn('Failed to cache custom sidebar:', error);
  }
};

// Clear custom sidebar cache
export const clearCustomSidebarCache = async (spaceId: string): Promise<void> => {
  try {
    const cacheKey = `${CUSTOM_SIDEBAR_CACHE_KEY}:${spaceId}`;
    await monoLocalStorageDb.removeItem(cacheKey);
  } catch (error) {
    console.warn('Failed to clear custom sidebar cache:', error);
  }
};

// Background sync to server - non-blocking
const syncSidebarToServer = async (
  spaceId: string,
  sidebarState: CustomSidebarState
): Promise<void> => {
  try {
    await spaceApi.updateCustomSidebar(spaceId, { sidebarState });
    console.log('Sidebar synced to server successfully for space:', spaceId);
  } catch (error) {
    console.warn('Failed to sync sidebar to server (will retry later):', error);
    // Could implement retry logic here in the future
  }
};

// Background sync from server - non-blocking
const syncSidebarFromServer = async (spaceId: string): Promise<CustomSidebarState | null> => {
  try {
    const response = await spaceApi.fetchCustomSidebar(spaceId);
    const serverSidebarState = response.sidebarState;

    // NOTE: Don't update cache here - let the caller handle atom/cache updates
    console.log('Sidebar synced from server successfully for space:', spaceId);

    return serverSidebarState;
  } catch (error) {
    console.warn('Failed to sync sidebar from server:', error);
    return null;
  }
};

// Default nav item IDs that should use dynamic properties
const DEFAULT_NAV_ITEM_IDS = [
  'primary',
  'starred',
  'sent',
  'draft',
  'all-mail',
  'done',
  'trash',
  'spam',
  'social',
  'promotions',
  'updates',
  'forums'
];

// Function to get dynamic properties for default nav items
export const getDefaultNavItemProperties = (
  itemId: string,
  t: any
): Partial<CustomNavItem> | null => {
  const defaultProperties: Record<string, Partial<CustomNavItem>> = {
    primary: {
      title: t('sidebar.nav.category.inbox'),
      icon: 'Inbox',
      iconColor: NAV_ICON_COLOR.primary,
      query: 'category:primary',
      hotkey: 'G+P'
    },
    starred: {
      title: t('sidebar.nav.star'),
      icon: 'Star',
      iconColor: NAV_ICON_COLOR.warning,
      query: 'is:starred',
      hotkey: 'G+S'
    },
    sent: {
      title: t('sidebar.nav.sent'),
      icon: 'SendHorizontal',
      iconColor: NAV_ICON_COLOR.primary,
      query: 'in:sent',
      hotkey: 'G+T'
    },
    draft: {
      title: t('sidebar.nav.draft'),
      icon: 'Pen',
      iconColor: NAV_ICON_COLOR.primary,
      query: 'in:draft',
      hotkey: 'G+D'
    },
    'all-mail': {
      title: t('sidebar.nav.all_mail'),
      icon: 'Envelope',
      iconColor: NAV_ICON_COLOR.primary,
      query: 'in:all -in:trash',
      hotkey: 'G+A'
    },
    done: {
      title: t('sidebar.nav.done'),
      icon: 'CheckCircle',
      iconColor: NAV_ICON_COLOR.positive,
      query: 'NOT in:inbox',
      hotkey: 'G+E'
    },
    trash: {
      title: t('sidebar.nav.trash'),
      icon: 'Trash',
      iconColor: NAV_ICON_COLOR.primary,
      query: 'in:trash'
    },
    spam: {
      title: t('sidebar.nav.spam'),
      icon: 'AlertCircle',
      iconColor: NAV_ICON_COLOR.destructive,
      query: 'in:spam'
    },
    social: {
      title: t('sidebar.nav.category.social'),
      icon: 'UserGroup',
      iconColor: NAV_ICON_COLOR.muted,
      query: 'category:social'
    },
    promotions: {
      title: t('sidebar.nav.category.promotions'),
      icon: 'Newsletter',
      iconColor: NAV_ICON_COLOR.positive,
      query: 'category:promotions'
    },
    updates: {
      title: t('sidebar.nav.category.updates'),
      icon: 'Bell',
      iconColor: NAV_ICON_COLOR.warning,
      query: 'category:updates'
    },
    forums: {
      title: t('sidebar.nav.category.forums'),
      icon: 'ChatBubble',
      iconColor: NAV_ICON_COLOR.feature,
      query: 'category:forums'
    }
  };

  return defaultProperties[itemId] || null;
};

// Helper function to check if an item is a default nav item
export const isDefaultNavItem = (itemId: string): boolean => {
  return DEFAULT_NAV_ITEM_IDS.includes(itemId);
};

// Default nav items based on current primary/secondary nav
export const getDefaultNavItems = (t: any): CustomNavItem[] => [
  {
    id: 'primary',
    type: 'primary',
    title: t('sidebar.nav.category.inbox'),
    icon: 'Inbox',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'category:primary',
    hotkey: 'G+P',
    position: 0
  },
  {
    id: 'starred',
    type: 'primary',
    title: t('sidebar.nav.star'),
    icon: 'Star',
    iconColor: NAV_ICON_COLOR.warning,
    query: 'is:starred',
    hotkey: 'G+S',
    position: 1
  },
  {
    id: 'sent',
    type: 'primary',
    title: t('sidebar.nav.sent'),
    icon: 'SendHorizontal',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'in:sent',
    hotkey: 'G+T',
    position: 2
  },
  {
    id: 'draft',
    type: 'primary',
    title: t('sidebar.nav.draft'),
    icon: 'Pen',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'in:draft',
    hotkey: 'G+D',
    position: 3
  },
  {
    id: 'all-mail',
    type: 'primary',
    title: t('sidebar.nav.all_mail'),
    icon: 'Envelope',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'in:all -in:trash',
    hotkey: 'G+A',
    position: 4
  }
];

// Available nav items that can be added via "More" dropdown
export const getAvailableNavItems = (t: any): CustomNavItem[] => [
  // Default/Primary nav items - now optional
  {
    id: 'primary',
    type: 'primary',
    title: t('sidebar.nav.category.inbox'),
    icon: 'Inbox',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'category:primary',
    hotkey: 'G+P',
    position: 0
  },
  {
    id: 'starred',
    type: 'primary',
    title: t('sidebar.nav.star'),
    icon: 'Star',
    iconColor: NAV_ICON_COLOR.warning,
    query: 'is:starred',
    hotkey: 'G+S',
    position: 1
  },
  {
    id: 'sent',
    type: 'primary',
    title: t('sidebar.nav.sent'),
    icon: 'SendHorizontal',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'in:sent',
    hotkey: 'G+T',
    position: 2
  },
  {
    id: 'draft',
    type: 'primary',
    title: t('sidebar.nav.draft'),
    icon: 'Pen',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'in:draft',
    hotkey: 'G+D',
    position: 3
  },
  {
    id: 'all-mail',
    type: 'primary',
    title: t('sidebar.nav.all_mail'),
    icon: 'Envelope',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'in:all -in:trash',
    hotkey: 'G+A',
    position: 4
  },
  // Additional nav items
  {
    id: 'done',
    type: 'primary',
    title: t('sidebar.nav.done'),
    icon: 'CheckCircle',
    iconColor: NAV_ICON_COLOR.positive,
    query: 'NOT in:inbox',
    hotkey: 'G+E',
    position: 5
  },
  {
    id: 'trash',
    type: 'primary',
    title: t('sidebar.nav.trash'),
    icon: 'Trash',
    iconColor: NAV_ICON_COLOR.primary,
    query: 'in:trash',
    position: 6
  },
  {
    id: 'spam',
    type: 'primary',
    title: t('sidebar.nav.spam'),
    icon: 'AlertCircle',
    iconColor: NAV_ICON_COLOR.destructive,
    query: 'in:spam',
    position: 7
  },
  {
    id: 'social',
    type: 'secondary',
    title: t('sidebar.nav.category.social'),
    icon: 'UserGroup',
    iconColor: NAV_ICON_COLOR.muted,
    query: 'category:social',
    position: 8
  },
  {
    id: 'promotions',
    type: 'secondary',
    title: t('sidebar.nav.category.promotions'),
    icon: 'Newsletter',
    iconColor: NAV_ICON_COLOR.positive,
    query: 'category:promotions',
    position: 9
  },
  {
    id: 'updates',
    type: 'secondary',
    title: t('sidebar.nav.category.updates'),
    icon: 'Bell',
    iconColor: NAV_ICON_COLOR.warning,
    query: 'category:updates',
    position: 10
  },
  {
    id: 'forums',
    type: 'secondary',
    title: t('sidebar.nav.category.forums'),
    icon: 'ChatBubble',
    iconColor: NAV_ICON_COLOR.feature,
    query: 'category:forums',
    position: 11
  }
];

export function useCustomSidebarAtom() {
  const [spaces, setSpaces] = useAtom(spacesAtom);
  const [activeSpace, setActiveSpace] = useAtom(activeSpaceAtom);
  const [sidebarsBySpace, setSidebarsBySpace] = useAtom(customSidebarBySpaceAtom);
  const { t } = useTranslation();
  const { migrateToCustomSidebar } = useSidebarMigration();

  // Initialize default sidebar for a space
  const initializeDefaultSidebar = useCallback(
    async (spaceId: string): Promise<CustomSidebarState> => {
      const migrated = await migrateToCustomSidebar(spaceId);
      if (migrated) {
        return migrated;
      }
      const defaultItems = getDefaultNavItems(t);
      const items: Record<string, CustomNavItem> = {};
      const order: string[] = [];

      defaultItems.forEach((item) => {
        items[item.id] = item;
        order.push(item.id);
      });

      return { items, order };
    },
    [t, migrateToCustomSidebar]
  );

  // Get sidebar state for a space - ATOM FIRST approach
  const getSidebarForSpace = useCallback(
    async (
      spaceId: string,
      onServerSync?: (serverSidebar: CustomSidebarState) => void
    ): Promise<CustomSidebarState> => {
      // 1. Check atom first
      const atomSidebar = sidebarsBySpace[spaceId];
      if (atomSidebar) {
        console.log('Using atom sidebar for space:', spaceId);

        // Background sync from server (non-blocking)
        syncSidebarFromServer(spaceId).then((serverSidebar) => {
          // If server sync succeeds and UI callback is provided, update both atom and cache
          if (serverSidebar && onServerSync) {
            // Compare with atom to see if there are differences
            const hasChanges = JSON.stringify(atomSidebar) !== JSON.stringify(serverSidebar);
            if (hasChanges) {
              console.log('Server sidebar differs from atom, updating');
              cacheCustomSidebar(spaceId, serverSidebar, setSidebarsBySpace);
              onServerSync(serverSidebar);
            }
          }
        });

        return atomSidebar;
      }

      // 2. Try cache if not in atom
      const cachedSidebar = await getCachedCustomSidebar(spaceId);
      if (cachedSidebar) {
        console.log('Using cached sidebar for space:', spaceId);

        // Update atom with cached data
        setSidebarsBySpace((prev) => ({
          ...prev,
          [spaceId]: cachedSidebar
        }));

        // Background sync from server (non-blocking)
        syncSidebarFromServer(spaceId).then((serverSidebar) => {
          if (serverSidebar) {
            const hasChanges = JSON.stringify(cachedSidebar) !== JSON.stringify(serverSidebar);
            if (hasChanges) {
              console.log('Server sidebar differs from cache, updating server with cached data');
              // Prioritize cached data and sync it to server
              syncSidebarToServer(spaceId, cachedSidebar).catch((error) => {
                console.warn('Failed to sync cached sidebar to server:', error);
              });
            }
          }
        });

        return cachedSidebar;
      }

      // 3. If no atom and no cache, try to fetch from server first
      try {
        console.log('No cached sidebar found, trying server for space:', spaceId);
        const serverSidebar = await syncSidebarFromServer(spaceId);

        if (serverSidebar) {
          console.log('Found sidebar on server, using it');
          await cacheCustomSidebar(spaceId, serverSidebar, setSidebarsBySpace);
          return serverSidebar;
        }
      } catch (error) {
        console.warn('Failed to fetch from server, will use defaults:', error);
      }

      // 4. If no atom, cache, and no server data, initialize with defaults
      console.log('No cached or server sidebar found, initializing defaults for space:', spaceId);
      const defaultSidebar = await initializeDefaultSidebar(spaceId);

      // 5. Update both atom and cache immediately
      await cacheCustomSidebar(spaceId, defaultSidebar, setSidebarsBySpace);

      // 6. Try to upload defaults to server (non-blocking)
      syncSidebarToServer(spaceId, defaultSidebar).catch((error) => {
        console.warn('Failed to upload default sidebar to server:', error);
      });

      return defaultSidebar;
    },
    [sidebarsBySpace, setSidebarsBySpace, initializeDefaultSidebar]
  );

  // Update sidebar state for a space - OPTIMISTIC UPDATES
  const updateSidebarForSpace = useCallback(
    async (spaceId: string, newSidebarState: CustomSidebarState) => {
      try {
        // 1. Update atom and cache immediately (optimistic)
        await cacheCustomSidebar(spaceId, newSidebarState, setSidebarsBySpace);

        // 2. Sync to server in background (non-blocking)
        syncSidebarToServer(spaceId, newSidebarState);

        return true;
      } catch (error) {
        console.error('Failed to update sidebar:', error);
        return false;
      }
    },
    [setSidebarsBySpace]
  );

  // Add new nav item to current space - OPTIMISTIC UPDATE
  const addNavItem = useCallback(
    async (newItem: Omit<CustomNavItem, 'position'>) => {
      if (!activeSpace) return false;

      try {
        // 1. Get current state from atom or load it
        const currentSidebar = await getSidebarForSpace(activeSpace.id);

        // 2. Calculate position
        const position =
          Math.max(...Object.values(currentSidebar.items).map((item) => item.position), -1) + 1;

        const itemWithPosition: CustomNavItem = {
          ...newItem,
          position
        };

        // 3. Update atom and cache immediately (optimistic)
        const updatedSidebar: CustomSidebarState = {
          items: {
            ...currentSidebar.items,
            [newItem.id]: itemWithPosition
          },
          order: [...currentSidebar.order, newItem.id]
        };

        await cacheCustomSidebar(activeSpace.id, updatedSidebar, setSidebarsBySpace);

        // 4. Sync to server in background (non-blocking)
        const itemRequest: AddCustomSidebarItemRequest = {
          id: newItem.id,
          type: newItem.type,
          title: newItem.title,
          icon: newItem.icon,
          iconColor: newItem.iconColor,
          query: newItem.query,
          hotkey: newItem.hotkey,
          accountId: newItem.accountId,
          labelId: newItem.labelId,
          parentId: newItem.parentId,
          children: newItem.children,
          isCollapsed: newItem.isCollapsed
        };

        spaceApi
          .addCustomSidebarItem(activeSpace.id, itemRequest)
          .then((response) => {
            console.log('Successfully synced add item to server');
          })
          .catch((error) => {
            console.warn('Failed to sync add item to server:', error);
          });

        return true;
      } catch (error) {
        console.error('Failed to add nav item:', error);
        toast.error(t('toast.error.sidebar_add_item'));
        return false;
      }
    },
    [activeSpace, t, getSidebarForSpace, setSidebarsBySpace]
  );

  // Remove nav item from current space - OPTIMISTIC UPDATE
  const removeNavItem = useCallback(
    async (itemId: string) => {
      if (!activeSpace) return false;

      try {
        // 1. Get current state from atom or load it
        const currentSidebar = await getSidebarForSpace(activeSpace.id);
        const itemToRemove = currentSidebar.items[itemId];

        if (!itemToRemove) return false;

        // 2. Collect all items to remove (including recursive children for folders)
        const itemsToRemove = new Set<string>();

        const collectItemsToRemove = (id: string) => {
          itemsToRemove.add(id);
          const item = currentSidebar.items[id];

          // If it's a folder, recursively collect all children
          if (item && item.type === 'folder' && item.children) {
            item.children.forEach((childId) => {
              collectItemsToRemove(childId);
            });
          }
        };

        collectItemsToRemove(itemId);

        // 3. Remove all collected items from atom and cache immediately (optimistic)
        const remainingItems = { ...currentSidebar.items };
        itemsToRemove.forEach((id) => {
          delete remainingItems[id];
        });

        // Update order and parent folder children
        const updatedOrder = currentSidebar.order.filter((id) => !itemsToRemove.has(id));

        // Remove item from any parent folder's children array
        Object.values(remainingItems).forEach((item) => {
          if (item.type === 'folder' && item.children) {
            const filteredChildren = item.children.filter((childId) => !itemsToRemove.has(childId));
            if (filteredChildren.length !== item.children.length) {
              remainingItems[item.id] = {
                ...item,
                children: filteredChildren
              };
            }
          }
        });

        const updatedSidebar: CustomSidebarState = {
          items: remainingItems,
          order: updatedOrder
        };

        await cacheCustomSidebar(activeSpace.id, updatedSidebar, setSidebarsBySpace);

        // 4. Sync to server in background (non-blocking)
        spaceApi
          .deleteCustomSidebarItem(activeSpace.id, itemId)
          .then((response) => {
            console.log('Successfully synced delete item to server');
          })
          .catch((error) => {
            console.warn('Failed to sync delete item to server:', error);
          });

        return true;
      } catch (error) {
        console.error('Failed to remove nav item:', error);
        toast.error(t('toast.error.sidebar_remove_item'));
        return false;
      }
    },
    [activeSpace, t, getSidebarForSpace, setSidebarsBySpace]
  );

  // Reorder nav items after drag and drop - OPTIMISTIC UPDATE
  const reorderNavItems = useCallback(
    async (newOrder: string[], currentState?: CustomSidebarState) => {
      if (!activeSpace) return false;

      try {
        // 1. Use provided state or get from atom
        const currentSidebar = currentState || (await getSidebarForSpace(activeSpace.id));

        // 2. Update atom and cache immediately (optimistic)
        const updatedSidebar: CustomSidebarState = {
          ...currentSidebar,
          order: newOrder
        };

        await cacheCustomSidebar(activeSpace.id, updatedSidebar, setSidebarsBySpace);

        // 3. Sync to server in background (non-blocking)
        const orderRequest: ReorderCustomSidebarRequest = { order: newOrder };
        spaceApi
          .reorderCustomSidebarItems(activeSpace.id, orderRequest)
          .then((response) => {
            console.log('Successfully synced reorder to server');
          })
          .catch((error) => {
            console.warn('Failed to sync reorder to server:', error);
          });

        return true;
      } catch (error) {
        console.error('Failed to reorder nav items:', error);
        toast.error(t('toast.error.sidebar_reorder'));
        return false;
      }
    },
    [activeSpace, t, getSidebarForSpace, setSidebarsBySpace]
  );

  // Create new folder - OPTIMISTIC UPDATE
  const createFolder = useCallback(
    async (folderName: string) => {
      if (!activeSpace) return false;

      try {
        // 1. Get current state from atom or load it
        const currentSidebar = await getSidebarForSpace(activeSpace.id);

        // 2. Create folder data
        const folderId = `folder-${Date.now()}`;
        const position =
          Math.max(...Object.values(currentSidebar.items).map((item) => item.position), -1) + 1;

        const newFolder: CustomNavItem = {
          id: folderId,
          type: 'folder',
          title: folderName,
          icon: 'Folder',
          children: [],
          isCollapsed: false,
          position
        };

        // 3. Update atom and cache immediately (optimistic)
        const updatedSidebar: CustomSidebarState = {
          items: {
            ...currentSidebar.items,
            [folderId]: newFolder
          },
          order: [...currentSidebar.order, folderId]
        };

        await cacheCustomSidebar(activeSpace.id, updatedSidebar, setSidebarsBySpace);

        // 4. Sync to server in background (non-blocking)
        const folderRequest: CreateCustomSidebarFolderRequest = {
          folderId: folderId,
          folderName
        };
        spaceApi
          .createCustomSidebarFolder(activeSpace.id, folderRequest)
          .then((response) => {
            console.log('Successfully synced create folder to server');
          })
          .catch((error) => {
            console.warn('Failed to sync create folder to server:', error);
          });

        return true;
      } catch (error) {
        console.error('Failed to create folder:', error);
        toast.error(t('toast.error.sidebar_create_folder'));
        return false;
      }
    },
    [activeSpace, t, getSidebarForSpace, setSidebarsBySpace]
  );

  // Toggle folder collapsed state - OPTIMISTIC UPDATE
  const toggleFolderCollapsed = useCallback(
    async (folderId: string) => {
      if (!activeSpace) return false;

      try {
        // 1. Get current state from atom or load it
        const currentSidebar = await getSidebarForSpace(activeSpace.id);
        const folder = currentSidebar.items[folderId];

        if (!folder || folder.type !== 'folder') return false;

        // 2. Update atom and cache immediately (optimistic)
        const updatedSidebar: CustomSidebarState = {
          ...currentSidebar,
          items: {
            ...currentSidebar.items,
            [folderId]: {
              ...folder,
              isCollapsed: !folder.isCollapsed
            }
          }
        };

        await cacheCustomSidebar(activeSpace.id, updatedSidebar, setSidebarsBySpace);

        // 3. Sync to server in background (non-blocking)
        spaceApi
          .toggleCustomSidebarFolder(activeSpace.id, folderId)
          .then((response) => {
            console.log('Successfully synced toggle folder to server');
          })
          .catch((error) => {
            console.warn('Failed to sync toggle folder to server:', error);
          });

        return true;
      } catch (error) {
        console.error('Failed to toggle folder:', error);
        return false;
      }
    },
    [activeSpace, getSidebarForSpace, setSidebarsBySpace]
  );

  // Move item to folder - OPTIMISTIC UPDATE
  const moveItemToFolder = useCallback(
    async (
      itemId: string,
      folderId: string | null,
      preserveOrder: boolean = false,
      currentState?: CustomSidebarState
    ) => {
      if (!activeSpace) return false;

      try {
        // 1. Use provided state or get from atom
        const currentSidebar = currentState || (await getSidebarForSpace(activeSpace.id));
        const item = currentSidebar.items[itemId];

        if (!item) return false;

        // 2. Update atom and cache immediately (optimistic)
        // Update the item's parentId
        const updatedItem = {
          ...item,
          parentId: folderId || undefined
        };

        // Update folder children if moving to a folder
        const updatedItems = {
          ...currentSidebar.items,
          [itemId]: updatedItem
        };

        // Remove from old parent if it had one
        if (item.parentId) {
          const oldParent = updatedItems[item.parentId];
          if (oldParent && oldParent.children) {
            updatedItems[item.parentId] = {
              ...oldParent,
              children: oldParent.children.filter((id) => id !== itemId)
            };
          }
        }

        // Add to new parent if moving to a folder
        if (folderId) {
          const newParent = updatedItems[folderId];
          if (newParent && newParent.type === 'folder') {
            updatedItems[folderId] = {
              ...newParent,
              children: [...(newParent.children || []), itemId]
            };
          }
        }

        // Update order only if not preserving order (when order will be handled separately)
        let updatedOrder = currentSidebar.order;
        if (!preserveOrder) {
          // Remove from current position and add to end if moving to root
          updatedOrder = currentSidebar.order.filter((id) => id !== itemId);
          if (!folderId) {
            updatedOrder.push(itemId);
          }
        }

        const updatedSidebar: CustomSidebarState = {
          items: updatedItems,
          order: updatedOrder
        };

        await cacheCustomSidebar(activeSpace.id, updatedSidebar, setSidebarsBySpace);

        // 3. Sync to server in background (non-blocking)
        const moveRequest: MoveCustomSidebarItemRequest = {
          itemId,
          folderId: folderId || undefined
        };
        spaceApi
          .moveCustomSidebarItem(activeSpace.id, moveRequest)
          .then((response) => {
            console.log('Successfully synced move item to server');
          })
          .catch((error) => {
            console.warn('Failed to sync move item to server:', error);
          });

        return true;
      } catch (error) {
        console.error('Failed to move item to folder:', error);
        toast.error(t('toast.error.sidebar_move_item'));
        return false;
      }
    },
    [activeSpace, t, getSidebarForSpace, setSidebarsBySpace]
  );

  // Get available nav items - CACHE FIRST with fallback
  const getAvailableNavItemsFromServer = useCallback(async () => {
    return getAvailableNavItems(t);
  }, [t]);

  // Get current sidebar state for active space from atom
  const getCurrentSidebarState = useCallback(() => {
    if (!activeSpace) return null;
    return sidebarsBySpace[activeSpace.id] || null;
  }, [activeSpace, sidebarsBySpace]);

  return {
    getSidebarForSpace,
    updateSidebarForSpace,
    addNavItem,
    removeNavItem,
    reorderNavItems,
    createFolder,
    toggleFolderCollapsed,
    moveItemToFolder,
    getAvailableNavItems: getAvailableNavItemsFromServer,
    getCurrentSidebarState,
    // For debugging/inspection
    sidebarsBySpace,
    // For direct atom updates (used for optimistic updates during drag operations)
    setSidebarsBySpace
  };
}
