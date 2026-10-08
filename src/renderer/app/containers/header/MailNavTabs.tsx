import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Clock3, Inbox, Send, Star, type LucideIcon } from 'lucide-react';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import { useTranslation } from 'react-i18next';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { cn } from '@/renderer/app/lib/utils';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';

type MailNavItemBase = {
  id: 'inbox' | 'snooze' | 'starred' | 'sent';
  label: string;
  Icon: LucideIcon;
  // Must match the go-to hotkey in navigationCommands (ShortcutKeyboard splits
  // on '+'); omit when none exists. Inbox has none: G+I goes to is:important.
  shortcut?: string;
};

type MailNavItem = MailNavItemBase &
  ({ query: string; layout?: never } | { query?: never; layout: 'LATER' });

const INBOX_CATEGORY_QUERIES = new Set([
  'category:primary',
  'category:social',
  'category:promotions',
  'category:updates',
  'category:forums'
]);

const NAV_ITEMS: MailNavItem[] = [
  {
    id: 'inbox',
    label: 'Inbox',
    Icon: Inbox,
    query: 'category:primary'
  },
  { id: 'snooze', label: 'Later', Icon: Clock3, layout: 'LATER' as const },
  { id: 'starred', label: 'Starred', Icon: Star, query: 'is:starred', shortcut: 'G+S' },
  { id: 'sent', label: 'Sent', Icon: Send, query: 'in:sent', shortcut: 'G+T' }
];

const normalizeSearchQuery = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

const queryHasToken = (normalizedQuery: string, token: string) =>
  normalizedQuery.split(' ').includes(token);

const queryMatchesInbox = (normalizedQuery: string) => {
  if (INBOX_CATEGORY_QUERIES.has(normalizedQuery)) return true;
  if (!queryHasToken(normalizedQuery, 'in:inbox')) return false;

  return !normalizedQuery.includes('not in:inbox') && !queryHasToken(normalizedQuery, '-in:inbox');
};

const MailNavTabs = React.memo(() => {
  const { t } = useTranslation();
  const { activeLayout, globalSearchQuery, searchNewQuery, setActiveLayout } = useGlobalAtom();
  const { threadsMap, setActiveThreadId, setSelectedThreads } = useThreadAtom();
  const { activeSpace, setActiveAccountsInSpace } = useSpaceAtom();
  const { sidebarCollapsed } = useSidebarAtom();
  const [loadingTabId, setLoadingTabId] = useState<string | null>(null);

  const inboxUnreadCount = useMemo(
    () =>
      Object.values(threadsMap).filter(
        (t) => t && t.labelIds.includes('INBOX') && t.labelIds.includes('UNREAD')
      ).length,
    [threadsMap]
  );

  const activeId = useMemo(() => {
    if (activeLayout === 'LATER') return 'snooze';
    if (activeLayout !== 'MAIL') return null;

    const normalizedQuery = normalizeSearchQuery(globalSearchQuery);

    if (queryHasToken(normalizedQuery, 'is:snoozed')) return 'snooze';
    if (queryHasToken(normalizedQuery, 'is:starred')) return 'starred';
    if (queryHasToken(normalizedQuery, 'in:sent')) return 'sent';
    if (queryMatchesInbox(normalizedQuery)) return 'inbox';

    return null;
  }, [activeLayout, globalSearchQuery]);

  useEffect(() => {
    if (activeId) setLoadingTabId(null);
  }, [activeId]);

  const handleTabClick = useCallback(
    (item: MailNavItem) => {
      setLoadingTabId(item.id);
      setTimeout(() => setLoadingTabId(null), 1500);
      // Tabs are all-account views, like the sidebar's unified items. Without
      // this, a single-account filter picked in the sidebar silently stayed on.
      if (activeSpace) setActiveAccountsInSpace(activeSpace.accountUids);
      if (item.layout) {
        // Later replaces the list and reader, so drop the open thread and the
        // selection like searchNewQuery does — otherwise E / S / Backspace
        // would act on mail that's no longer on screen.
        setActiveThreadId(null);
        setSelectedThreads([]);
        setActiveLayout(item.layout);
      } else {
        searchNewQuery(item.query, undefined, false);
      }
    },
    [
      setActiveLayout,
      searchNewQuery,
      activeSpace,
      setActiveAccountsInSpace,
      setActiveThreadId,
      setSelectedThreads
    ]
  );

  return (
    <nav
      aria-label={t('layout.titlebar.mail_views', { defaultValue: 'Mail views' })}
      className="flex items-center gap-[5px]"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activeId;
        const isLoading = item.id === loadingTabId && !isActive;
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleTabClick(item)}
                className={cn(
                  'no-drag relative flex h-[29px] min-w-[86px] items-center justify-center gap-[6px] rounded-[7px] px-[9px] text-[13px] transition-colors',
                  ringVariants,
                  // With the sidebar expanded its toggle sits where the tabs
                  // start in a narrow window, so they shrink to icons there.
                  !sidebarCollapsed && 'max-[860px]:min-w-0',
                  isActive
                    ? // The expanded compose covers the view, so no tab is "current".
                      'bg-foreground/[0.10] font-normal text-foreground [body:has([data-compose-expanded=true])_&]:bg-transparent'
                    : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'
                )}
              >
                <item.Icon
                  className="h-[15px] w-[15px] shrink-0"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className={cn(!sidebarCollapsed && 'max-[860px]:sr-only')}>{item.label}</span>
                {item.id === 'inbox' && inboxUnreadCount > 0 && (
                  <span
                    className={cn(
                      // Two-digit slot so the centred group doesn't shift as the count changes.
                      'min-w-[2ch] text-left text-[12px] tabular-nums',
                      isActive ? 'text-foreground' : 'text-muted-foreground/80'
                    )}
                  >
                    {inboxUnreadCount}
                  </span>
                )}
                {isLoading && (
                  <span className="absolute bottom-0.5 left-[11px] right-[11px] h-[2px] animate-pulse rounded-full bg-foreground/30" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="bottom">
                <div className="text-start">
                  <div>{item.label}</div>
                  {item.shortcut && (
                    <div className="mt-0.5">
                      <ShortcutKeyboard variant="flat" shortcut={item.shortcut} />
                    </div>
                  )}
                </div>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        );
      })}
    </nav>
  );
});

MailNavTabs.displayName = 'MailNavTabs';
export default MailNavTabs;
