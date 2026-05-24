// EnhancedAccountInboxNav.tsx
import { SearchBookmark } from '@/main/api/bookmark/types';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import NavItem from '@/renderer/app/containers/sidebar/NavItem';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { DBGetThreadCountByLabels, ValidLabel } from '@/renderer/app/lib/db/thread';
import { cn } from '@/renderer/app/lib/utils';
import { useBookmarkAtom } from '@/renderer/app/store/bookmark/useBookmarkAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  DropAnimation,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import { FC, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        transform: 'scale(1)'
      }
    }
  })
};

interface LabelTreeNode {
  id: string;
  name: string;
  fullPath: string;
  color?: {
    backgroundColor?: string;
    textColor?: string;
  };
  children: Record<string, LabelTreeNode>;
}

interface LabelCount {
  id: string;
  count: number;
}

interface AccountInboxNavProps {
  accountId: string;
}

const AccountInboxNav: FC<AccountInboxNavProps> = ({ accountId }) => {
  const { searchNewQuery, globalSearchQuery, activeLayout } = useGlobalAtom();
  const { openDialog } = useDialogs();
  const { accounts } = useAuth();
  const { searchBookmarks, removeBookmark, updateBookmark, setBookmarks } = useBookmarkAtom();
  const { labelsMapByAccount, removeLabel, loadLabels, defaultLabels } = useLabelAtom();
  const { getAccountNavState, toggleAccountOpen, toggleBookmarksOpen, toggleLabelsOpen } =
    useSidebarAtom();
  const { threadsMap } = useThreadAtom();

  // Keyboard navigation integration
  const containerRef = useRef<HTMLDivElement>(null);

  // Stores the open/closed state for the label tree
  const [openLabelNodes, setOpenLabelNodes] = useState<Record<string, boolean>>({});
  // Store label counts
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});

  // Toggle a label node's expanded state
  const toggleLabelNode = useCallback((nodeId: string) => {
    setOpenLabelNodes((prev) => {
      return {
        ...prev,
        [nodeId]: prev[nodeId] === undefined ? false : !prev[nodeId]
      };
    });
  }, []);

  // Get the open state for a label node, default to open (true)
  const isLabelNodeOpen = useCallback(
    (nodeId: string) => openLabelNodes[nodeId] !== false,
    [openLabelNodes]
  );
  const executeCommand = useExecuteCommand();

  const [bookmarks, setBookmarksForAccount] = useState<SearchBookmark[]>([]);
  const [activeBookmark, setActiveBookmark] = useState<SearchBookmark | null>(null);
  const { t } = useTranslation();

  const account = useMemo(
    () => accounts.find((account) => account.uid === accountId),
    [accountId, accounts]
  );

  // Get persisted navigation state for this account
  const navState = getAccountNavState(accountId);
  const { isAccountOpen, isBookmarksOpen, isLabelsOpen } = navState;

  // Get labels for this specific account
  const accountLabels = useMemo(() => {
    // Get the account's label map
    const accountLabelMap = labelsMapByAccount[accountId] || {};
    // Convert to array of labels
    return Object.values(accountLabelMap);
  }, [accountId, labelsMapByAccount]);

  // Organize labels into a hierarchical structure
  const labelTree = useMemo(() => {
    const tree: Record<string, LabelTreeNode> = {};

    // Keep track of label objects by their full path
    const labelsByPath: Record<string, any> = {};

    if (!accountLabels || accountLabels.length === 0) return tree;

    // First, create a map of all labels by their full path for easy lookup
    accountLabels.forEach((label) => {
      // Skip default system labels
      if (defaultLabels.includes(label.name)) {
        return;
      }

      labelsByPath[label.name] = label;
    });

    // Now build the tree with correct colors
    accountLabels.forEach((label) => {
      // Skip default system labels
      if (defaultLabels.includes(label.name)) {
        return;
      }

      const parts = label.name.split('/');
      let currentLevel = tree;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        // Get the label object for this path if it exists
        const pathLabel = labelsByPath[currentPath];

        if (!currentLevel[part]) {
          // Use the color from the matching label if available
          const nodeColor = pathLabel ? pathLabel.color : undefined;

          currentLevel[part] = {
            id: index === parts.length - 1 ? label.id : `folder-${currentPath}`,
            name: part,
            fullPath: currentPath,
            color: nodeColor,
            children: {}
          };
        }

        currentLevel = currentLevel[part].children;
      });
    });

    // Second pass: inherit colors for parent nodes that don't have colors
    const assignParentColors = (nodes: Record<string, LabelTreeNode>) => {
      Object.values(nodes).forEach((node) => {
        // If this node has children, recursively process them first
        if (Object.keys(node.children).length > 0) {
          assignParentColors(node.children);

          // If this parent node doesn't have a color, inherit from the first child that has one
          if (!node.color) {
            const childWithColor = Object.values(node.children).find(
              (child) => child.color?.backgroundColor
            );
            if (childWithColor) {
              node.color = childWithColor.color;
            }
          }
        }
      });
    };

    assignParentColors(tree);

    return tree;
  }, [accountLabels]);

  useEffect(() => {
    // Only fetch bookmarks if account exists
    if (account) {
      setBookmarksForAccount(searchBookmarks[account.uid] ?? []);
    }
  }, [account, searchBookmarks]);

  const formatLabel = useCallback((label) => {
    // Check if the label starts with "LABEL_" pattern
    if (label.match(/^LABEL_\d+$/i)) {
      // Get the prefix and number parts
      const [prefix, number] = label.split('_');

      // Format prefix to have only the first letter capitalized
      const formattedPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();

      // Return the formatted label
      return `${formattedPrefix}_${number}`;
    }

    // Return original if it doesn't match the pattern
    return label;
  }, []);

  // Function to fetch thread counts for all labels
  const fetchLabelCounts = useCallback(async () => {
    if (!account) return;

    const counts: Record<string, number> = {};

    // Process all labels for this account
    for (const label of accountLabels) {
      // Skip default system labels
      if (defaultLabels.includes(label.name)) {
        continue;
      }

      try {
        // Get unread count for this label
        const labelCount = await DBGetThreadCountByLabels(accountId, [
          formatLabel(label.id),
          'UNREAD'
        ]);

        counts[label.id] = labelCount;
      } catch (error) {
        console.error(`Error fetching count for label ${label.name}:`, error);
        counts[label.id] = 0;
      }
    }

    setLabelCounts(counts);
  }, [account, accountId, accountLabels, formatLabel]);

  // Fetch counts on component mount and when threads or labels change
  useEffect(() => {
    if (isAccountOpen && account) {
      fetchLabelCounts();
    }
  }, [isAccountOpen, account, threadsMap, accountLabels]);

  // Helper to render the count badge
  const renderCountBadge = useCallback(
    (labelId: string) => {
      const count = labelCounts[labelId] || 0;
      if (count === 0) return null;

      return (
        <div className="ml-auto flex items-center justify-center rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
          {count > 999 ? '999+' : count}
        </div>
      );
    },
    [labelCounts]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10
      }
    }),
    useSensor(KeyboardSensor)
  );

  const arrayMove = useCallback(
    (arr: SearchBookmark[], from: number, to: number): SearchBookmark[] => {
      const updatedArr = [...arr];
      const [movedItem] = updatedArr.splice(from, 1);
      updatedArr.splice(to, 0, movedItem);
      return updatedArr;
    },
    []
  );

  const handleDragEnd = useCallback(
    async (event) => {
      if (!account) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = bookmarks.findIndex((bookmark) => bookmark.title === active.id);
      const newIndex = bookmarks.findIndex((bookmark) => bookmark.title === over.id);

      const updatedBookmarks = arrayMove(bookmarks, oldIndex, newIndex);
      setBookmarksForAccount(updatedBookmarks);
      await setBookmarks(account.uid, updatedBookmarks);
    },
    [account, bookmarks, arrayMove, setBookmarks]
  );

  const handleDragStart = useCallback((event) => {
    const { active } = event;
    setActiveBookmark(active.data.current);
  }, []);

  // Callback for opening command palette for bookmarks
  const handleAddBookmarkClick = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      openDialog('commandPalette', { pages: ['SEARCH'] });
    },
    [openDialog]
  );

  // Callback for opening preferences for labels
  const handleAddLabelClick = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      openDialog('preference', { defaultPage: 'label' });
    },
    [openDialog]
  );

  // Callback for account reconnection
  const handleAccountReconnectClick = useCallback(() => {
    openDialog('preference', { defaultPage: 'integration' });
  }, [openDialog]);

  // Callback for bookmark search
  const handleBookmarkClick = useCallback(
    (query: string) => {
      searchNewQuery(query, undefined, false);
    },
    [searchNewQuery]
  );

  // Callback for label search
  const handleLabelClick = useCallback(
    (fullPath: string) => {
      searchNewQuery(`label:${fullPath.toLowerCase()}`, undefined, false);
    },
    [searchNewQuery]
  );

  // Callback for bookmark edit
  const handleBookmarkEdit = useCallback(
    (bookmark: SearchBookmark, newTitle: string) => {
      if (account) {
        updateBookmark(account.uid, bookmark.query, { title: newTitle });
      }
    },
    [account, updateBookmark]
  );

  // Callback for bookmark removal
  const handleBookmarkRemove = useCallback(
    (bookmarkQuery: string) => {
      if (account) {
        removeBookmark(account.uid, bookmarkQuery);
      }
    },
    [account, removeBookmark]
  );

  // Callback for label removal
  const handleLabelRemove = useCallback(
    (labelId: string) => {
      if (labelId && !labelId.startsWith('folder-')) {
        removeLabel(labelId, accountId);
      }
    },
    [removeLabel, accountId]
  );

  // Callback for opening label edit dialog
  const handleLabelEditClick = useCallback(() => {
    openDialog('preference', {
      defaultPage: 'label'
    });
  }, [openDialog]);

  // Callback for opening bookmark edit dialog
  const handleBookmarkEditDialog = useCallback(
    (bookmark: SearchBookmark) => {
      openDialog('commandPalette', {
        pages: ['SEARCH', 'BOOKMARK_NAME'],
        searchQuery: bookmark.query,
        selectedAccountId: accountId,
        bookmarkName: bookmark.title,
        bookmarkIcon: bookmark.icon
      });
    },
    [openDialog, accountId]
  );

  const SortableBookmark = ({
    bookmark,
    isOverlay = false,
    index
  }: {
    bookmark: SearchBookmark;
    isOverlay: boolean;
    index: number;
  }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: bookmark.title
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging && !isOverlay ? 0.5 : 1
    };

    const onEdit = useCallback(
      (newTitle: string) => {
        handleBookmarkEdit(bookmark, newTitle);
      },
      [bookmark]
    );

    const onClick = useCallback(() => {
      handleBookmarkClick(bookmark.query);
    }, [bookmark.query]);

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <NavItem
          variant={'default'}
          // variant={'ghost'}
          title={bookmark.title}
          icon={bookmark.icon as MonoIconType}
          active={account && bookmark.query === globalSearchQuery && activeLayout === 'MAIL'}
          onEdit={onEdit}
          onClick={onClick}
        />
      </div>
    );
  };

  const getAccountStatusTooltip = useCallback(() => {
    if (!account) return '';

    const hasLabelsLoaded = Object.keys(labelsMapByAccount).length > 0;

    if (account.isExpired) {
      return t('tooltips.account_status.authentication_expired');
    }

    if (hasLabelsLoaded && !labelsMapByAccount[account.uid]) {
      return t('tooltips.account_status.too_many_requests');
    }

    if (!account.scopes.some((scope) => scope.includes('https://mail.google.com'))) {
      return t('tooltips.account_status.missing_gmail_permissions');
    }

    return t('tooltips.account_status.requires_reconnecting');
  }, [account, labelsMapByAccount, t]);

  // Recursive component to render the label tree
  const renderLabelTree = useCallback(
    (nodes: Record<string, LabelTreeNode>, level = 0, baseIndex = 10) => {
      let currentIndex = baseIndex;

      return Object.values(nodes).map((node) => {
        const hasChildren = Object.keys(node.children).length > 0;
        const itemIndex = currentIndex++;

        const onLabelClick = () => handleLabelClick(node.fullPath);
        const onToggleLabelNode = () => toggleLabelNode(node.id);
        const onLabelRemoveClick = () => handleLabelRemove(node.id);

        if (!hasChildren) {
          // Render regular label without collapsible functionality
          return (
            <div key={node.id}>
              <ContextMenu>
                <ContextMenuTrigger>
                  <NavItem
                    variant={'default'}
                    // variant={'ghost'}
                    className="px-2"
                    title={node.name}
                    active={
                      `label:${node.fullPath.toLowerCase()}` === globalSearchQuery &&
                      activeLayout === 'MAIL'
                    }
                    id={`label:${node.fullPath.toLowerCase()}`}
                    prepend={
                      <div
                        className="ml-1 mr-3 h-2 w-2 rounded-full border"
                        style={{
                          backgroundColor: node.color?.backgroundColor,
                          borderColor: node.color?.backgroundColor
                        }}
                      ></div>
                    }
                    append={!node.id.startsWith('folder-') ? renderCountBadge(node.id) : null}
                    onClick={onLabelClick}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent className="dark">
                  <ContextMenuItem onClick={handleLabelEditClick}>
                    <MonoIcon type="Edit" className="mr-2" />
                    {t('sidebar.edit')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={onLabelRemoveClick} className="hover:bg-destructive/10">
                    <MonoIcon type="Trash" className="mr-2 text-destructive" />
                    {t('sidebar.remove')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          );
        }

        // Calculate total count for this folder (sum of all child labels)
        const folderTotalCount = Object.values(node.children).reduce((total, childNode) => {
          // Skip folder nodes when calculating counts
          if (childNode.id.startsWith('folder-')) {
            return total;
          }
          return total + (labelCounts[childNode.id] || 0);
        }, 0);

        // For parent nodes with children, use the Collapsible component
        return (
          <div key={node.id}>
            <Collapsible open={isLabelNodeOpen(node.id)} onOpenChange={onToggleLabelNode}>
              <ContextMenu>
                <ContextMenuTrigger>
                  <CollapsibleTrigger asChild>
                    <div className="flex w-full flex-col">
                      <NavItem
                        className="group px-1 pr-0"
                        variant={'default'}
                        // variant={'ghost'}
                        // id={`${accountId}-${node.id}`}
                        id={`label:${node.fullPath.toLowerCase()}`}
                        iconColor={node.color?.backgroundColor}
                        title={node.name}
                        onClick={onToggleLabelNode}
                        prepend={
                          <div className="mr-1 flex items-center">
                            <Button className="relative" variant="ghost" sizeVariant="sm">
                              <MonoIcon
                                type="Dropdown"
                                className={cn(
                                  'transition-all duration-300',
                                  isLabelNodeOpen(node.id) ? '' : '-rotate-90',
                                  'absolute text-muted-foreground opacity-0 group-hover:opacity-100'
                                )}
                              />
                              <div
                                className="h-2 w-2 rounded-full border opacity-100 transition-all duration-300 group-hover:opacity-0"
                                style={{
                                  backgroundColor: node.color?.backgroundColor,
                                  borderColor: node.color?.backgroundColor
                                }}
                              ></div>
                            </Button>
                          </div>
                        }
                        append={
                          folderTotalCount > 0 && (
                            <div className="ml-auto mr-2 flex items-center justify-center rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
                              {folderTotalCount > 999 ? '999+' : folderTotalCount}
                            </div>
                          )
                        }
                      />
                    </div>
                  </CollapsibleTrigger>
                </ContextMenuTrigger>
                <ContextMenuContent className="dark">
                  <ContextMenuItem onClick={handleLabelEditClick}>
                    <MonoIcon type="Edit" className="mr-2" />
                    {t('sidebar.edit')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={onLabelRemoveClick} className="hover:bg-destructive/10">
                    <MonoIcon type="Trash" className="mr-2 text-destructive" />
                    {t('sidebar.remove')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {/* Render children with indentation */}
              <CollapsibleContent>
                <div className="ml-2">
                  {renderLabelTree(node.children, level + 1, currentIndex)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      });
    },
    [
      labelCounts,
      globalSearchQuery,
      activeLayout,
      renderCountBadge,
      handleLabelClick,
      toggleLabelNode,
      isLabelNodeOpen,
      handleLabelEditClick,
      handleLabelRemove,
      t
    ]
  );

  // Return null at the very end after all hooks are called
  if (!account) {
    return null;
  }

  return (
    <div
      id="account-inbox"
      className="flex flex-col gap-3 px-2"
      ref={containerRef}
      data-nav-area="sidebar-nav"
    >
      <Collapsible open={isAccountOpen} onOpenChange={() => toggleAccountOpen(accountId)}>
        <div className="group flex h-10 items-center justify-between text-muted-foreground hover:bg-background/30">
          <CollapsibleTrigger asChild>
            <div className="flex min-w-0 flex-1 items-center text-ellipsis rounded-lg hover:bg-muted">
              <Button
                className="relative text-sm hover:text-muted-foreground"
                variant="ghost"
                typeVariant="icon"
                sizeVariant="sm"
                onClick={() => toggleAccountOpen(accountId)}
              >
                <MonoIcon
                  type="Dropdown"
                  className={cn('transition-all duration-300', isAccountOpen ? '' : '-rotate-90')}
                />
              </Button>
              <div className="flex-1 overflow-hidden text-ellipsis">
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {account.email}
                </span>
              </div>
              {((Object.keys(labelsMapByAccount).length > 0 && !labelsMapByAccount[account.uid]) ||
                account.isExpired ||
                !account.scopes.some((scope) => scope.includes('https://mail.google.com'))) && (
                <Tooltip>
                  <TooltipTrigger>
                    <MonoIcon
                      onClick={handleAccountReconnectClick}
                      type={'AlertCircle'}
                      className="mr-2 mt-0.5 text-destructive"
                    />
                  </TooltipTrigger>
                  <TooltipPortal>
                    <TooltipContent side="right">{getAccountStatusTooltip()}</TooltipContent>
                  </TooltipPortal>
                </Tooltip>
              )}
            </div>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          {/* Bookmarks Collapsible */}
          <div className="ml-2">
            <Collapsible
              id={`account-bookmarks-${account.uid}`}
              open={isBookmarksOpen}
              onOpenChange={() => toggleBookmarksOpen(accountId)}
            >
              <div className="group flex h-8 items-center justify-between text-muted-foreground hover:bg-background/30">
                <CollapsibleTrigger asChild>
                  <div className="flex min-w-0 flex-1 items-center text-ellipsis rounded-lg hover:bg-muted">
                    <div className="flex items-center">
                      <Button
                        className="relative"
                        variant="ghost"
                        sizeVariant="sm"
                        onClick={() => toggleBookmarksOpen(accountId)}
                      >
                        <MonoIcon
                          type="Dropdown"
                          className={cn(
                            'transition-all duration-300',
                            isBookmarksOpen ? '' : '-rotate-90',
                            'absolute text-muted-foreground opacity-0 group-hover:opacity-100'
                          )}
                        />
                        <MonoIcon
                          type="Bookmark"
                          className="h-4 w-4 text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0"
                        />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {t('sidebar.bookmarks')}
                      </span>
                    </div>
                  </div>
                </CollapsibleTrigger>
                {bookmarks.length > 0 && (
                  <div className="transition-opacity duration-300">
                    <Button
                      onClick={handleAddBookmarkClick}
                      variant="ghost"
                      sizeVariant="sm"
                      typeVariant="icon"
                      tooltip={t('sidebar.add_bookmark')}
                      tooltipSide="right"
                    >
                      <MonoIcon type="Plus" className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {bookmarks.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={bookmarks.map((bookmark) => bookmark.title)}
                    strategy={verticalListSortingStrategy}
                  >
                    <CollapsibleContent>
                      <ul className="grid list-none gap-1 pl-2 pt-1">
                        {bookmarks.map((bookmark, index) => (
                          <ContextMenu key={bookmark.query}>
                            <ContextMenuTrigger>
                              <SortableBookmark
                                bookmark={bookmark}
                                isOverlay={false}
                                index={index}
                              />
                            </ContextMenuTrigger>
                            <ContextMenuContent className="dark">
                              <ContextMenuItem onClick={() => handleBookmarkEditDialog(bookmark)}>
                                <MonoIcon type="Bookmark" className="mr-2" />
                                {t('sidebar.edit')}
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() => handleBookmarkRemove(bookmark.query)}
                                className="hover:bg-destructive/10"
                              >
                                <MonoIcon type="Trash" className="mr-2 text-destructive" />
                                {t('sidebar.remove')}
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </SortableContext>
                  {createPortal(
                    <DragOverlay dropAnimation={dropAnimation}>
                      {activeBookmark ? (
                        <SortableBookmark
                          isOverlay
                          bookmark={activeBookmark}
                          index={-1} // Overlay doesn't need focus index
                        />
                      ) : null}
                    </DragOverlay>,
                    document.body
                  )}
                </DndContext>
              )}
              {bookmarks.length === 0 && (
                <CollapsibleContent>
                  <div className="pl-2 pt-1">
                    <NavItem
                      className="border-[1.5px] border-dashed hover:bg-muted"
                      title={t('sidebar.add_bookmark')}
                      icon="Plus"
                      onClick={handleAddBookmarkClick}
                    />
                  </div>
                </CollapsibleContent>
              )}
            </Collapsible>
          </div>

          {/* Labels - Direct rendering without collapsible wrapper */}
          <div className="ml-2 mt-2">
            <ul className="grid list-none gap-1">
              {accountLabels && accountLabels.length > 0 ? (
                Object.keys(labelTree).length > 0 ? (
                  renderLabelTree(labelTree)
                ) : (
                  <div className="pt-1">
                    <NavItem
                      title={t('sidebar.add_label')}
                      className="border border-dashed text-muted-foreground"
                      icon="Plus"
                      onClick={handleAddLabelClick}
                    />
                  </div>
                )
              ) : (
                <div className="pt-1">
                  <NavItem
                    className="border-[1.5px] border-dashed hover:bg-muted"
                    title={t('sidebar.add_label')}
                    icon="Plus"
                    onClick={handleAddLabelClick}
                  />
                </div>
              )}
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default AccountInboxNav;
