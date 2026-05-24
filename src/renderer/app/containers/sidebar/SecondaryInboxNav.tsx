import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/SidebarIcon';
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
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { FC, useCallback, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface SecondaryInboxNavProps {}

const SecondaryInboxNav: FC<SecondaryInboxNavProps> = () => {
  const { accounts: authAccounts, preference } = useAuth();
  const { activeSpace, setActiveAccountsInSpace } = useSpaceAtom();
  const { searchNewQuery, globalSearchQuery, activeLayout } = useGlobalAtom();
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const { threadsMap } = useThreadAtom();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});
  const { t } = useTranslation();

  if (!activeSpace) {
    return null; // or return a loading state or fallback UI
  }

  const accounts = authAccounts.filter((account) => activeSpace.accountUids.includes(account.uid));
  const hasMultipleAccounts = accounts.length > 1;

  // Secondary Gmail categories
  const secondaryItems = useMemo(
    () => [
      // Additional Gmail categories
      {
        id: 'social',
        label: 'SOCIAL',
        query: 'category:social',
        title: t('sidebar.nav.category.social'),
        icon: 'UserGroup',
        parentIcon: 'UserGroup',
        iconColor: 'text-muted-foreground'
      },
      {
        id: 'promotions',
        label: 'PROMOTIONS',
        query: 'category:promotions',
        title: t('sidebar.nav.category.promotions'),
        icon: 'Newsletter',
        parentIcon: 'Newsletter',
        iconColor: 'text-green-500'
      },
      {
        id: 'updates',
        label: 'UPDATES',
        query: 'category:updates',
        title: t('sidebar.nav.category.updates'),
        icon: 'Bell',
        parentIcon: 'Bell',
        iconColor: 'text-yellow-500'
      },
      {
        id: 'forums',
        label: 'FORUMS',
        query: 'category:forums',
        title: t('sidebar.nav.category.forums'),
        icon: 'ChatBubble',
        parentIcon: 'ChatBubble',
        iconColor: 'text-purple-500'
      },
      // Other folders
      {
        id: 'done',
        label: 'NOT_INBOX',
        query: 'NOT in:inbox',
        title: t('sidebar.nav.done'),
        icon: 'CheckCircle',
        parentIcon: 'CheckCircle',
        iconColor: 'text-green-500',
        hotkey: 'G+E'
      },
      {
        id: 'trash',
        label: 'TRASH',
        title: t('sidebar.nav.trash'),
        icon: 'Trash',
        parentIcon: 'Trash',
        query: 'in:trash'
      },
      {
        id: 'spam',
        label: 'SPAM',
        title: t('sidebar.nav.spam'),
        icon: 'AlertCircle',
        parentIcon: 'AlertCircle',
        query: 'in:spam',
        iconColor: 'text-red-500'
      }
    ],
    [t]
  );

  const filteredSecondaryItems = useMemo(() => {
    return secondaryItems.filter((item) => {
      // If display.inbox preferences exist and this specific preference is defined,
      // use the preference value. Otherwise, default to true (show the item)
      return preference.display.inbox[item.id] ?? true;
    });
  }, [preference, secondaryItems]);

  // Toggle expanded state of a main item
  const toggleItemExpanded = useCallback((itemId: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
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

  // Callback to toggle collapsible
  const handleToggleCollapsible = useCallback(() => {
    setIsOtherOpen(!isOtherOpen);
  }, [isOtherOpen]);

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
    for (const item of filteredSecondaryItems) {
      if (item.id === 'done') {
        // For "Done" (NOT in:inbox), we need special handling
        let totalCount = 0;
        for (const accountId of activeSpace.accountUids) {
          // This is for emails that are not in the inbox
          // We need to count threads that don't have the INBOX label
          const allThreads = await DBGetThreadCountByLabels(accountId, []);
          const inboxThreads = await DBGetThreadCountByLabels(accountId, [
            'INBOX' as ValidLabel,
            'UNREAD'
          ]);
          totalCount += allThreads - inboxThreads;
        }
        counts[item.id] = totalCount > 0 ? totalCount : 0;
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
  }, [activeSpace.accountUids, filteredSecondaryItems]);

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

  // Memoized click handlers for each nav item to prevent re-renders
  const createNavClickHandler = useCallback(
    (query: string) => () => handleNavClick(query),
    [handleNavClick]
  );

  const createAccountNavClickHandler = useCallback(
    (accountId: string, query: string) => () => handleAccountNavClick(accountId, query),
    [handleAccountNavClick]
  );

  const createToggleHandler = useCallback(
    (itemId: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleItemExpanded(itemId);
    },
    [toggleItemExpanded]
  );

  if (filteredSecondaryItems.length === 0) {
    return null;
  }

  return (
    <div id="secondary-inboxes" className="flex flex-col gap-3 px-2">
      <Collapsible id="other-folders" open={isOtherOpen} onOpenChange={setIsOtherOpen}>
        <div className="group flex h-10 items-center justify-between text-muted-foreground hover:bg-background/30">
          <CollapsibleTrigger asChild>
            <div className="flex min-w-0 flex-1 items-center text-ellipsis rounded-lg hover:bg-muted">
              <span className="flex flex-1 items-center">
                <Button
                  variant={'ghost'}
                  typeVariant={'icon'}
                  sizeVariant={'sm'}
                  onClick={handleToggleCollapsible}
                >
                  <MonoIcon
                    type={'Dropdown'}
                    className={cn(
                      'transition-all duration-300',
                      isOtherOpen ? '' : '-rotate-90',
                      'text-muted-foreground'
                    )}
                  />
                </Button>
                <span className="text-sm text-muted-foreground">{t('sidebar.other')}</span>
              </span>
            </div>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="flex flex-col gap-1">
            {filteredSecondaryItems.map((item) => (
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
                                onClick={createToggleHandler(item.id)}
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
                          onClick={createNavClickHandler(item.query)}
                        />

                        {/* Account-specific items */}
                        <CollapsibleContent>
                          <div className="ml-4 mt-1 flex flex-col gap-1">
                            {accounts.map((account) => (
                              <NavItem
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
                                onClick={createAccountNavClickHandler(account.uid, item.query)}
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
                    onClick={createNavClickHandler(item.query)}
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

export default SecondaryInboxNav;
