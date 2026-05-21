import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/renderer/app/components/ui/collapsible';
import NavItem from '@/renderer/app/containers/sidebar/NavItem';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { FC, useCallback, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface CategoryInboxNavProps {}

const CategoryInboxNav: FC<CategoryInboxNavProps> = () => {
  const { accounts: authAccounts } = useAuth();
  const { activeSpace, setActiveAccountsInSpace } = useSpaceAtom();
  const { searchNewQuery, globalSearchQuery, activeLayout } = useGlobalAtom();
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const { t } = useTranslation();

  if (!activeSpace) {
    return null; // or return a loading state or fallback UI
  }

  const accounts = authAccounts.filter((account) => activeSpace.accountUids.includes(account.uid));
  const hasMultipleAccounts = accounts.length > 1;

  // Gmail categories
  const gmailCategories = useMemo(
    () => [
      {
        id: 'category:primary',
        query: 'category:primary',
        title: t('sidebar.nav.category.inbox'),
        icon: 'Inbox',
        parentIcon: 'InboxStack',
        iconColor: 'text-primary'
      },
      {
        id: 'category:social',
        query: 'category:social',
        title: t('sidebar.nav.category.social'),
        icon: 'UserGroup',
        parentIcon: 'UserGroup',
        iconColor: 'text-muted-foreground'
      },
      {
        id: 'category:promotions',
        query: 'category:promotions',
        title: t('sidebar.nav.category.promotions'),
        icon: 'Newsletter',
        parentIcon: 'Newsletter',
        iconColor: 'text-green-500'
      },
      {
        id: 'category:updates',
        query: 'category:updates',
        title: t('sidebar.nav.category.updates'),
        icon: 'Bell',
        parentIcon: 'Bell',
        iconColor: 'text-yellow-500'
      },
      {
        id: 'category:forums',
        query: 'category:forums',
        title: t('sidebar.nav.category.forums'),
        icon: 'ChatBubble',
        parentIcon: 'ChatBubble',
        iconColor: 'text-purple-500'
      }
    ],
    [t]
  );

  // Toggle expanded state of a main item
  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

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

  return (
    <div id="gmail-categories" className="my-2 flex flex-col gap-3 px-2">
      <Collapsible id="categories-list" open={isCategoriesOpen} onOpenChange={setIsCategoriesOpen}>
        <div className="group flex h-10 items-center justify-between text-muted-foreground hover:bg-background/30">
          <CollapsibleTrigger asChild>
            <div className="flex min-w-0 flex-1 items-center text-ellipsis rounded-lg hover:bg-muted">
              <span className="flex flex-1 items-center">
                <Button
                  variant={'ghost'}
                  typeVariant={'icon'}
                  sizeVariant={'sm'}
                  onClick={() => setIsCategoriesOpen(!isCategoriesOpen)}
                >
                  <MonoIcon
                    type={'Dropdown'}
                    className={cn(
                      'transition-all duration-300',
                      isCategoriesOpen ? '' : '-rotate-90',
                      'text-muted-foreground'
                    )}
                  />
                </Button>
                <span className="text-sm text-muted-foreground">{t('sidebar.inboxes')}</span>
              </span>
            </div>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="flex flex-col gap-1">
            {gmailCategories.map((item) => (
              <div key={item.id}>
                {hasMultipleAccounts ? (
                  <Collapsible open={expandedItems[item.id]}>
                    <CollapsibleTrigger asChild>
                      <div className="flex w-full flex-col">
                        {/* Main Nav Item with dropdown for multiple accounts */}
                        <NavItem
                          className="group"
                          variant={'ghost'}
                          id={item.id}
                          title={item.title}
                          active={isParentActive(item.query)}
                          iconColor={item.iconColor}
                          prepend={
                            <div className="flex items-center gap-2">
                              <Button
                                className="relative mr-2"
                                variant="ghost"
                                typeVariant="inline"
                                sizeVariant="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleItemExpanded(item.id);
                                }}
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
                          onClick={() => handleNavClick(item.query)}
                        />

                        {/* Account-specific items */}
                        <CollapsibleContent>
                          <div className="ml-4 mt-1 flex flex-col gap-1">
                            {accounts.map((account) => (
                              <NavItem
                                variant={'ghost'}
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
                                onClick={() => handleAccountNavClick(account.uid, item.query)}
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
                    variant={'ghost'}
                    id={item.id}
                    title={item.title}
                    active={isParentActive(item.query)}
                    iconColor={item.iconColor}
                    prepend={
                      <MonoIcon
                        type={item.icon as MonoIconType}
                        className={cn(
                          'mr-2 text-muted-foreground transition-all duration-300',
                          isParentActive(item.query) && item.iconColor
                        )}
                      />
                    }
                    onClick={() => handleNavClick(item.query)}
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

export default CategoryInboxNav;
