import React, { useMemo, useState, useCallback, useEffect } from 'react';
import InboxIcon from '@/renderer/app/components/icons/InboxIcon';
import type { MaterialSymbol } from 'material-symbols';
import { Send, Star, type LucideIcon } from 'lucide-react';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';

type MailNavItemBase = {
  id: 'inbox' | 'snooze' | 'starred' | 'sent';
  label: string;
  shortcut: string;
} & ({ icon: MaterialSymbol; LucideIcon?: never } | { icon?: never; LucideIcon: LucideIcon });

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
    icon: 'mark_email_unread',
    query: 'category:primary',
    shortcut: 'G I'
  },
  { id: 'snooze', label: 'Later', icon: 'snooze', layout: 'LATER' as const, shortcut: 'G S' },
  { id: 'starred', label: 'Starred', LucideIcon: Star, query: 'is:starred', shortcut: 'G T' },
  { id: 'sent', label: 'Sent', LucideIcon: Send, query: 'in:sent', shortcut: 'G E' }
];

const TITLEBAR_NAV_ICON_SIZE = 15;
const TITLEBAR_NAV_ICON_WEIGHT = 300;
const TITLEBAR_NAV_ICON_GRADE = 0;

const normalizeSearchQuery = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

const queryHasToken = (normalizedQuery: string, token: string) =>
  normalizedQuery.split(' ').includes(token);

const queryMatchesInbox = (normalizedQuery: string) => {
  if (INBOX_CATEGORY_QUERIES.has(normalizedQuery)) return true;
  if (!queryHasToken(normalizedQuery, 'in:inbox')) return false;

  return !normalizedQuery.includes('not in:inbox') && !queryHasToken(normalizedQuery, '-in:inbox');
};

const MailNavTabs = React.memo(() => {
  const { activeLayout, globalSearchQuery, searchNewQuery, setActiveLayout } = useGlobalAtom();
  const { threadsMap } = useThreadAtom();
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
      if (item.layout) {
        setActiveLayout(item.layout);
      } else {
        searchNewQuery(item.query, undefined, false);
      }
    },
    [setActiveLayout, searchNewQuery]
  );

  return (
    <div className="flex items-center gap-[5px]">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activeId;
        const isLoading = item.id === loadingTabId && !isActive;
        return (
          <button
            key={item.id}
            type="button"
            title={`${item.label} (${item.shortcut})`}
            onClick={() => handleTabClick(item)}
            className={cn(
              'no-drag relative flex h-[29px] min-w-[86px] items-center justify-center gap-[6px] rounded-[7px] px-[9px] text-[13px] transition-colors',
              isActive
                ? 'bg-foreground/[0.10] font-normal text-foreground'
                : 'font-light text-muted-foreground/60 hover:text-muted-foreground/90'
            )}
          >
            {item.LucideIcon ? (
              <item.LucideIcon
                className="h-[15px] w-[15px] shrink-0"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            ) : (
              <InboxIcon
                symbol={item.icon}
                size={TITLEBAR_NAV_ICON_SIZE}
                weight={TITLEBAR_NAV_ICON_WEIGHT}
                grade={TITLEBAR_NAV_ICON_GRADE}
              />
            )}
            <span>{item.label}</span>
            {item.id === 'inbox' && inboxUnreadCount > 0 && (
              <span
                className={cn(
                  'min-w-[1ch] text-[12px] tabular-nums',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {inboxUnreadCount}
              </span>
            )}
            {isLoading && (
              <span className="absolute bottom-0.5 left-[11px] right-[11px] h-[2px] animate-pulse rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
});

MailNavTabs.displayName = 'MailNavTabs';
export default MailNavTabs;
