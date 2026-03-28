import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
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
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import NavItem from '@/renderer/app/containers/sidebar/NavItem';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
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
import { useSidebarMigration } from '@/renderer/app/store/space/migrateSidebarAtom';
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
  arrayMove,
  AnimateLayoutChanges,
  defaultAnimateLayoutChanges
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FC, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { DBGetThreadCountByLabels, ValidLabel } from '@/renderer/app/lib/db/thread';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { ringVariants } from '@/renderer/app/components/ui/constants';

// Special drop zone component
const SpecialDropZone: FC<{ id: string; isActive: boolean }> = ({ id, isActive }) => {
  const { setNodeRef } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      data-id={id}
      className={cn(
        'h-2 w-full transition-all duration-200'
        // isActive ? 'rounded border-2 border-dashed border-primary bg-primary/20' : 'opacity-0'
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
  append
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    animateLayoutChanges,
    disabled: isEditing // Disable dragging when in editing mode to prevent focus interference
  });
  const { t } = useTranslation();
  const { isKeyboardMode } = useKeyboardNavigationContext();
  const elementRef = useRef<HTMLDivElement | null>(null);

  // Combined ref function to handle both sortable and keyboard navigation
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Set the sortable ref
      setNodeRef(node);
      // Set our internal ref
      elementRef.current = node;
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
      // For folders, don't toggle on main click - only the toggle button should do that
      // This allows double-click editing to work properly
      if (item.type === 'folder') {
        handleToggleClick(e);
        // Do nothing for folder clicks, let the toggle button handle expansion
        return;
      } else {
        onItemClick(item);
      }
    },
    [item]
  );

  // Handle keyboard activation (Enter/Space) - only trigger click, not drag
  const handleKeyboardActivation = useCallback(
    (e: React.KeyboardEvent) => {
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

  // Handle unified inbox navigation for primary/secondary items with multiple accounts
  const shouldShowAccountExpansion =
    hasMultipleAccounts &&
    (item.type === 'primary' || item.type === 'secondary') &&
    !item.accountId;

  if (item.type === 'folder') {
    // When editing, don't wrap in ContextMenu to prevent interference
    if (isEditing) {
      return (
        <div
          ref={combinedRef}
          style={style}
          data-id={item.id}
          onKeyDown={handleKeyboardActivation}
          data-keyboard-item={item.id}
          tabIndex={0}
        >
          <Collapsible open={!item.isCollapsed}>
            <div className="flex w-full flex-col">
              <NavItem
                variant={'ghost'}
                id={item.id}
                title={item.title.replace('Mono/', '')}
                isEditing={isEditing}
                onEdit={onEditFolder ? (newTitle) => onEditFolder(item.id, newTitle) : undefined}
                onCancelEdit={onCancelEdit}
                onDoubleClick={handleDoubleClick}
                append={append}
                onClick={handleMouseClick}
                prepend={
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button
                        className="relative mr-2"
                        variant="ghost"
                        typeVariant="inline"
                        sizeVariant="sm"
                        onClick={handleToggleClick}
                      >
                        <MonoIcon
                          type="Dropdown"
                          className={cn(
                            'transition-all duration-300',
                            !item.isCollapsed ? '' : '-rotate-90',
                            'absolute text-muted-foreground opacity-0 group-hover:opacity-100'
                          )}
                        />
                        {!item.isCollapsed ? (
                          <MonoIcon
                            type={'FolderOpen'}
                            className={cn(
                              'text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0'
                            )}
                          />
                        ) : (
                          <MonoIcon
                            type={item.icon as MonoIconType}
                            className={cn(
                              'text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0'
                            )}
                          />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                }
              />
              <CollapsibleContent>
                <div className="ml-2 mt-1 flex flex-col gap-1">{children}</div>
              </CollapsibleContent>
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
        tabIndex={0}
      >
        <ContextMenu>
          <ContextMenuTrigger>
            <Collapsible open={!item.isCollapsed}>
              <div className="flex w-full flex-col">
                <NavItem
                  className={cn('group', isDragOver && 'border bg-card shadow-sm')}
                  variant={'ghost'}
                  id={item.id}
                  title={item.title.replace('Mono/', '')}
                  isEditing={isEditing}
                  onEdit={onEditFolder ? (newTitle) => onEditFolder(item.id, newTitle) : undefined}
                  onCancelEdit={onCancelEdit}
                  onDoubleClick={handleDoubleClick}
                  prepend={
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button
                          className="relative mr-2"
                          variant="ghost"
                          typeVariant="inline"
                          sizeVariant="sm"
                          onClick={handleToggleClick}
                        >
                          <MonoIcon
                            type="Dropdown"
                            className={cn(
                              'transition-all duration-300',
                              !item.isCollapsed ? '' : '-rotate-90',
                              'absolute text-muted-foreground opacity-0 group-hover:opacity-100'
                            )}
                          />
                          {!item.isCollapsed ? (
                            <MonoIcon
                              type={'FolderOpen'}
                              className={cn(
                                'text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0'
                              )}
                            />
                          ) : (
                            <MonoIcon
                              type={item.icon as MonoIconType}
                              className={cn(
                                'text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0'
                              )}
                            />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  }
                  append={append}
                  onClick={handleMouseClick}
                />
                <CollapsibleContent>
                  <div className="ml-2 mt-1 flex flex-col gap-1">{children}</div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </ContextMenuTrigger>
          <ContextMenuContent className="dark">
            <ContextMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <MonoIcon type="Trash" className="mr-2 h-4 w-4" />
              {t('sidebar.delete_item') || 'Delete'}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }

  // Handle unified inbox navigation for primary/secondary items with multiple accounts
  if (shouldShowAccountExpansion) {
    // When editing, don't wrap in ContextMenu to prevent interference
    if (isEditing) {
      return (
        <div
          ref={combinedRef}
          style={style}
          data-id={item.id}
          onKeyDown={handleKeyboardActivation}
          data-keyboard-item={item.id}
          tabIndex={0}
        >
          <Collapsible open={isItemExpanded}>
            <div className="flex w-full flex-col">
              <NavItem
                className="group"
                variant={'ghost'}
                id={item.id}
                title={item.title.replace('Mono/', '')}
                active={isActive}
                isEditing={isEditing}
                iconColor={item.iconColor}
                hotkey={item.hotkey}
                onEdit={undefined}
                onCancelEdit={undefined}
                onDoubleClick={undefined}
                append={append}
                prepend={
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button
                        className="relative mr-2"
                        variant="ghost"
                        typeVariant="inline"
                        sizeVariant="sm"
                        onClick={handleToggleClick}
                      >
                        <MonoIcon
                          type="Dropdown"
                          className={cn(
                            'transition-all duration-300',
                            isItemExpanded ? '' : '-rotate-90',
                            'absolute text-muted-foreground opacity-0 group-hover:opacity-100'
                          )}
                        />
                        {item.type === 'account-label' ? (
                          <div
                            className="ml-1 mr-3 h-3 w-[4px] rounded-full"
                            style={{ backgroundColor: item.iconColor ?? 'hsl(var(--foreground))' }}
                          />
                        ) : (
                          <MonoIcon
                            type={item.icon as MonoIconType}
                            className={cn(
                              'text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0',
                              isActive && item.iconColor
                            )}
                          />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                }
                onClick={() => !isDragging && onItemClick(item)}
              />
              <CollapsibleContent>
                <div className="ml-2 mt-1 flex flex-col gap-1">
                  {accounts.map((account) => (
                    <NavItem
                      key={`${item.id}-${account.uid}`}
                      variant={'ghost'}
                      title={account.email}
                      iconColor={item.iconColor}
                      active={isChildActive ? isChildActive(account.uid) : false}
                      prepend={
                        item.type === 'account-label' ? (
                          <div
                            className="ml-1 mr-3 h-3 w-[4px] rounded-full"
                            style={{ backgroundColor: item.iconColor ?? 'hsl(var(--foreground))' }}
                          />
                        ) : (
                          <MonoIcon
                            type={item.icon as MonoIconType}
                            className={cn(
                              'mr-2 text-muted-foreground transition-all duration-300',
                              isChildActive && isChildActive(account.uid) && item.iconColor
                            )}
                          />
                        )
                      }
                      onClick={() => onAccountClick && onAccountClick(item, account.uid)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
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
        tabIndex={0}
      >
        <ContextMenu>
          <ContextMenuTrigger>
            <Collapsible open={isItemExpanded}>
              <div className="flex w-full flex-col">
                <NavItem
                  className="group"
                  variant={'ghost'}
                  id={item.id}
                  title={item.title.replace('Mono/', '')}
                  active={isActive}
                  isEditing={isEditing}
                  iconColor={item.iconColor}
                  hotkey={item.hotkey}
                  onEdit={undefined}
                  onCancelEdit={undefined}
                  onDoubleClick={undefined}
                  append={append}
                  prepend={
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button
                          className="relative mr-2"
                          variant="ghost"
                          typeVariant="inline"
                          sizeVariant="sm"
                          onClick={handleToggleClick}
                        >
                          <MonoIcon
                            type="Dropdown"
                            className={cn(
                              'transition-all duration-300',
                              isItemExpanded ? '' : '-rotate-90',
                              'absolute text-muted-foreground opacity-0 group-hover:opacity-100'
                            )}
                          />
                          {item.type === 'account-label' ? (
                            <div
                              className="ml-1 mr-3 h-3 w-[4px] rounded-full"
                              style={{
                                backgroundColor: item.iconColor ?? 'hsl(var(--foreground))'
                              }}
                            />
                          ) : (
                            <MonoIcon
                              type={item.icon as MonoIconType}
                              className={cn(
                                'text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0',
                                isActive && item.iconColor
                              )}
                            />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  }
                  onClick={() => !isDragging && onItemClick(item)}
                />
                <CollapsibleContent>
                  <div className="ml-2 mt-1 flex flex-col gap-1">
                    {accounts.map((account) => (
                      <NavItem
                        key={`${item.id}-${account.uid}`}
                        variant={'ghost'}
                        title={account.email}
                        iconColor={item.iconColor}
                        active={isChildActive ? isChildActive(account.uid) : false}
                        prepend={
                          item.type === 'account-label' ? (
                            <div
                              className="ml-1 mr-3 h-3 w-[4px] rounded-full"
                              style={{
                                backgroundColor: item.iconColor ?? 'hsl(var(--foreground))'
                              }}
                            />
                          ) : (
                            <MonoIcon
                              type={item.icon as MonoIconType}
                              className={cn(
                                'mr-2 text-muted-foreground transition-all duration-300',
                                isChildActive && isChildActive(account.uid) && item.iconColor
                              )}
                            />
                          )
                        }
                        onClick={() => onAccountClick && onAccountClick(item, account.uid)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </ContextMenuTrigger>
          <ContextMenuContent className="dark">
            <ContextMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <MonoIcon type="Trash" className="mr-2 h-4 w-4" />
              {t('sidebar.delete_item') || 'Delete'}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }

  // Regular nav item (non-folder, non-expandable)
  // When editing, don't wrap in ContextMenu to prevent interference
  if (isEditing) {
    return (
      <div
        ref={combinedRef}
        style={style}
        data-id={item.id}
        onKeyDown={handleKeyboardActivation}
        data-keyboard-item={item.id}
        tabIndex={0}
      >
        <NavItem
          variant={'ghost'}
          id={item.id}
          title={item.title.replace('Mono/', '')}
          active={isActive}
          isEditing={isEditing}
          iconColor={item.iconColor}
          hotkey={item.hotkey}
          onEdit={undefined}
          onCancelEdit={undefined}
          append={append}
          prepend={
            item.type === 'account-label' ? (
              <div
                className="mr-2 h-2 w-2 rounded-full"
                style={{ backgroundColor: item.iconColor ?? 'hsl(var(--foreground))' }}
              />
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
            )
          }
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
      tabIndex={0}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <NavItem
            variant={'ghost'}
            id={item.id}
            title={item.title.replace('Mono/', '')}
            active={isActive}
            isEditing={isEditing}
            iconColor={item.iconColor}
            hotkey={item.hotkey}
            onEdit={undefined}
            onCancelEdit={undefined}
            append={append}
            prepend={
              item.type === 'account-label' ? (
                <div
                  className="ml-1 mr-3 h-3 w-[4px] rounded-full"
                  style={{
                    backgroundColor:
                      item.iconColor === 'text-muted-foreground'
                        ? 'hsl(var(--muted-foreground))'
                        : (item.iconColor ?? 'hsl(var(--foreground))')
                  }}
                />
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
              )
            }
            onClick={() => !isDragging && onItemClick(item)}
            onDoubleClick={undefined}
          />
        </ContextMenuTrigger>
        <ContextMenuContent className="dark">
          <ContextMenuItem
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <MonoIcon type="Trash" className="mr-2 h-4 w-4" />
            {t('sidebar.delete_item') || 'Delete'}
          </ContextMenuItem>
        </ContextMenuContent>
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
  const { registerAreaRef } = useKeyboardNavigationContext();
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
    setSidebarsBySpace
  } = useCustomSidebarAtom();

  // Remove local state - use atom instead
  const sidebarState = getCurrentSidebarState();
  const [activeItem, setActiveItem] = useState<CustomNavItem | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [dropLinePosition, setDropLinePosition] = useState<{
    itemId: string;
    position: 'above' | 'below';
    isInFolder?: boolean;
  } | null>(null);
  const [currentMouseY, setCurrentMouseY] = useState<number>(0);
  const [specialDropZone, setSpecialDropZone] = useState<'top' | 'bottom' | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});
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
      setCurrentMouseY(e.clientY);
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
            query: `label:${label.name.toLowerCase()}`,
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

  // Toggle account expansion in the dropdown
  const toggleAccountExpansion = useCallback((accountId: string) => {
    setExpandedAccounts((prev) => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  }, []);

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

        // Auto-expand folder when dragging over it
        if (overItem.isCollapsed) {
          handleToggleFolder(over.id as string);
        }
      } else {
        setDragOverFolder(null);
        // Drop line calculation moved to handleDragMove for real-time updates
      }
    },
    [sidebarState, handleToggleFolder, isFolderDescendant]
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
          const position = currentMouseY < itemCenterY ? 'above' : 'below';

          setDropLinePosition({
            itemId: over.id,
            position,
            isInFolder
          });
        } else {
          setDropLinePosition(null);
        }
      } else {
        setDropLinePosition(null);
      }
    },
    [sidebarState, currentMouseY]
  );

  // Handle drag cancel (when ESC is pressed)
  const handleDragCancel = useCallback(() => {
    setActiveItem(null);
    setDragOverFolder(null);
    setDropLinePosition(null);
    setSpecialDropZone(null);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      // Capture drop line position and special zone before clearing
      const currentDropPosition = dropLinePosition;
      const currentSpecialZone = specialDropZone;

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
        moveItemToFolder(activeId, overId, false).catch(() => {
          console.error('Failed to persist move to folder operation');
        });
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
      setSidebarsBySpace
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

  // Handle deleting item
  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      // Clear editing state if deleting the item being edited
      if (editingItemId === itemId) {
        setEditingItemId(null);
      }

      // Atom updated automatically
      await removeNavItem(itemId);
    },
    [removeNavItem, editingItemId]
  );

  // Handle updating folder name
  const handleUpdateFolderName = useCallback(
    async (folderId: string, newTitle: string) => {
      if (!activeSpace || !sidebarState) return;

      const folder = sidebarState.items[folderId];
      if (!folder || folder.type !== 'folder') return;

      // The atom will be updated automatically
      const updatedSidebar = {
        ...sidebarState,
        items: {
          ...sidebarState.items,
          [folderId]: {
            ...folder,
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
  const handleAddItem = useCallback(
    async (item: CustomNavItem) => {
      // Atom updated automatically
      await addNavItem(item);
    },
    [addNavItem]
  );

  // Handle creating new folder
  const handleCreateFolder = useCallback(async () => {
    if (!activeSpace) return;

    const defaultFolderName = t('sidebar.new_folder') || 'New Folder';
    // Atom updated automatically
    await createFolder(defaultFolderName);
  }, [createFolder, activeSpace, t]);

  // Fetch unread counts for every sidebar item
  const fetchLabelCounts = useCallback(async () => {
    if (!sidebarState || !activeSpace) return;

    const counts: Record<string, number> = {};

    for (const item of Object.values(sidebarState.items)) {
      if (item.type === 'folder') continue;

      if (item.type === 'account-label' && item.labelId) {
        // Specific Gmail label
        if (item.accountId) {
          counts[item.id] = await DBGetThreadCountByLabels(item.accountId, [
            item.labelId,
            'UNREAD'
          ]);
        } else {
          let total = 0;
          for (const accountId of activeSpace.accountUids) {
            total += await DBGetThreadCountByLabels(accountId, [item.labelId, 'UNREAD']);
          }
          counts[item.id] = total;
        }
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
        case 'done': {
          let total = 0;
          for (const accountId of activeSpace.accountUids) {
            const allThreads = await DBGetThreadCountByLabels(accountId, []);
            const inboxThreads = await DBGetThreadCountByLabels(accountId, ['INBOX', 'UNREAD']);
            total += Math.max(allThreads - inboxThreads, 0);
          }
          counts[item.id] = total;
          break;
        }
        default: {
          // Map id -> label
          const label = item.id === 'all-mail' ? 'ALL' : item.id.toUpperCase();
          let total = 0;
          for (const accountId of activeSpace.accountUids) {
            total += await DBGetThreadCountByLabels(accountId, [label as ValidLabel, 'UNREAD']);
          }
          counts[item.id] = total;
        }
      }
    }

    setLabelCounts(counts);
  }, [sidebarState, activeSpace, getDraftsForAccount]);

  // Re-fetch counts when threads or sidebar change
  useEffect(() => {
    fetchLabelCounts();
  }, [threadsMap, sidebarState, activeSpace, fetchLabelCounts]);

  // Render count badge
  const renderCountBadge = useCallback(
    (itemId: string) => {
      const count = labelCounts[itemId] || 0;
      if (count === 0) return null;
      return (
        <div className="ml-auto flex items-center justify-center rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
          {count > 999 ? '999+' : count}
        </div>
      );
    },
    [labelCounts]
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
                <div className="absolute -top-[4px] left-0 right-0 ml-2 h-[2px] rounded bg-primary" />
                <div className="absolute -top-[6.5px] left-0 h-2 w-2 rounded-full bg-primary" />
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
            append={renderCountBadge(item.id)}
          >
            {childItems.map((childItem) => childItem && renderNavItem(childItem, depth + 1))}
          </SortableNavItem>

          {/* Drop line indicator for items within folders */}
          {dropLinePosition?.itemId === item.id &&
            dropLinePosition?.position === 'below' &&
            dropLinePosition?.isInFolder && (
              <>
                <div className="absolute -bottom-[2.5px] left-0 right-0 ml-2 h-[2px] rounded bg-primary" />
                <div className="absolute -bottom-[5px] left-0 h-2 w-2 rounded-full bg-primary" />
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
      getNavItemWithDynamicProperties
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
                      <div className="absolute -top-[3.5px] left-0 right-0 z-50 h-[2px] rounded bg-primary" />
                      <div className="absolute -top-[6px] left-0 h-2 w-2 rounded-full bg-primary" />
                    </>
                  )}
                {renderNavItem(item)}
                {/* Drop line indicator for root items */}
                {dropLinePosition?.itemId === item.id &&
                  dropLinePosition?.position === 'below' &&
                  !dropLinePosition?.isInFolder && (
                    <>
                      <div className="absolute -bottom-[2px] left-0 right-0 z-50 h-[2px] rounded bg-primary" />
                      <div className="absolute -bottom-[4.5px] left-0 h-2 w-2 rounded-full bg-primary" />
                    </>
                  )}
              </div>
            ))}

            {/* Special drop zone at the bottom */}
            {/* <SpecialDropZone id="special-drop-bottom" isActive={specialDropZone === 'bottom'} /> */}

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
              <DropdownMenuContent className="dark h-96 w-64" align="start">
                <ScrollArea className="h-full">
                  {/* Create folder option at the top */}
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleCreateFolder();
                    }}
                  >
                    <MonoIcon type="Plus" className="mr-2" />
                    {t('sidebar.create_folder') || 'Create Folder'}
                  </DropdownMenuItem>

                  {/* Separator after create folder */}
                  {(allAvailableItems.length > 0 || organizedAccountLabels.length > 0) && (
                    <DropdownMenuSeparator />
                  )}

                  {/* Available general items */}
                  {allAvailableItems.length > 0 && (
                    <>
                      {allAvailableItems.map((item) => {
                        const itemWithDynamicProperties = getNavItemWithDynamicProperties(item);
                        return (
                          <DropdownMenuItem
                            key={item.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              handleToggleItem(item);
                            }}
                          >
                            <MonoIcon
                              type={itemWithDynamicProperties.icon as MonoIconType}
                              className="mr-2"
                            />
                            {itemWithDynamicProperties.title.replace('Mono/', '')}
                            {isItemInSidebar(item.id) && (
                              <MonoIcon type="Check" className="ml-auto h-4 w-4" />
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
                        <div className="px-2 py-1">
                          <span className="text-xs font-medium text-muted-foreground/70">
                            {accountEmail}
                          </span>
                        </div>

                        {/* Account labels */}
                        {labels.map((label) => (
                          <DropdownMenuItem
                            key={label.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              handleToggleItem(label);
                            }}
                            className="pl-4"
                          >
                            <div
                              className="-ml-1 mr-2 h-3 w-[4px] rounded-full"
                              style={
                                label.iconColor && label.iconColor !== 'text-muted-foreground'
                                  ? {
                                      backgroundColor: label.iconColor
                                    }
                                  : undefined
                              }
                            />

                            <span>{label.title.replace('Mono/', '')}</span>
                            {isItemInSidebar(label.id) && (
                              <MonoIcon type="Check" className="ml-auto h-4 w-4" />
                            )}
                          </DropdownMenuItem>
                        ))}

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
            {activeItem ? (
              <SortableNavItem
                item={getNavItemWithDynamicProperties(activeItem)}
                isActive={false}
                onItemClick={() => {}}
                onDeleteItem={() => {}}
                onToggleFolder={() => {}}
                onEditFolder={() => {}}
                onEditItem={() => {}}
                onStartEditing={() => {}}
                onCancelEdit={() => {}}
                isOverlay
              />
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </div>
  );
};

export default CustomizableSidebar;
