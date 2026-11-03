import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/SidebarIcon';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/renderer/app/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import NavItem from '@/renderer/app/containers/sidebar/NavItem';
import { useAuth } from '@/renderer/app/context/AuthContext';
import {
  useKeyboardRegistration,
  useIsKeyboardMode
} from '@/renderer/app/context/KeyboardNavigationContext';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import {
  CustomNavItem,
  CustomSidebarState,
  useCustomSidebarAtom,
  getDefaultNavItemProperties,
  isDefaultNavItem
} from '@/renderer/app/store/space/useCustomSidebarAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  DropAnimation,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  AnimateLayoutChanges,
  defaultAnimateLayoutChanges
} from '@dnd-kit/sortable';
import { Children, FC, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { DBGetThreadCountsByLabelSets, ValidLabel } from '@/renderer/app/lib/db/thread';
import { inboxUnreadCountAtom } from '@/renderer/app/store/thread/inboxUnreadAtom';
import { useSetAtom } from 'jotai';
import { restoreSidebarSubtree } from '@/renderer/app/lib/sidebarRestore';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { buildLabelQuery } from '@/renderer/app/lib/queryUtils';

// Special drop zone component
const SpecialDropZone: FC<{ id: string; isActive: boolean }> = ({ id, isActive }) => {
  const { setNodeRef } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      data-id={id}
      className={cn(
        // The same 2px line as the row drop lines, drawn without changing the
        // zone's height (it showed nothing before).
        'relative h-2 w-full',
        isActive &&
          'after:pointer-events-none after:absolute after:inset-x-0 after:top-1/2 after:z-50 after:h-[2px] after:-translate-y-1/2 after:rounded after:bg-primary after:content-[""]'
      )}
    />
  );
};

const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return defaultAnimateLayoutChanges({ ...args, wasDragging: true });
  }
  return true;
};

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5'
      }
    }
  })
};

// Children sit under the parent's title with a guide line (~22px a level,
// so two levels still fit the 220px sidebar); ml-2 alone made nested labels
// look like siblings of Inbox.
const CHILD_INDENT = 'ml-[1.1rem] mt-1 flex flex-col gap-1 border-l border-border/60 pl-1.5';

// 'text-muted-foreground' is the stored "no colour" sentinel for labels.
const labelSwatchColor = (color?: string) =>
  !color || color === 'text-muted-foreground' ? 'hsl(var(--muted-foreground))' : color;

// A label's colour as a 4px bar centred in an icon-sized slot, so label rows
// line up with icon rows (it was drawn three different ways). The hairline
// keeps white and black swatches visible.
const LabelSwatch: FC<{ color?: string; className?: string }> = ({ color, className }) => (
  <span
    aria-hidden
    className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center', className)}
  >
    <span
      className="h-3 w-1 rounded-full ring-1 ring-foreground/15"
      style={{ backgroundColor: labelSwatchColor(color) }}
    />
  </span>
);

