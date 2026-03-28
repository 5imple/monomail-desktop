import { useAuth } from '@/renderer/app/context/AuthContext';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import {
  CustomNavItem,
  CustomSidebarState,
  getCachedCustomSidebar,
  getDefaultNavItems,
  clearCustomSidebarCache
} from '@/renderer/app/store/space/useCustomSidebarAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Migration utility to convert from old sidebar to new customizable sidebar
export function useSidebarMigration() {
  const { t } = useTranslation();
  const { activeSpace } = useSpaceAtom();
  const { accounts } = useAuth();
  const { labelsMapByAccount } = useLabelAtom();

  // Migrate existing user preferences to new sidebar
  const migrateToCustomSidebar = useCallback(
    async (spaceId: string): Promise<CustomSidebarState> => {
      // Check if migration has already been done
      const existingSidebar = await getCachedCustomSidebar(spaceId);
      if (existingSidebar) {
        return existingSidebar;
      }

      // Start with default nav items (primary / secondary)
      const defaultItems = getDefaultNavItems(t);

      const items: Record<string, CustomNavItem> = {};
      const order: string[] = [];

      // 1. Add default nav items to root level first
      defaultItems.forEach((item, index) => {
        items[item.id] = {
          ...item,
          position: index
        };
        order.push(item.id);
      });

      // Utility lists / helpers
      const SYSTEM_LABELS = [
        'INBOX',
        'SENT',
        'DRAFT',
        'TRASH',
        'SPAM',
        'STARRED',
        'IMPORTANT',
        'CHAT',
        'CATEGORY_FORUMS',
        'CATEGORY_UPDATES',
        'CATEGORY_PERSONAL',
        'CATEGORY_PROMOTIONS',
        'CATEGORY_SOCIAL',
        'YELLOW_STAR',
        'UNREAD',
        'READ_CIRCLE'
      ];

      let currentPosition = defaultItems.length;

      // Helper to create a folder item (or return existing)
      const ensureFolder = (folderId: string, title: string, parentId?: string): CustomNavItem => {
        if (!items[folderId]) {
          items[folderId] = {
            id: folderId,
            type: 'folder',
            title,
            icon: 'Folder',
            children: [],
            isCollapsed: true,
            parentId,
            position: currentPosition++
          };

          // Add to parent children or root order
          if (parentId) {
            const parent = items[parentId];
            if (parent) {
              if (!parent.children) parent.children = [];
              parent.children.push(folderId);
            }
          } else {
            order.push(folderId);
          }
        }

        return items[folderId];
      };

      // 2. Build account folders and nested label structure

      // Retrieve current space (for account list)
      const space = await import('@/renderer/app/store/space/useSpaceAtom').then((module) => {
        const { getCachedSpaces } = module;
        return getCachedSpaces().then((spaces) => spaces.find((s) => s.id === spaceId));
      });

      if (space) {
        space.accountUids.forEach((accountId) => {
          const account = accounts.find((a) => a.uid === accountId);
          const accountTitle = account?.email || accountId;
          const accountFolderId = `account-${accountId}`;

          // Ensure account folder exists on root
          ensureFolder(accountFolderId, accountTitle);

          // Process labels for this account
          const accountLabels = labelsMapByAccount[accountId];
          if (!accountLabels) return;

          Object.values(accountLabels).forEach((label) => {
            // Skip default/system labels and unwanted labels
            if (
              SYSTEM_LABELS.includes(label.name.toUpperCase()) ||
              label.name.startsWith('[Superhuman]') ||
              label.name === 'Mono'
            ) {
              return;
            }

            // Split hierarchical labels (e.g., "Mono/Test/Sub")
            const parts = label.name.split('/');

            let parentId: string = accountFolderId;

            // Create nested folders for intermediate parts (if any)
            if (parts.length > 1) {
              for (let i = 0; i < parts.length - 1; i++) {
                const pathKey = parts.slice(0, i + 1).join('/');
                const folderId = `folder-${accountId}-${pathKey}`;
                const folderTitle = parts[i];
                const folderItem = ensureFolder(folderId, folderTitle, parentId);
                // Make sure the parent folder has this child reference (ensureFolder already adds, but double-check)
                if (!folderItem.parentId) {
                  folderItem.parentId = parentId;
                }
                const parentFolder = items[parentId] as CustomNavItem;
                if (
                  parentFolder &&
                  parentFolder.children &&
                  !parentFolder.children.includes(folderId)
                ) {
                  parentFolder.children.push(folderId);
                }

                parentId = folderId; // next level parent
              }
            }

            // Create label nav item under the final parentId
            const labelNavId = `label-${label.id}`;
            items[labelNavId] = {
              id: labelNavId,
              type: 'account-label',
              title: parts[parts.length - 1], // Use last part as display title
              icon: 'Tag',
              iconColor: label.color?.backgroundColor,
              query: `label:${label.name.toLowerCase()}`,
              accountId,
              labelId: label.id,
              parentId,
              position: currentPosition++
            };

            // Add to parent's children array
            const parentFolder = items[parentId] as CustomNavItem;
            if (parentFolder) {
              if (!parentFolder.children) parentFolder.children = [];
              parentFolder.children.push(labelNavId);
            }
          });
        });
      }

      const initialSidebar: CustomSidebarState = {
        items,
        order
      };

      return initialSidebar;
    },
    [t, labelsMapByAccount, accounts]
  );

  // Reset sidebar to defaults (useful for testing or user preference)
  const resetSidebarToDefaults = useCallback(
    async (spaceId: string): Promise<CustomSidebarState> => {
      // Clear existing cache
      await clearCustomSidebarCache(spaceId);

      // Recreate with defaults
      return migrateToCustomSidebar(spaceId);
    },
    [migrateToCustomSidebar]
  );

  // Check if migration is needed
  const isMigrationNeeded = useCallback(async (spaceId: string): Promise<boolean> => {
    const existingSidebar = await getCachedCustomSidebar(spaceId);
    return !existingSidebar;
  }, []);

  return {
    migrateToCustomSidebar,
    resetSidebarToDefaults,
    isMigrationNeeded
  };
}
