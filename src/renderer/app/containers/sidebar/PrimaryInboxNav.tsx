import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/renderer/app/components/ui/collapsible';
import NavItem from '@/renderer/app/containers/sidebar/NavItem';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { DBGetThreadCountByLabels, ValidLabel } from '@/renderer/app/lib/db/thread';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { FC, useCallback, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';

interface PrimaryInboxNavProps {}

interface LabelCount {
  id: string;
  count: number;
}

const PrimaryInboxNav: FC<PrimaryInboxNavProps> = () => {
  const { accounts: authAccounts, preference } = useAuth();
  const { activeSpace, setActiveAccountsInSpace } = useSpaceAtom();
  const { searchNewQuery, globalSearchQuery, activeLayout } = useGlobalAtom();
  const { getDraftsForAccount } = useDraftAtom();
  const { threadsMap } = useThreadAtom();
  const [isImportantOpen, setIsImportantOpen] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});
  const { t } = useTranslation();

  if (!activeSpace) {
    return null; // or return a loading state or fallback UI
  }

  const accounts = authAccounts.filter((account) => activeSpace.accountUids.includes(account.uid));
  const hasMultipleAccounts = accounts.length > 1;

  // Important inbox items
  const importantItems = useMemo(
    () => [
      // Primary category
      {
        id: 'primary',
        label: 'PRIMARY',
        query: 'category:primary',
        title: t('sidebar.nav.category.inbox'),
        icon: 'Inbox',
        parentIcon: 'InboxStack',
        iconColor: 'text-primary',
        hotkey: 'G+P'
      },
      // Starred
      {
        id: 'starred',
        label: 'STARRED',
        title: t('sidebar.nav.star'),
        icon: 'Star',
        parentIcon: 'Star',
        query: 'is:starred',
        hotkey: 'G+S',
        iconColor: 'text-yellow-500'
      },
      // Draft
      {
        id: 'draft',
        label: 'DRAFT',
        title: t('sidebar.nav.draft'),
        icon: 'Pen',
        parentIcon: 'Pen',
        query: 'in:draft',
        hotkey: 'G+D',
        iconColor: 'text-primary'
      },
      // Sent
      {
        id: 'sent',
        label: 'SENT',
        title: t('sidebar.nav.sent'),
        icon: 'SendHorizontal',
        parentIcon: 'SendHorizontal',
        query: 'in:sent',
        hotkey: 'G+T',
        iconColor: 'text-primary'
      },
      // All Inboxes
      {
        id: 'all',
        label: 'ALL',
        query: 'in:all -in:trash',
        title: t('sidebar.nav.all_mail'),
        icon: 'Envelope',
        parentIcon: 'EnvelopeStack',
        iconColor: 'text-blue-500',
        hotkey: 'G+A'
      }
    ],
    [t]
  );

  const filteredImportantItems = useMemo(() => {
    return importantItems.filter((item) => {
      // If display.inbox preferences exist and this specific preference is defined,
      // use the preference value. Otherwise, default to true (show the item)
      return preference.display.inbox[item.id] ?? true;
    });
  }, [preference, importantItems]);

  // Memoized toggle function for items
  const handleToggleItemExpanded = useCallback((itemId: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  }, []);

  // Memoized toggle function for important section
  const handleToggleImportant = useCallback(() => {
    setIsImportantOpen((prev) => !prev);
  }, []);

  // Handle click on main nav item (sets all accounts active)
  const handleNavClick = useCallback(
    (query: string) => {
      // Set all accounts in space as active
      setActiveAccountsInSpace(activeSpace.accountUids);
      searchNewQuery(query, undefined, false);
    },
    [activeSpace.accountUids, setActiveAccountsInSpace, searchNewQuery]
  );

  // Handle click on an account (activates only that account)
  const handleAccountNavClick = useCallback(
    (accountId: string, query: string) => {
      // Activate only this single account
      setActiveAccountsInSpace([accountId]);
      searchNewQuery(query, undefined, false);
    },
    [setActiveAccountsInSpace, searchNewQuery]
  );

  // Create memoized click handlers for each item
  const navItemClickHandlers = useMemo(() => {
    return filteredImportantItems.reduce(
      (handlers, item) => {
        handlers[item.id] = {
          main: () => handleNavClick(item.query),
          account: (accountId: string) => handleAccountNavClick(accountId, item.query)
        };
        return handlers;
      },
      {} as Record<string, { main: () => void; account: (accountId: string) => void }>
    );
  }, [filteredImportantItems, handleNavClick, handleAccountNavClick]);

  // Create memoized toggle handlers for each item
  const toggleHandlers = useMemo(() => {
    return filteredImportantItems.reduce(
      (handlers, item) => {
        handlers[item.id] = (e: React.MouseEvent) => {
          e.stopPropagation();
          handleToggleItemExpanded(item.id);
        };
        return handlers;
      },
      {} as Record<string, (e: React.MouseEvent) => void>
    );
  }, [filteredImportantItems, handleToggleItemExpanded]);

  // Create memoized account click handlers
  const accountClickHandlers = useMemo(() => {
    const handlers: Record<string, Record<string, () => void>> = {};

    filteredImportantItems.forEach((item) => {
      handlers[item.id] = {};
      accounts.forEach((account) => {
        handlers[item.id][account.uid] = () => navItemClickHandlers[item.id].account(account.uid);
      });
    });

    return handlers;
  }, [filteredImportantItems, accounts, navItemClickHandlers]);

  // Initialize primary category expanded by default
  useEffect(() => {
    setExpandedItems((prev) => ({
      ...prev,
      'category:primary': true
    }));
  }, []);

  // Helper to determine if parent item is active (all accounts are active)
  const isParentActive = useCallback(
    (query: string) => {
      return (
        globalSearchQuery === query &&
        activeLayout === 'MAIL' &&
        activeSpace.activeAccountUids.length === activeSpace.accountUids.length &&
        activeSpace.accountUids.every((id) => activeSpace.activeAccountUids.includes(id))
      );
    },
    [globalSearchQuery, activeLayout, activeSpace.activeAccountUids, activeSpace.accountUids]
  );

  // Helper to determine if child item is active (only this account is active)
  const isChildActive = useCallback(
    (query: string, accountId: string) => {
      return (
        globalSearchQuery === query &&
        activeLayout === 'MAIL' &&
        activeSpace.activeAccountUids.length === 1 &&
        activeSpace.activeAccountUids[0] === accountId
      );
    },
    [globalSearchQuery, activeLayout, activeSpace.activeAccountUids]
  );

  // Function to fetch thread counts for all labels
  const fetchLabelCounts = useCallback(async () => {
    const counts: Record<string, number> = {};

    // Get counts for each label across all accounts in the active space
    for (const item of filteredImportantItems) {
      if (item.id === 'draft') {
        // For drafts, we use the draft atom
        let totalDrafts = 0;
        for (const accountId of activeSpace.accountUids) {
          const accountDrafts = getDraftsForAccount(accountId);
          totalDrafts += Object.keys(accountDrafts).length;
        }
        counts[item.id] = totalDrafts;
      } else {
        // For other labels, use DBGetThreadCountByLabels
        let totalCount = 0;
        for (const accountId of activeSpace.accountUids) {
          const labelCount = await DBGetThreadCountByLabels(accountId, [
            item.label as ValidLabel,
            'UNREAD'
          ]);
          totalCount += labelCount;
        }
        counts[item.id] = totalCount;
      }
    }

    setLabelCounts(counts);
  }, [activeSpace.accountUids, filteredImportantItems, getDraftsForAccount]);

  // Fetch counts on component mount and when active accounts change
  useEffect(() => {
    fetchLabelCounts();
  }, [threadsMap, activeSpace.accountUids]);

  // Helper to render the count badge
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

  if (filteredImportantItems.length === 0) {
    return null;
  }

  return (
    <div id="important-inboxes" className="flex flex-col gap-3 px-2">
      <Collapsible id="important-list" open={isImportantOpen} onOpenChange={setIsImportantOpen}>
        <div className="group flex h-10 items-center justify-between text-muted-foreground hover:bg-background/30">
          <CollapsibleTrigger asChild>
            <div className="flex min-w-0 flex-1 items-center text-ellipsis rounded-lg hover:bg-muted">
              <span className="flex flex-1 items-center">
                <Button
                  variant={'ghost'}
                  typeVariant={'icon'}
                  sizeVariant={'sm'}
                  onClick={handleToggleImportant}
                >
                  <MonoIcon
                    type={'Dropdown'}
                    className={cn(
                      'transition-all duration-300',
                      isImportantOpen ? '' : '-rotate-90',
                      'text-muted-foreground'
                    )}
                  />
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  {t('sidebar.inboxes')}
                </span>
              </span>
            </div>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="flex flex-col gap-1">
            {filteredImportantItems.map((item, index) => (
              <div key={item.id}>
                {hasMultipleAccounts ? (
                  <Collapsible open={expandedItems[item.id]}>
                    <CollapsibleTrigger asChild>
                      <div className="flex w-full flex-col">
                        {/* Main Nav Item with dropdown for multiple accounts */}
                        <NavItem
                          className="group"
                          variant={'default'}
                          // variant={'ghost'}
                          id={item.query}
                          title={item.title}
                          active={isParentActive(item.query)}
                          iconColor={item.iconColor}
                          hotkey={item.hotkey}
                          prepend={
                            <div className="flex items-center gap-2">
                              <Button
                                className="relative mr-2"
                                variant="ghost"
                                typeVariant="inline"
                                sizeVariant="sm"
                                onClick={toggleHandlers[item.id]}
                              >
                                <MonoIcon
                                  type="Dropdown"
                                  className={cn(
                                    'transition-all duration-300',
                                    expandedItems[item.id] ? '' : '-rotate-90',
                                    'absolute text-muted-foreground opacity-0 group-hover:opacity-100'
                                  )}
                                />
                                <MonoIcon
                                  type={item.parentIcon as MonoIconType}
                                  className={cn(
                                    'text-muted-foreground opacity-100 transition-all duration-300 group-hover:opacity-0',
                                    isParentActive(item.query) && item.iconColor
                                  )}
                                />
                              </Button>
                            </div>
                          }
                          append={renderCountBadge(item.id)}
                          onClick={navItemClickHandlers[item.id].main}
                        />

                        {/* Account-specific items */}
                        <CollapsibleContent>
                          <div className="ml-4 mt-1 flex flex-col gap-1">
                            {accounts.map((account) => (
                              <NavItem
                                variant={'default'}
                                // variant={'ghost'}
                                key={`${item.id}-${account.uid}`}
                                title={account.email}
                                iconColor={item.iconColor}
                                active={isChildActive(item.query, account.uid)}
                                prepend={
                                  <MonoIcon
                                    type={item.icon as MonoIconType}
                                    className={cn(
                                      'mr-2 text-muted-foreground transition-all duration-300',
                                      isChildActive(item.query, account.uid) && item.iconColor
                                    )}
                                  />
                                }
                                onClick={accountClickHandlers[item.id][account.uid]}
                              />
                            ))}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </CollapsibleTrigger>
                  </Collapsible>
                ) : (
                  /* Simple Nav Item for single account */
                  <NavItem
                    variant={'default'}
                    // variant={'ghost'}
                    id={item.query}
                    title={item.title}
                    active={isParentActive(item.query)}
                    iconColor={item.iconColor}
                    hotkey={item.hotkey}
                    prepend={
                      <MonoIcon
                        type={item.icon as MonoIconType}
                        className={cn(
                          'mr-2 text-muted-foreground transition-all duration-300',
                          isParentActive(item.query) && item.iconColor
                        )}
                      />
                    }
                    append={renderCountBadge(item.id)}
                    onClick={navItemClickHandlers[item.id].main}
                  />
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default PrimaryInboxNav;