interface SortableNavItemProps {
  item: CustomNavItem;
  isActive: boolean;
  onItemClick: (item: CustomNavItem) => void;
  onToggleFolder?: (folderId: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onEditFolder?: (folderId: string, newTitle: string) => void;
  onEditItem?: (itemId: string, newTitle: string) => void;
  onStartEditing?: (itemId: string) => void;
  onCancelEdit?: () => void;
  isEditing?: boolean;
  isOverlay?: boolean;
  isDragOver?: boolean;
  children?: React.ReactNode;
  depth?: number;
  onAccountClick?: (item: CustomNavItem, accountId: string) => void;
  onToggleItemExpanded?: (itemId: string) => void;
  isItemExpanded?: boolean;
  accounts?: Array<{ uid: string; email: string }>;
  hasMultipleAccounts?: boolean;
  isChildActive?: (accountId: string) => boolean;
  /** Opened for the moment by a drag hovering over it (not saved). */
  isSpringOpen?: boolean;
  append?: React.ReactNode;
}

const SortableNavItem: FC<SortableNavItemProps> = ({
  item,
  isActive,
  onItemClick,
  onToggleFolder,
  onDeleteItem,
  onEditFolder,
  onEditItem,
  onStartEditing,
  onCancelEdit,
  isEditing = false,
  isOverlay = false,
  isDragOver = false,
  children,
  depth = 0,
  onAccountClick,
  onToggleItemExpanded,
  isItemExpanded = false,
  accounts = [],
  hasMultipleAccounts = false,
  isChildActive,
  isSpringOpen = false,
  append
}) => {
  const { attributes, listeners, setNodeRef, transition, isDragging } = useSortable({
    id: item.id,
    animateLayoutChanges,
    disabled: isEditing // Disable dragging when in editing mode to prevent focus interference
  });
  const { t } = useTranslation();
  const isKeyboardMode = useIsKeyboardMode();
  // Combined ref function to handle both sortable and keyboard navigation
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
    },
    [setNodeRef]
  );

  // Allow transform animations for both overlay and regular items
  const style = {
    // transform: CSS.Transform.toString(transform)
    transition: transition
    // opacity: isDragging && !isOverlay ? 0.5 : 1
  };

  // Conditionally apply listeners - don't apply when editing or in keyboard mode to prevent focus issues
  const dragProps = isEditing || isKeyboardMode ? {} : { ...attributes, ...listeners };

  const handleToggleClick = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (item.type === 'folder' && onToggleFolder) {
        onToggleFolder(item.id);
      } else if ((item.type === 'primary' || item.type === 'secondary') && onToggleItemExpanded) {
        onToggleItemExpanded(item.id);
      }
    },
    [item.id, item.type, onToggleFolder, onToggleItemExpanded]
  );

  const handleClick = useCallback(
    (e?: React.MouseEvent) => {
      if (item.type === 'folder') {
        // A click toggles the folder; the second click of a double-click
        // (rename) mustn't toggle it straight back.
        if (e && e.detail > 1) return;
        handleToggleClick(e);
        return;
      } else {
        onItemClick(item);
      }
    },
    // With [item] alone a folder kept a stale toggle handler that wrote an
    // old sidebar snapshot back, undoing recent edits.
    [item, handleToggleClick, onItemClick]
  );

  // Handle keyboard activation (Enter/Space) - only trigger click, not drag
  const handleKeyboardActivation = useCallback(
    (e: React.KeyboardEvent) => {
      // Typing in the rename field: Space is a character, not "toggle".
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();

        // For folders, handle toggle
        if (item.type === 'folder') {
          handleToggleClick();
        } else {
          onItemClick(item);
        }
      }
    },
    [item, handleToggleClick, onItemClick]
  );

  // Handle mouse click - check if it's a drag operation or just a click
  const handleMouseClick = useCallback(
    (e?: React.MouseEvent) => {
      // Only handle click if we're not in the middle of a drag operation
      if (!isDragging) {
        handleClick(e);
      }
    },
    [handleClick, isDragging]
  );
  const handleDelete = useCallback(() => {
    if (onDeleteItem) {
      onDeleteItem(item.id);
    }
  }, [item.id, onDeleteItem]);

  const handleDoubleClick = useCallback(() => {
    // Only allow editing for folders, not primary/secondary nav items
    if (onStartEditing && item.type === 'folder') {
      onStartEditing(item.id);
    }
  }, [item.id, item.type, onStartEditing]);

  // Rename from the context menu. Radix hands focus back to the row as the
  // menu closes, which would pull it straight out of the new rename field.
  const renamePendingRef = useRef(false);
  const handleRenameSelect = useCallback(() => {
    renamePendingRef.current = true;
    setTimeout(() => onStartEditing?.(item.id), 0);
  }, [item.id, onStartEditing]);
  const handleMenuCloseAutoFocus = useCallback((event: Event) => {
    if (!renamePendingRef.current) return;
    renamePendingRef.current = false;
    event.preventDefault();
  }, []);

  const itemTitle = item.title.replace('Mono/', '');
  const toggleLabel = (open: boolean) =>
    open ? t('sidebar.collapse', { name: itemTitle }) : t('sidebar.expand', { name: itemTitle });
  // The in-list source of a drag fades so the moving copy reads as "lifted".
  const wrapperClassName = cn(isDragging && !isOverlay && 'opacity-40');

  // Handle unified inbox navigation for primary/secondary items with multiple accounts
  const shouldShowAccountExpansion =
    hasMultipleAccounts &&
    (item.type === 'primary' || item.type === 'secondary') &&
    !item.accountId;

  if (item.type === 'folder') {
    const folderOpen = !item.isCollapsed || isSpringOpen;
    const folderPrepend = (
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <Button
            className="relative mr-2"
            variant="ghost"
            typeVariant="inline"
            sizeVariant="sm"
            // The row toggles on click and Enter itself, so this isn't a
            // second Tab stop.
            tabIndex={-1}
            aria-label={toggleLabel(folderOpen)}
            onClick={handleToggleClick}
          >
            <MonoIcon
              type="Dropdown"
              className={cn(
                'transition-all duration-300',
                folderOpen ? '' : '-rotate-90',
                'absolute text-muted-foreground opacity-0 group-pointer-hover:opacity-100'
              )}
            />
            <MonoIcon
              type={folderOpen ? 'FolderOpen' : (item.icon as MonoIconType)}
              className="text-muted-foreground opacity-100 transition-all duration-300 group-pointer-hover:opacity-0"
            />
          </Button>
        </CollapsibleTrigger>
      </div>
    );
    const folderContent = (
      <CollapsibleContent>
        <div className={CHILD_INDENT}>
          {Children.count(children) > 0 ? (
            children
          ) : (
            // Nothing inside (e.g. an account folder with no labels yet):
            // say so instead of opening onto nothing.
            <div className="pointer-events-none select-none py-1.5 pl-3 text-xs text-muted-foreground">
              {t('sidebar.folder_empty')}
            </div>
          )}
        </div>
      </CollapsibleContent>
    );

    // When editing, don't wrap in ContextMenu to prevent interference. No
    // row keyboard/click handlers either: Space toggled the folder instead
    // of typing, and clicks in the field or on ✓ toggled it too.
    if (isEditing) {
      return (
        <div
          ref={combinedRef}
          style={style}
          data-id={item.id}
          data-keyboard-item={item.id}
          tabIndex={-1}
          className={wrapperClassName}
        >
          <Collapsible open={folderOpen}>
            <div className="flex w-full flex-col">
              <NavItem
                variant={'ghost'}
                id={item.id}
                title={itemTitle}
                isEditing={isEditing}
                onEdit={onEditFolder ? (newTitle) => onEditFolder(item.id, newTitle) : undefined}
                onCancelEdit={onCancelEdit}
                onDoubleClick={handleDoubleClick}
                append={append}
                prepend={folderPrepend}
              />
              {folderContent}
            </div>
          </Collapsible>
        </div>
      );
    }

    return (
      <div
        ref={combinedRef}
        style={style}
        {...dragProps}
        data-id={item.id}
        onKeyDown={handleKeyboardActivation}
        data-keyboard-item={item.id}
        // After the dnd-kit spread (it adds tabIndex 0): the NavItem inside
        // is the row's one Tab stop.
        tabIndex={-1}
        className={wrapperClassName}
      >
        <ContextMenu>
          <ContextMenuTrigger>
            <Collapsible open={folderOpen}>
              <div className="flex w-full flex-col">
                <NavItem
                  // Drop target: fill + inset ring, no border (a border moved
                  // the row 1px).
                  className={cn(
                    'group',
                    isDragOver && 'bg-muted ring-1 ring-inset ring-primary/30'
                  )}
                  variant={'ghost'}
                  id={item.id}
                  title={itemTitle}
                  isEditing={isEditing}
                  onEdit={onEditFolder ? (newTitle) => onEditFolder(item.id, newTitle) : undefined}
                  onCancelEdit={onCancelEdit}
                  onDoubleClick={handleDoubleClick}
                  prepend={folderPrepend}
                  append={append}
                  onClick={handleMouseClick}
                />
                {folderContent}
              </div>
            </Collapsible>
          </ContextMenuTrigger>
          <ContextMenuContent className="dark" onCloseAutoFocus={handleMenuCloseAutoFocus}>
            <ContextMenuItem onSelect={handleRenameSelect}>
              <MonoIcon type="Pen" className="mr-2 h-4 w-4" />
              {t('sidebar.rename')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <MonoIcon type="Trash" className="mr-2 h-4 w-4" />
              {t('sidebar.delete_folder')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }

  // Only rows that hide a row (not a folder): neutral, since no mail is touched.
  const removeMenu = (
    <ContextMenuContent className="dark">
      <ContextMenuItem onClick={handleDelete}>
        <MonoIcon type="EyeSlash" className="mr-2 h-4 w-4" />
        {t('sidebar.remove_from_sidebar')}
      </ContextMenuItem>
    </ContextMenuContent>
  );

  // Handle unified inbox navigation for primary/secondary items with multiple accounts
  if (shouldShowAccountExpansion) {
    // Collapsed with one account's view open: the parent row carries the
    // highlight (it vanished until you expanded the row).
    const parentActive =
      isActive || (!isItemExpanded && accounts.some((account) => isChildActive?.(account.uid)));
    const expandPrepend = (
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <Button
            className="relative mr-2"
            variant="ghost"
            typeVariant="inline"
            sizeVariant="sm"
            // Enter on the row navigates, so this stays focusable: it's the
            // keyboard way to expand.
            aria-label={toggleLabel(isItemExpanded)}
            onClick={handleToggleClick}
          >
            <MonoIcon
              type="Dropdown"
              className={cn(
                'transition-all duration-300',
                isItemExpanded ? '' : '-rotate-90',
                'absolute text-muted-foreground opacity-0 group-pointer-hover:opacity-100'
              )}
            />
            <MonoIcon
              type={item.icon as MonoIconType}
              className={cn(
                'text-muted-foreground opacity-100 transition-all duration-300 group-pointer-hover:opacity-0',
                parentActive && item.iconColor
              )}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
    );
    const accountRows = (
      <CollapsibleContent>
        <div className={CHILD_INDENT}>
          {accounts.map((account) => {
            const childActive = isChildActive ? isChildActive(account.uid) : false;
            return (
              <NavItem
                key={`${item.id}-${account.uid}`}
                // An id registers the row for arrow-key navigation.
                id={`${item.id}-${account.uid}`}
                variant={'ghost'}
                title={account.email}
                iconColor={item.iconColor}
                active={childActive}
                prepend={
                  <MonoIcon
                    type={item.icon as MonoIconType}
                    className={cn(
                      'mr-2 text-muted-foreground transition-all duration-300',
                      childActive && item.iconColor
                    )}
                  />
                }
                onClick={() => onAccountClick && onAccountClick(item, account.uid)}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    );

    // When editing, don't wrap in ContextMenu to prevent interference
    if (isEditing) {
      return (
        <div
          ref={combinedRef}
          style={style}
          data-id={item.id}
          onKeyDown={handleKeyboardActivation}
          data-keyboard-item={item.id}
          tabIndex={-1}
          className={wrapperClassName}
        >
          <Collapsible open={isItemExpanded}>
            <div className="flex w-full flex-col">
              <NavItem
                className="group"
                variant={'ghost'}
                id={item.id}
                title={itemTitle}
                active={parentActive}
                isEditing={isEditing}
                iconColor={item.iconColor}
                hotkey={item.hotkey}
                onEdit={undefined}
                onCancelEdit={undefined}
                onDoubleClick={undefined}
                append={append}
                prepend={expandPrepend}
                onClick={() => !isDragging && onItemClick(item)}
              />
              {accountRows}
            </div>
          </Collapsible>
        </div>
      );
    }

    return (
      <div
        ref={combinedRef}
        style={style}
        {...dragProps}
        data-id={item.id}
        onKeyDown={handleKeyboardActivation}
        data-keyboard-item={item.id}
        tabIndex={-1}
        className={wrapperClassName}
      >
        <ContextMenu>
          <ContextMenuTrigger>
            <Collapsible open={isItemExpanded}>
              <div className="flex w-full flex-col">
                <NavItem
                  className="group"
                  variant={'ghost'}
                  id={item.id}
                  title={itemTitle}
                  active={parentActive}
                  isEditing={isEditing}
                  iconColor={item.iconColor}
                  hotkey={item.hotkey}
                  onEdit={undefined}
                  onCancelEdit={undefined}
                  onDoubleClick={undefined}
                  append={append}
                  prepend={expandPrepend}
                  onClick={() => !isDragging && onItemClick(item)}
                />
                {accountRows}
              </div>
            </Collapsible>
          </ContextMenuTrigger>
          {removeMenu}
        </ContextMenu>
      </div>
    );
  }

  // Regular nav item (non-folder, non-expandable)
  const regularPrepend =
    item.type === 'account-label' ? (
      <LabelSwatch color={item.iconColor} className="mr-2" />
    ) : (
      <MonoIcon
        type={item.icon as MonoIconType}
        className={cn(
          'mr-2 text-muted-foreground transition-all duration-300',
          isActive && item.iconColor
        )}
        style={
          item.iconColor && item.iconColor !== 'text-muted-foreground'
            ? { color: item.iconColor }
            : undefined
        }
      />
    );

  // When editing, don't wrap in ContextMenu to prevent interference
  if (isEditing) {
    return (
      <div
        ref={combinedRef}
        style={style}
        data-id={item.id}
        onKeyDown={handleKeyboardActivation}
        data-keyboard-item={item.id}
        tabIndex={-1}
        className={wrapperClassName}
      >
        <NavItem
          variant={'ghost'}
          id={item.id}
          title={itemTitle}
          active={isActive}
          isEditing={isEditing}
          iconColor={item.iconColor}
          hotkey={item.hotkey}
          onEdit={undefined}
          onCancelEdit={undefined}
          append={append}
          prepend={regularPrepend}
          onClick={() => !isDragging && onItemClick(item)}
          onDoubleClick={undefined}
        />
      </div>
    );
  }

  return (
    <div
      ref={combinedRef}
      style={style}
      {...dragProps}
      data-id={item.id}
      onKeyDown={handleKeyboardActivation}
      data-keyboard-item={item.id}
      tabIndex={-1}
      className={wrapperClassName}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <NavItem
            variant={'ghost'}
            id={item.id}
            title={itemTitle}
            active={isActive}
            isEditing={isEditing}
            iconColor={item.iconColor}
            hotkey={item.hotkey}
            onEdit={undefined}
            onCancelEdit={undefined}
            append={append}
            prepend={regularPrepend}
            onClick={() => !isDragging && onItemClick(item)}
            onDoubleClick={undefined}
          />
        </ContextMenuTrigger>
        {removeMenu}
      </ContextMenu>
    </div>
  );
};

interface CustomizableSidebarProps {}

const CustomizableSidebar: FC<CustomizableSidebarProps> = () => {
  const { accounts: authAccounts } = useAuth();
  const { activeSpace, setActiveAccountsInSpace } = useSpaceAtom();
  const { searchNewQuery, globalSearchQuery, activeLayout } = useGlobalAtom();
  const { labelsMapByAccount, defaultLabels } = useLabelAtom();
  const { registerAreaRef } = useKeyboardRegistration();
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    getSidebarForSpace,
    updateSidebarForSpace,
    addNavItem,
    removeNavItem,
    reorderNavItems,
    createFolder,
    toggleFolderCollapsed,
    moveItemToFolder,
    getAvailableNavItems,
    getCurrentSidebarState,
    sidebarsBySpace,
    setSidebarsBySpace
  } = useCustomSidebarAtom();

  // Remove local state - use atom instead
  const sidebarState = getCurrentSidebarState();
  const [activeItem, setActiveItem] = useState<CustomNavItem | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [dropLinePosition, setDropLinePosition] = useState<{
    itemId: string;
    position: 'above' | 'below';
    isInFolder?: boolean;
  } | null>(null);
  // A ref, not state: it's only read inside handleDragOver, and a state
  // update per document mousemove re-rendered the whole sidebar constantly.
  const currentMouseYRef = useRef<number>(0);
  const [specialDropZone, setSpecialDropZone] = useState<'top' | 'bottom' | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  // Folders opened for the moment by a drag hovering over them. Kept out of
  // the stored sidebar: passing over a folder used to expand (and save) it
  // at once, shoving everything below it down mid-drag.
  const [springOpenFolders, setSpringOpenFolders] = useState<Set<string>>(() => new Set());
  const springTimerRef = useRef<number | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const clearSpringTimer = useCallback(() => {
    if (springTimerRef.current !== null) {
      window.clearTimeout(springTimerRef.current);
      springTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearSpringTimer, [clearSpringTimer]);
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});
  const setInboxUnreadCount = useSetAtom(inboxUnreadCountAtom);
  const { threadsMap } = useThreadAtom();
  const { getDraftsForAccount } = useDraftAtom();
  const { t } = useTranslation();

  // Get accounts for the active space
  const spaceAccounts = useMemo(() => {
    if (!activeSpace) return [];
    return authAccounts.filter((account) => activeSpace.accountUids.includes(account.uid));
  }, [authAccounts, activeSpace]);

  const hasMultipleAccounts = spaceAccounts.length > 1;

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10
      }
    }),
    useSensor(KeyboardSensor)
  );

  // Load sidebar state when active space changes
  useEffect(() => {
    if (activeSpace) {
      // Load sidebar state - the atom will be updated automatically by getSidebarForSpace
      getSidebarForSpace(activeSpace.id);
    }
  }, [activeSpace, getSidebarForSpace]);

  // Clear editing state when active space changes
  useEffect(() => {
    setEditingItemId(null);
  }, [activeSpace?.id]);

  // Register container ref with navigation system
  useEffect(() => {
    if (containerRef.current) {
      registerAreaRef('sidebar-nav', containerRef.current);
    }
  }, [registerAreaRef]);

  // Track mouse position for accurate drop line positioning
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      currentMouseYRef.current = e.clientY;
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Helper function to check if targetFolderId is a descendant of sourceFolderId
  const isFolderDescendant = useCallback(
    (sourceFolderId: string, targetFolderId: string): boolean => {
      if (!sidebarState || sourceFolderId === targetFolderId) return true;

      const checkDescendant = (folderId: string): boolean => {
        const folder = sidebarState.items[folderId];
        if (!folder || folder.type !== 'folder') return false;

        // Check direct children
        if (folder.children?.includes(targetFolderId)) return true;

        // Check descendants recursively
        return (
          folder.children?.some((childId) => {
            const child = sidebarState.items[childId];
            if (child?.type === 'folder') {
              return checkDescendant(childId);
            }
            return false;
          }) || false
        );
      };

      return checkDescendant(sourceFolderId);
    },
    [sidebarState]
  );

  // Generate organized account labels for "More" dropdown
  const organizedAccountLabels = useMemo(() => {
    if (!activeSpace || !sidebarState) return [];

    // Group labels by account - show ALL labels with proper check state
    const labelsByAccount: Array<{
      accountId: string;
      accountEmail: string;
      labels: CustomNavItem[];
    }> = [];

    activeSpace.accountUids.forEach((accountId) => {
      const accountLabels = labelsMapByAccount[accountId];
      const account = authAccounts.find((acc) => acc.uid === accountId);

      if (accountLabels && account) {
        const labels: CustomNavItem[] = [];

        Object.values(accountLabels).forEach((label) => {
          // Skip default system labels using the defaultLabels array
          if (
            defaultLabels.includes(label.name) ||
            defaultLabels.includes(label.name.toUpperCase())
          ) {
            return;
          }

          // Skip Superhuman and Mono labels
          if (label.name.startsWith('[Superhuman]') || label.name === 'Mono') {
            return;
          }

          const labelId = `label-${label.id}`;
          // Include ALL labels (not just ones not in sidebar)
          labels.push({
            id: labelId,
            type: 'account-label',
            title: label.name,
            icon: 'Tag',
            iconColor: label.color?.backgroundColor || 'text-muted-foreground',
            query: buildLabelQuery(label.name),
            accountId,
            labelId: label.id,
            position: labels.length
          });
        });

        if (labels.length > 0) {
          labelsByAccount.push({
            accountId,
            accountEmail: account.email || accountId,
            labels
          });
        }
      }
    });

    return labelsByAccount;
  }, [activeSpace, labelsMapByAccount, sidebarState, authAccounts, defaultLabels]);

  // Get all available items (show all items, not just ones not in sidebar)
  const [allAvailableItems, setAllAvailableItems] = useState<CustomNavItem[]>([]);

  useEffect(() => {
    const loadAvailableItems = async () => {
      try {
        const items = await getAvailableNavItems();
        setAllAvailableItems(items);
      } catch (error) {
        console.warn('Failed to load available items:', error);
        setAllAvailableItems([]);
      }
    };

    loadAvailableItems();
  }, [getAvailableNavItems]);

  // Social / Promotions / Updates / Forums are Gmail categories; Microsoft
  // accounts have none, so they're only offered with a Gmail account in the
  // space — or when already in the sidebar, so they can still be unticked.
  const showGmailCategories = spaceAccounts.some((account) => account.provider !== 'microsoft');
  const menuItems = useMemo(
    () =>
      allAvailableItems.filter(
        (item) =>
          showGmailCategories ||
          !(item.type === 'secondary' && item.query?.startsWith('category:')) ||
          sidebarState?.items[item.id] !== undefined
      ),
    [allAvailableItems, showGmailCategories, sidebarState]
  );
  const folderRenamePendingRef = useRef(false);

  // Toggle account expansion in the dropdown

  // Handle navigation click for unified inbox (all accounts)
  const handleNavClick = useCallback(
    (item: CustomNavItem) => {
      if (!item.query || !activeSpace) return;

      // Set all accounts in space as active for non-account-specific items
      if (!item.accountId) {
        setActiveAccountsInSpace(activeSpace.accountUids);
      } else {
        // Set only the specific account as active
        setActiveAccountsInSpace([item.accountId]);
      }

      searchNewQuery(item.query, undefined, false);
    },
    [activeSpace, setActiveAccountsInSpace, searchNewQuery]
  );

  // Handle navigation click for specific account
  const handleAccountNavClick = useCallback(
    (item: CustomNavItem, accountId: string) => {
      if (!item.query || !activeSpace) return;

      // Activate only this single account
      setActiveAccountsInSpace([accountId]);
      searchNewQuery(item.query, undefined, false);
    },
    [activeSpace, setActiveAccountsInSpace, searchNewQuery]
  );

  // Toggle item expansion for unified inbox navigation
  const handleToggleItemExpanded = useCallback((itemId: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  }, []);

  // Check if nav item is active (parent - all accounts)
  const isNavItemActive = useCallback(
    (item: CustomNavItem) => {
      if (!item.query || !activeSpace) return false;

      const isQueryMatch = globalSearchQuery === item.query && activeLayout === 'MAIL';

      if (item.accountId) {
        // For account-specific items, check if only that account is active
        return (
          isQueryMatch &&
          activeSpace.activeAccountUids.length === 1 &&
          activeSpace.activeAccountUids[0] === item.accountId
        );
      } else {
        // For general items, check if all accounts are active
        return (
          isQueryMatch &&
          activeSpace.activeAccountUids.length === activeSpace.accountUids.length &&
          activeSpace.accountUids.every((id) => activeSpace.activeAccountUids.includes(id))
        );
      }
    },
    [globalSearchQuery, activeLayout, activeSpace]
  );

  // Check if child nav item is active (specific account)
  const isChildNavItemActive = useCallback(
    (item: CustomNavItem, accountId: string) => {
      if (!item.query || !activeSpace) return false;

      return (
        globalSearchQuery === item.query &&
        activeLayout === 'MAIL' &&
        activeSpace.activeAccountUids.length === 1 &&
        activeSpace.activeAccountUids[0] === accountId
      );
    },
    [globalSearchQuery, activeLayout, activeSpace]
  );

  // Handle folder toggle
  const handleToggleFolder = useCallback(
    async (folderId: string) => {
      if (!activeSpace) return;

      await toggleFolderCollapsed(folderId);
      // No need to refresh sidebar state - atom is updated automatically
    },
    [activeSpace, toggleFolderCollapsed]
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      if (sidebarState) {
        setActiveItem(sidebarState.items[active.id] || null);
      }
    },
    [sidebarState]
  );

  // Handle drag over (for folder highlighting and drop lines)
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over, active } = event;
      const overId = (over?.id as string | undefined) ?? null;
      if (dragOverIdRef.current !== overId) {
        dragOverIdRef.current = overId;
        clearSpringTimer();
      }
      if (!over || !sidebarState || !active) {
        setDragOverFolder(null);
        setDropLinePosition(null);
        setSpecialDropZone(null);
        return;
      }

      // Handle special drop zones
      if (over.id === 'special-drop-top' || over.id === 'special-drop-bottom') {
        setDragOverFolder(null);
        setDropLinePosition(null);
        setSpecialDropZone(over.id === 'special-drop-top' ? 'top' : 'bottom');
        return;
      }

      const overItem = sidebarState.items[over.id];
      const activeItem = sidebarState.items[active.id];

      if (!overItem || !activeItem) {
        setDragOverFolder(null);
        setDropLinePosition(null);
        setSpecialDropZone(null);
        return;
      }

      // Clear special drop zone when over regular items
      setSpecialDropZone(null);

      // If dropping on a folder (but not itself or its descendants)
      if (overItem.type === 'folder' && overItem.id !== activeItem.id) {
        // Prevent dropping a folder into itself or its descendants
        if (activeItem.type === 'folder' && isFolderDescendant(activeItem.id, overItem.id)) {
          setDragOverFolder(null);
          setDropLinePosition(null);
          return;
        }

        setDragOverFolder(over.id as string);
        setDropLinePosition(null);

        // Spring open after a short hover, like Finder: just passing over a
        // folder no longer opens it.
        const folderId = over.id as string;
        if (
          overItem.isCollapsed &&
          !springOpenFolders.has(folderId) &&
          springTimerRef.current === null
        ) {
          springTimerRef.current = window.setTimeout(() => {
            springTimerRef.current = null;
            if (dragOverIdRef.current !== folderId) return;
            setSpringOpenFolders((prev) => new Set(prev).add(folderId));
          }, 600);
        }
      } else {
        setDragOverFolder(null);
        // Drop line calculation moved to handleDragMove for real-time updates
      }
    },
    [sidebarState, isFolderDescendant, clearSpringTimer, springOpenFolders]
  );

  // Handle drag move (for real-time drop line positioning)
  const handleDragMove = useCallback(
    (event: any) => {
      const { over, active } = event;
      if (!over || !sidebarState || !active) {
        setDropLinePosition(null);
        return;
      }

      // Don't show drop lines for special drop zones
      if (over.id === 'special-drop-top' || over.id === 'special-drop-bottom') {
        setDropLinePosition(null);
        return;
      }

      const overItem = sidebarState.items[over.id];
      const activeItem = sidebarState.items[active.id];

      if (!overItem || !activeItem) {
        setDropLinePosition(null);
        return;
      }

      // Only show drop lines for non-folder items or when not dropping into folder
      if (overItem.type !== 'folder' || overItem.id === activeItem.id) {
        // Get the DOM element for the over item to calculate real-time position
        const overElement = document.querySelector(`[data-id="${over.id}"]`);
        if (overElement) {
          const rect = overElement.getBoundingClientRect();
          const isInFolder = !!overItem.parentId;

          // Calculate position based on current mouse position relative to the item
          const { top, height } = rect;
          const itemCenterY = top + height / 2;

          // Show above if mouse is in upper half, below if in lower half
          const position = currentMouseYRef.current < itemCenterY ? 'above' : 'below';

          // Same line as before → keep the state object (no re-render on
          // every mouse move).
          setDropLinePosition((prev) =>
            prev &&
            prev.itemId === over.id &&
            prev.position === position &&
            prev.isInFolder === isInFolder
              ? prev
              : { itemId: over.id, position, isInFolder }
          );
        } else {
          setDropLinePosition(null);
        }
      } else {
        setDropLinePosition(null);
      }
    },
    [sidebarState]
  );

  // Handle drag cancel (when ESC is pressed)
  const handleDragCancel = useCallback(() => {
    clearSpringTimer();
    dragOverIdRef.current = null;
    setSpringOpenFolders(new Set());
    setActiveItem(null);
    setDragOverFolder(null);
    setDropLinePosition(null);
    setSpecialDropZone(null);
  }, [clearSpringTimer]);

  // Handle drag end
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      // Capture drop line position and special zone before clearing
      const currentDropPosition = dropLinePosition;
      const currentSpecialZone = specialDropZone;
      const sprungOpen = springOpenFolders;
      clearSpringTimer();
      dragOverIdRef.current = null;
      setSpringOpenFolders(new Set());
      // A folder that sprang open and got the drop stays open (saved with the
      // drop itself); any other just closes again.
      const keepOpen = (items: Record<string, CustomNavItem>, folderId?: string) => {
        if (folderId && sprungOpen.has(folderId) && items[folderId]?.type === 'folder') {
          items[folderId] = { ...items[folderId], isCollapsed: false };
        }
      };

      // Helper function to clear all drag state
      const clearDragState = () => {
        setActiveItem(null);
        setDragOverFolder(null);
        setDropLinePosition(null);
        setSpecialDropZone(null);
      };

      if (!over || !sidebarState || !activeSpace) {
        clearDragState();
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      if (activeId === overId) {
        clearDragState();
        return;
      }

      // Handle special drop zones (top/bottom)
      if (
        currentSpecialZone &&
        (overId === 'special-drop-top' || overId === 'special-drop-bottom')
      ) {
        const activeItem = sidebarState.items[activeId];
        if (!activeItem) {
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);
          return;
        }

        // Only allow moving items with parents (items inside folders) to root level
        if (activeItem.parentId) {
          const updatedItems = { ...sidebarState.items };

          // Remove from old parent
          if (updatedItems[activeItem.parentId]) {
            updatedItems[activeItem.parentId] = {
              ...updatedItems[activeItem.parentId],
              children:
                updatedItems[activeItem.parentId].children?.filter((id) => id !== activeId) || []
            };
          }

          // Update item to have no parent
          updatedItems[activeId] = {
            ...activeItem,
            parentId: undefined
          };

          // Add to root order at the beginning or end
          let newRootOrder = sidebarState.order.filter((id) => id !== activeId);
          if (currentSpecialZone === 'top') {
            newRootOrder = [activeId, ...newRootOrder];
          } else {
            newRootOrder = [...newRootOrder, activeId];
          }

          const updatedSidebar: CustomSidebarState = {
            items: updatedItems,
            order: newRootOrder
          };

          // Update atom immediately for smooth drag overlay animation
          setSidebarsBySpace((prev) => ({
            ...prev,
            [activeSpace.id]: updatedSidebar
          }));

          // Clear drag state after atom update
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);

          // Background async operations
          Promise.all([
            moveItemToFolder(activeId, null, true, updatedSidebar),
            reorderNavItems(newRootOrder, updatedSidebar)
          ]).catch(() => {
            console.error('Failed to persist drag operation');
          });
        } else {
          // A root row dropped on a zone moves to the very start / end.
          const rest = sidebarState.order.filter((id) => id !== activeId);
          const newRootOrder =
            currentSpecialZone === 'top' ? [activeId, ...rest] : [...rest, activeId];
          if (newRootOrder.join('\u0000') !== sidebarState.order.join('\u0000')) {
            const updatedSidebar: CustomSidebarState = { ...sidebarState, order: newRootOrder };
            setSidebarsBySpace((prev) => ({
              ...prev,
              [activeSpace.id]: updatedSidebar
            }));
            reorderNavItems(newRootOrder, updatedSidebar).catch(() => {
              console.error('Failed to persist reorder operation');
            });
          }
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);
        }
        return;
      }

      const overItem = sidebarState.items[overId];
      const activeItem = sidebarState.items[activeId];

      if (!activeItem || !overItem) {
        setActiveItem(null);
        setDragOverFolder(null);
        setDropLinePosition(null);
        setSpecialDropZone(null);
        return;
      }

      // Check if we're dropping onto a folder
      if (overItem.type === 'folder' && overItem.id !== activeItem.id) {
        // Prevent dropping a folder into itself or its descendants
        if (activeItem.type === 'folder' && isFolderDescendant(activeItem.id, overId)) {
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);
          return; // Invalid operation, abort
        }

        // Calculate updated state for immediate atom update
        const updatedItems = { ...sidebarState.items };

        // Remove from old parent if it had one
        if (activeItem.parentId) {
          const oldParent = updatedItems[activeItem.parentId];
          if (oldParent && oldParent.children) {
            updatedItems[activeItem.parentId] = {
              ...oldParent,
              children: oldParent.children.filter((id) => id !== activeId)
            };
          }
        }

        // Update item to have new parent
        updatedItems[activeId] = {
          ...activeItem,
          parentId: overId
        };

        // Add to new parent's children
        const newParent = updatedItems[overId];
        if (newParent && newParent.type === 'folder') {
          updatedItems[overId] = {
            ...newParent,
            children: [...(newParent.children || []), activeId]
          };
        }
        keepOpen(updatedItems, overId);

        // Remove from root order if moving from root to folder
        let updatedOrder = sidebarState.order;
        if (!activeItem.parentId) {
          updatedOrder = sidebarState.order.filter((id) => id !== activeId);
        }

        const updatedSidebar: CustomSidebarState = {
          items: updatedItems,
          order: updatedOrder
        };

        // Update atom immediately for smooth drag overlay animation
        setSidebarsBySpace((prev) => ({
          ...prev,
          [activeSpace.id]: updatedSidebar
        }));

        // Clear drag state after atom update
        setActiveItem(null);
        setDragOverFolder(null);
        setDropLinePosition(null);
        setSpecialDropZone(null);

        // Background async operation
        if (sprungOpen.has(overId)) {
          // moveItemToFolder would rebuild from the pre-drop snapshot and lose
          // the "stays open"; save exactly what's on screen.
          updateSidebarForSpace(activeSpace.id, updatedSidebar).catch(() => {
            console.error('Failed to persist move to folder operation');
          });
        } else {
          moveItemToFolder(activeId, overId, false).catch(() => {
            console.error('Failed to persist move to folder operation');
          });
        }
        return;
      }

      // Handle moving items out of folders or reordering
      const activeParentId = activeItem.parentId;
      const overParentId = overItem.parentId;

      // If active item is in a folder but we're dropping at root level
      if (activeParentId && !overParentId) {
        const currentRootItems = sidebarState.order;
        const overIndex = currentRootItems.indexOf(overId);

        if (overIndex !== -1) {
          // Calculate new position
          let insertIndex = overIndex;
          if (currentDropPosition?.position === 'below') {
            insertIndex = overIndex + 1;
          }

          // Remove from current parent and add to root order
          const updatedItems = { ...sidebarState.items };

          // Remove from old parent
          if (activeParentId && updatedItems[activeParentId]) {
            updatedItems[activeParentId] = {
              ...updatedItems[activeParentId],
              children: updatedItems[activeParentId].children?.filter((id) => id !== activeId) || []
            };
          }

          // Update item to have no parent
          updatedItems[activeId] = {
            ...updatedItems[activeId],
            parentId: undefined
          };

          // Update root order
          const newRootOrder = currentRootItems.filter((id) => id !== activeId);
          newRootOrder.splice(insertIndex, 0, activeId);

          const updatedSidebar: CustomSidebarState = {
            items: updatedItems,
            order: newRootOrder
          };

          // Update atom immediately for smooth drag overlay animation
          setSidebarsBySpace((prev) => ({
            ...prev,
            [activeSpace.id]: updatedSidebar
          }));

          // Clear drag state after atom update
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);

          // Background async operations
          Promise.all([
            moveItemToFolder(activeId, null, true, updatedSidebar),
            reorderNavItems(newRootOrder, updatedSidebar)
          ]).catch(() => {
            console.error('Failed to persist drag operation');
          });
        } else {
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);
        }
        return;
      }

      // If both items are in the same context (both root or both in same folder)
      if (activeParentId === overParentId) {
        if (activeParentId) {
          // Both items are in the same folder - reorder within folder
          const parentFolder = sidebarState.items[activeParentId];
          if (parentFolder && parentFolder.children) {
            const currentOrder = [...parentFolder.children];
            const activeIndex = currentOrder.indexOf(activeId);
            const overIndex = currentOrder.indexOf(overId);

            if (activeIndex !== -1 && overIndex !== -1) {
              // Remove the active item and insert at correct position based on drop line
              const newOrder = currentOrder.filter((id) => id !== activeId);

              // Determine insertion index based on drop line position
              let insertIndex = overIndex;
              if (activeIndex < overIndex) {
                // If moving down, adjust for the removed item
                insertIndex = overIndex - 1;
              }

              if (currentDropPosition?.position === 'below') {
                insertIndex = insertIndex + 1;
              }
              // For 'above', we insert at insertIndex (before the target)

              newOrder.splice(insertIndex, 0, activeId);

              // Update folder's children order
              const updatedSidebar: CustomSidebarState = {
                ...sidebarState,
                items: {
                  ...sidebarState.items,
                  [activeParentId]: {
                    ...parentFolder,
                    children: newOrder
                  }
                }
              };

              // Update atom immediately for smooth drag overlay animation
              setSidebarsBySpace((prev) => ({
                ...prev,
                [activeSpace.id]: updatedSidebar
              }));

              // Clear drag state after atom update
              setActiveItem(null);
              setDragOverFolder(null);
              setDropLinePosition(null);
              setSpecialDropZone(null);

              // Background async operation
              updateSidebarForSpace(activeSpace.id, updatedSidebar).catch(() => {
                console.error('Failed to persist reorder operation');
              });
            } else {
              setActiveItem(null);
              setDragOverFolder(null);
              setDropLinePosition(null);
              setSpecialDropZone(null);
            }
          } else {
            setActiveItem(null);
            setDragOverFolder(null);
            setDropLinePosition(null);
            setSpecialDropZone(null);
          }
        } else {
          // Both items are at root level - reorder root items
          const rootItems = sidebarState.order;
          const oldIndex = rootItems.indexOf(activeId);
          const newIndex = rootItems.indexOf(overId);

          if (oldIndex !== -1 && newIndex !== -1) {
            // Remove the active item and insert at correct position based on drop line
            const newOrder = rootItems.filter((id) => id !== activeId);

            // Determine insertion index based on drop line position
            let insertIndex = newIndex;
            if (oldIndex < newIndex) {
              // If moving down, adjust for the removed item
              insertIndex = newIndex - 1;
            }

            if (currentDropPosition?.position === 'below') {
              insertIndex = insertIndex + 1;
            }
            // For 'above', we insert at insertIndex (before the target)

            newOrder.splice(insertIndex, 0, activeId);

            const updatedSidebar: CustomSidebarState = {
              ...sidebarState,
              order: newOrder
            };

            // Update atom immediately for smooth drag overlay animation
            setSidebarsBySpace((prev) => ({
              ...prev,
              [activeSpace.id]: updatedSidebar
            }));

            // Clear drag state after atom update
            setActiveItem(null);
            setDragOverFolder(null);
            setDropLinePosition(null);
            setSpecialDropZone(null);

            // Background async operation
            reorderNavItems(newOrder).catch(() => {
              console.error('Failed to persist reorder operation');
            });
          } else {
            setActiveItem(null);
            setDragOverFolder(null);
            setDropLinePosition(null);
            setSpecialDropZone(null);
          }
        }
      } else {
        // Items are in different contexts - move active item to over item's context
        if (overParentId) {
          // Prevent dropping a folder into its descendants
          if (activeItem.type === 'folder' && isFolderDescendant(activeId, overParentId)) {
            setActiveItem(null);
            setDragOverFolder(null);
            setDropLinePosition(null);
            setSpecialDropZone(null);
            return; // Invalid operation, abort
          }

          // Calculate updated state for immediate atom update
          const updatedItems = { ...sidebarState.items };

          // Remove from old parent if it had one
          if (activeItem.parentId) {
            const oldParent = updatedItems[activeItem.parentId];
            if (oldParent && oldParent.children) {
              updatedItems[activeItem.parentId] = {
                ...oldParent,
                children: oldParent.children.filter((id) => id !== activeId)
              };
            }
          }

          // Update item to have new parent
          updatedItems[activeId] = {
            ...activeItem,
            parentId: overParentId
          };

          // Add to new parent's children at the correct position based on drop line
          const newParent = updatedItems[overParentId];
          if (newParent && newParent.type === 'folder') {
            const currentChildren = [...(newParent.children || [])];

            // Calculate insertion index based on drop line position
            const overIndex = currentChildren.indexOf(overId);
            let insertIndex = overIndex;

            if (currentDropPosition?.position === 'below') {
              insertIndex = overIndex + 1;
            }
            // For 'above', we insert at overIndex (before the target)

            // Insert at the calculated position
            currentChildren.splice(insertIndex, 0, activeId);

            updatedItems[overParentId] = {
              ...newParent,
              children: currentChildren
            };
          }
          keepOpen(updatedItems, overParentId);

          // Remove from root order if moving from root to folder
          let updatedOrder = sidebarState.order;
          if (!activeItem.parentId) {
            updatedOrder = sidebarState.order.filter((id) => id !== activeId);
          }

          const updatedSidebar: CustomSidebarState = {
            items: updatedItems,
            order: updatedOrder
          };

          // Update atom immediately for smooth drag overlay animation
          setSidebarsBySpace((prev) => ({
            ...prev,
            [activeSpace.id]: updatedSidebar
          }));

          // Clear drag state after atom update
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);

          // Background async operation
          updateSidebarForSpace(activeSpace.id, updatedSidebar).catch(() => {
            console.error('Failed to persist move operation');
          });
        } else {
          // Calculate updated state for immediate atom update
          const updatedItems = { ...sidebarState.items };

          // Remove from old parent if it had one
          if (activeItem.parentId) {
            const oldParent = updatedItems[activeItem.parentId];
            if (oldParent && oldParent.children) {
              updatedItems[activeItem.parentId] = {
                ...oldParent,
                children: oldParent.children.filter((id) => id !== activeId)
              };
            }
          }

          // Update item to have no parent
          updatedItems[activeId] = {
            ...activeItem,
            parentId: undefined
          };

          // Add to root order
          const updatedOrder = [...sidebarState.order];
          if (activeItem.parentId) {
            updatedOrder.push(activeId);
          }

          const updatedSidebar: CustomSidebarState = {
            items: updatedItems,
            order: updatedOrder
          };

          // Update atom immediately for smooth drag overlay animation
          setSidebarsBySpace((prev) => ({
            ...prev,
            [activeSpace.id]: updatedSidebar
          }));

          // Clear drag state after atom update
          setActiveItem(null);
          setDragOverFolder(null);
          setDropLinePosition(null);
          setSpecialDropZone(null);

          // Background async operation
          moveItemToFolder(activeId, null, true).catch(() => {
            console.error('Failed to persist move operation');
          });
        }
      }

      // Clear drag state if we reach here without returning
      clearDragState();
    },
    [
      sidebarState,
      activeSpace,
      reorderNavItems,
      moveItemToFolder,
      updateSidebarForSpace,
      dropLinePosition,
      specialDropZone,
      isFolderDescendant,
      setSidebarsBySpace,
      springOpenFolders,
      clearSpringTimer
    ]
  );

  // Check if an item is already in the sidebar
  const isItemInSidebar = useCallback(
    (itemId: string) => {
      return sidebarState ? Object.keys(sidebarState.items).includes(itemId) : false;
    },
    [sidebarState]
  );

  // Handle adding/removing item (toggle behavior)
  const handleToggleItem = useCallback(
    async (item: CustomNavItem) => {
      if (isItemInSidebar(item.id)) {
        // Remove item - atom updated automatically
        await removeNavItem(item.id);
      } else {
        // Add item - atom updated automatically
        await addNavItem(item);
      }
    },
    [isItemInSidebar, removeNavItem, addNavItem]
  );

  // The latest sidebars, for an Undo that runs after other edits.
  const sidebarsRef = useRef(sidebarsBySpace);
  sidebarsRef.current = sidebarsBySpace;

  // Handle deleting item
  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      // Clear editing state if deleting the item being edited
      if (editingItemId === itemId) {
        setEditingItemId(null);
      }

      const before = sidebarState;
      const removedItem = before?.items[itemId];
      const spaceId = activeSpace?.id;

      // Atom updated automatically
      const removed = await removeNavItem(itemId);
      if (!removed || !before || !removedItem || !spaceId) return;

      // It used to vanish at once with no way back (a folder took everything
      // inside it along). Undo puts it back where it was, keeping any other
      // sidebar edits made since.
      const name = getNavItemWithDynamicProperties(removedItem).title.replace('Mono/', '');
      toast(
        removedItem.type === 'folder'
          ? t('sidebar.folder_deleted', { name })
          : t('sidebar.removed_from_sidebar', { name }),
        {
          action: {
            label: t('toast.undo'),
            onClick: () => {
              const current = sidebarsRef.current[spaceId];
              if (!current) return;
              void updateSidebarForSpace(spaceId, restoreSidebarSubtree(before, current, itemId));
            }
          }
        }
      );
    },
    [removeNavItem, editingItemId, sidebarState, activeSpace, updateSidebarForSpace, t]
  );

  // Handle updating folder name
  const handleUpdateFolderName = useCallback(
    async (folderId: string, newTitle: string) => {
      if (!activeSpace || !sidebarState) return;

      const folder = sidebarState.items[folderId];
      if (!folder || folder.type !== 'folder') return;

      // "  " or "Work " shouldn't become a folder name.
      const title = newTitle.trim();
      if (!title || title === folder.title) {
        setEditingItemId(null);
        return;
      }

      // The atom will be updated automatically
      const updatedSidebar = {
        ...sidebarState,
        items: {
          ...sidebarState.items,
          [folderId]: {
            ...folder,
            title
          }
        }
      };

      setEditingItemId(null);

      // Then persist the changes - atom updated automatically
      await updateSidebarForSpace(activeSpace.id, updatedSidebar);
    },
    [activeSpace, sidebarState, updateSidebarForSpace]
  );

  // Handle updating item name
  const handleUpdateItemName = useCallback(
    async (itemId: string, newTitle: string) => {
      if (!activeSpace || !sidebarState) return;

      const item = sidebarState.items[itemId];
      if (!item) return;

      // The atom will be updated automatically
      const updatedSidebar = {
        ...sidebarState,
        items: {
          ...sidebarState.items,
          [itemId]: {
            ...item,
            title: newTitle
          }
        }
      };

      setEditingItemId(null);

      // Then persist the changes - atom updated automatically
      await updateSidebarForSpace(activeSpace.id, updatedSidebar);
    },
    [activeSpace, sidebarState, updateSidebarForSpace]
  );

  // Handle starting edit mode (for double-click)
  const handleStartEditing = useCallback((itemId: string) => {
    setEditingItemId(itemId);
  }, []);

  // Handle canceling edit mode
  const handleCancelEditing = useCallback(() => {
    setEditingItemId(null);
  }, []);

  // Handle adding new item (legacy, kept for folder creation)

  // Handle creating new folder
  const handleCreateFolder = useCallback(async () => {
    if (!activeSpace) return;

    const defaultFolderName = t('sidebar.new_folder') || 'New Folder';
    // Atom updated automatically. Then straight into rename, so the folder
    // isn't left as "New Folder" with no visible way to name it.
    const folderId = await createFolder(defaultFolderName);
    if (folderId) setEditingItemId(folderId);
  }, [createFolder, activeSpace, t]);

  // Fetch unread counts for every sidebar item. One read of each account's
  // threads per pass (it was a full scan per item and account, one after
  // another), and only the newest pass may write the result.
  const countRunRef = useRef(0);
  const fetchLabelCounts = useCallback(async () => {
    if (!sidebarState || !activeSpace) return;
    const run = ++countRunRef.current;

    const counts: Record<string, number> = {};
    const labelSetsByAccount: Record<string, Record<string, (ValidLabel | string)[]>> = {};
    const countFor = (accountIds: string[], itemId: string, labels: (ValidLabel | string)[]) => {
      counts[itemId] = 0;
      accountIds.forEach((accountId) => {
        (labelSetsByAccount[accountId] ??= {})[itemId] = labels;
      });
    };

    for (const item of Object.values(sidebarState.items)) {
      if (item.type === 'folder') continue;

      if (item.type === 'account-label' && item.labelId) {
        // Specific Gmail label
        countFor(item.accountId ? [item.accountId] : activeSpace.accountUids, item.id, [
          item.labelId,
          'UNREAD'
        ]);
        continue;
      }

      switch (item.id) {
        case 'draft': {
          let total = 0;
          for (const accountId of activeSpace.accountUids) {
            total += Object.keys(getDraftsForAccount(accountId)).length;
          }
          counts[item.id] = total;
          break;
        }
        // No unread badge for Done/Sent. Done counted "all cached threads minus
        // unread inbox" (a 999+ for anyone), and Sent's SENT+UNREAD only counts
        // unread replies on threads you started — neither is a useful number.
        case 'done':
        case 'sent': {
          counts[item.id] = 0;
          break;
        }
        default: {
          // Map id -> label
          const label = item.id === 'all-mail' ? 'ALL' : item.id.toUpperCase();
          countFor(activeSpace.accountUids, item.id, [label as ValidLabel, 'UNREAD']);
        }
      }
    }

    const perAccount = await Promise.all(
      Object.entries(labelSetsByAccount).map(([accountId, labelSets]) =>
        DBGetThreadCountsByLabelSets(accountId, labelSets)
      )
    );
    if (run !== countRunRef.current) return;
    perAccount.forEach((accountCounts) => {
      Object.entries(accountCounts).forEach(([itemId, count]) => {
        counts[itemId] = (counts[itemId] ?? 0) + count;
      });
    });

    setLabelCounts(counts);
    setInboxUnreadCount(sidebarState?.items?.primary ? (counts.primary ?? 0) : null);
  }, [sidebarState, activeSpace, getDraftsForAccount, setInboxUnreadCount]);

  // Re-count when threads or the sidebar change. Each count reads every cached
  // thread, so a burst (triage: E, E, E…, bodies landing) is coalesced into
  // one count a second later, when the app is idle, not one per change.
  useEffect(() => {
    let idleId: number | undefined;
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => void fetchLabelCounts(), { timeout: 2000 });
      } else {
        void fetchLabelCounts();
      }
    }, 1000);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
    };
  }, [threadsMap, sidebarState, activeSpace, fetchLabelCounts]);

  // Render count badge. A closed folder sums what's inside it (drafts aside),
  // so unread mail in it isn't invisible.
  const renderCountBadge = useCallback(
    (item: CustomNavItem, folderClosed = false) => {
      let count = labelCounts[item.id] || 0;
      if (item.type === 'folder' && folderClosed && sidebarState) {
        const sum = (folder: CustomNavItem): number =>
          (folder.children ?? []).reduce((total, childId) => {
            const child = sidebarState.items[childId];
            if (!child || child.id === 'draft') return total;
            return total + (child.type === 'folder' ? sum(child) : labelCounts[child.id] || 0);
          }, 0);
        count = sum(item);
      }
      if (count === 0) return null;
      return (
        <div className="ml-auto flex items-center justify-center rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
          {count > 999 ? '999+' : count}
        </div>
      );
    },
    [labelCounts, sidebarState]
  );

  // Function to get dynamic properties for nav items
  const getNavItemWithDynamicProperties = useCallback(
    (item: CustomNavItem): CustomNavItem => {
      // For default nav items, use dynamic properties
      if (isDefaultNavItem(item.id)) {
        const dynamicProperties = getDefaultNavItemProperties(item.id, t);
        if (dynamicProperties) {
          return {
            ...item,
            ...dynamicProperties
          };
        }
      }

      // For custom items (folders, renamed items), use cached properties
      return item;
    },
    [t]
  );

  // Render nav item recursively
  const renderNavItem = useCallback(
    (item: CustomNavItem, depth: number = 0): React.ReactNode => {
      // Apply dynamic properties for default nav items
      const itemWithDynamicProperties = getNavItemWithDynamicProperties(item);

      const childItems =
        item.children?.map((childId) => sidebarState?.items[childId]).filter(Boolean) || [];

      return (
        <div key={item.id} className="relative">
          {/* Drop line indicator for items within folders */}
          {dropLinePosition?.itemId === item.id &&
            dropLinePosition?.position === 'above' &&
            dropLinePosition?.isInFolder && (
              <>
                <div className="pointer-events-none absolute -top-[4px] left-0 right-0 z-50 ml-2 h-[2px] rounded bg-primary" />
                <div className="pointer-events-none absolute -top-[6.5px] left-0 z-50 h-2 w-2 rounded-full bg-primary" />
              </>
            )}

          <SortableNavItem
            item={itemWithDynamicProperties}
            isActive={isNavItemActive(itemWithDynamicProperties)}
            isEditing={editingItemId === item.id}
            isDragOver={dragOverFolder === item.id}
            onItemClick={handleNavClick}
            onToggleFolder={handleToggleFolder}
            onDeleteItem={handleDeleteItem}
            onEditFolder={handleUpdateFolderName}
            onEditItem={handleUpdateItemName}
            onStartEditing={handleStartEditing}
            onCancelEdit={handleCancelEditing}
            depth={depth}
            onAccountClick={handleAccountNavClick}
            onToggleItemExpanded={handleToggleItemExpanded}
            isItemExpanded={expandedItems[item.id] || false}
            accounts={spaceAccounts}
            hasMultipleAccounts={hasMultipleAccounts}
            isChildActive={(accountId) =>
              isChildNavItemActive(itemWithDynamicProperties, accountId)
            }
            isSpringOpen={springOpenFolders.has(item.id)}
            append={renderCountBadge(
              item,
              item.type === 'folder' && !!item.isCollapsed && !springOpenFolders.has(item.id)
            )}
          >
            {childItems.map((childItem) => childItem && renderNavItem(childItem, depth + 1))}
          </SortableNavItem>

          {/* Drop line indicator for items within folders */}
          {dropLinePosition?.itemId === item.id &&
            dropLinePosition?.position === 'below' &&
            dropLinePosition?.isInFolder && (
              <>
                <div className="pointer-events-none absolute -bottom-[2.5px] left-0 right-0 z-50 ml-2 h-[2px] rounded bg-primary" />
                <div className="pointer-events-none absolute -bottom-[5px] left-0 z-50 h-2 w-2 rounded-full bg-primary" />
              </>
            )}
        </div>
      );
    },
    [
      sidebarState,
      isNavItemActive,
      handleNavClick,
      handleToggleFolder,
      handleDeleteItem,
      editingItemId,
      handleUpdateFolderName,
      handleUpdateItemName,
      handleStartEditing,
      handleCancelEditing,
      dragOverFolder,
      dropLinePosition,
      expandedItems,
      spaceAccounts,
      hasMultipleAccounts,
      handleAccountNavClick,
      handleToggleItemExpanded,
      isChildNavItemActive,
      renderCountBadge,
      getNavItemWithDynamicProperties,
      springOpenFolders
    ]
  );

  if (!sidebarState || !activeSpace) {
    return null;
  }

  // Get root level items (items without parentId)
  const rootItems = sidebarState.order
    .map((id) => sidebarState.items[id])
    .filter((item) => item && !item.parentId);

  // Get all items including nested ones for the sortable context
  const getAllSortableItems = (items: CustomNavItem[]): string[] => {
    const allIds: string[] = [];

    const addItemIds = (item: CustomNavItem) => {
      allIds.push(item.id);
      if (item.children) {
        item.children.forEach((childId) => {
          const childItem = sidebarState?.items[childId];
          if (childItem) {
            addItemIds(childItem);
          }
        });
      }
    };

    items.forEach(addItemIds);
    return allIds;
  };

  const allSortableItems = [
    ...getAllSortableItems(rootItems),
    'special-drop-top',
    'special-drop-bottom'
  ];

  return (
    <div ref={containerRef} className="flex flex-col gap-3 px-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={allSortableItems} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {/* Special drop zone at the top */}
            <SpecialDropZone id="special-drop-top" isActive={specialDropZone === 'top'} />
            {rootItems.map((item, index) => (
              <div key={item.id} className="relative">
                {/* Drop line indicator for root items */}
                {dropLinePosition?.itemId === item.id &&
                  dropLinePosition?.position === 'above' &&
                  !dropLinePosition?.isInFolder && (
                    <>
                      <div className="pointer-events-none absolute -top-[3.5px] left-0 right-0 z-50 h-[2px] rounded bg-primary" />
                      <div className="pointer-events-none absolute -top-[6px] left-0 z-50 h-2 w-2 rounded-full bg-primary" />
                    </>
                  )}
                {renderNavItem(item)}
                {/* Drop line indicator for root items */}
                {dropLinePosition?.itemId === item.id &&
                  dropLinePosition?.position === 'below' &&
                  !dropLinePosition?.isInFolder && (
                    <>
                      <div className="pointer-events-none absolute -bottom-[2px] left-0 right-0 z-50 h-[2px] rounded bg-primary" />
                      <div className="pointer-events-none absolute -bottom-[4.5px] left-0 z-50 h-2 w-2 rounded-full bg-primary" />
                    </>
                  )}
              </div>
            ))}

            {/* Special drop zone at the bottom (moves a row to the end) */}
            <SpecialDropZone id="special-drop-bottom" isActive={specialDropZone === 'bottom'} />

            {/* More button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="mt-2">
                  <NavItem
                    variant={'ghost'}
                    title={t('sidebar.more') || 'More'}
                    icon="MoreHorizontal"
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="dark h-96 w-64"
                align="start"
                // A new folder opens straight into rename; don't hand focus
                // back to "More" as the menu closes.
                onCloseAutoFocus={(event) => {
                  if (!folderRenamePendingRef.current) return;
                  folderRenamePendingRef.current = false;
                  event.preventDefault();
                }}
              >
                <ScrollArea className="h-full">
                  {/* Create folder option at the top */}
                  <DropdownMenuItem
                    onSelect={() => {
                      // The menu closes and the new folder opens in rename.
                      folderRenamePendingRef.current = true;
                      void handleCreateFolder();
                    }}
                  >
                    <MonoIcon type="Plus" className="mr-2" />
                    {t('sidebar.create_folder') || 'Create Folder'}
                  </DropdownMenuItem>

                  {/* Separator after create folder */}
                  {(menuItems.length > 0 || organizedAccountLabels.length > 0) && (
                    <DropdownMenuSeparator />
                  )}

                  {/* These add or remove sidebar rows; the label says so. */}
                  {(menuItems.length > 0 || organizedAccountLabels.length > 0) && (
                    <DropdownMenuLabel>{t('sidebar.show_in_sidebar')}</DropdownMenuLabel>
                  )}

                  {/* Available general items */}
                  {menuItems.length > 0 && (
                    <>
                      {menuItems.map((item) => {
                        const itemWithDynamicProperties = getNavItemWithDynamicProperties(item);
                        const title = itemWithDynamicProperties.title.replace('Mono/', '');
                        const inSidebar = isItemInSidebar(item.id);
                        return (
                          <DropdownMenuItem
                            key={item.id}
                            role="menuitemcheckbox"
                            aria-checked={inSidebar}
                            onSelect={(e) => {
                              e.preventDefault();
                              handleToggleItem(item);
                            }}
                          >
                            <MonoIcon
                              type={itemWithDynamicProperties.icon as MonoIconType}
                              className="mr-2"
                            />
                            <span className="min-w-0 flex-1 truncate" title={title}>
                              {title}
                            </span>
                            {inSidebar && (
                              <MonoIcon type="Check" className="ml-2 h-4 w-4 shrink-0" />
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                      {organizedAccountLabels.length > 0 && <DropdownMenuSeparator />}
                    </>
                  )}

                  {/* Account-organized labels */}
                  {organizedAccountLabels.map(
                    ({ accountId, accountEmail, labels }, accountIndex) => (
                      <div key={accountId} className="w-full">
                        {/* Account header */}
                        <DropdownMenuLabel className="truncate" title={accountEmail}>
                          {accountEmail}
                        </DropdownMenuLabel>

                        {/* Account labels */}
                        {labels.map((label) => {
                          const title = label.title.replace('Mono/', '');
                          const inSidebar = isItemInSidebar(label.id);
                          return (
                            <DropdownMenuItem
                              key={label.id}
                              role="menuitemcheckbox"
                              aria-checked={inSidebar}
                              onSelect={(e) => {
                                e.preventDefault();
                                handleToggleItem(label);
                              }}
                            >
                              <LabelSwatch color={label.iconColor} className="mr-2" />
                              <span className="min-w-0 flex-1 truncate" title={title}>
                                {title}
                              </span>
                              {inSidebar && (
                                <MonoIcon type="Check" className="ml-2 h-4 w-4 shrink-0" />
                              )}
                            </DropdownMenuItem>
                          );
                        })}

                        {/* Separator between accounts (except last one) */}
                        {accountIndex < organizedAccountLabels.length - 1 && (
                          <DropdownMenuSeparator />
                        )}
                      </div>
                    )
                  )}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SortableContext>

        {createPortal(
          <DragOverlay dropAnimation={dropAnimation}>
            {activeItem
              ? (() => {
                  // A plain picture of the row: re-rendering the live row here
                  // registered a second sortable and keyboard item under the
                  // same id, and its transparent ghost was bare text over the
                  // list.
                  const preview = getNavItemWithDynamicProperties(activeItem);
                  return (
                    <div className="flex h-9 items-center rounded-lg border bg-popover px-3 text-sm text-foreground shadow-md">
                      {preview.type === 'account-label' ? (
                        <LabelSwatch color={preview.iconColor} className="mr-2" />
                      ) : (
                        <MonoIcon
                          type={
                            (preview.type === 'folder' ? 'Folder' : preview.icon) as MonoIconType
                          }
                          className="mr-2 text-muted-foreground"
                        />
                      )}
                      <span className="truncate">{preview.title.replace('Mono/', '')}</span>
                    </div>
                  );
                })()
              : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </div>
  );
};

export default CustomizableSidebar;
