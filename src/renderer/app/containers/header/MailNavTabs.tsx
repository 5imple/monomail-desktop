import React, { useMemo } from 'react';
import MonoIcon, { type MonoIconType } from '@/renderer/app/components/icons/icons';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';

type MailNavItem = {
  id: 'inbox' | 'snooze' | 'starred' | 'sent';
  label: string;
  icon: MonoIconType;
} & ({ query: string; layout?: never } | { query?: never; layout: 'LATER' });

const INBOX_CATEGORY_QUERIES = new Set([
  'category:primary',
  'category:social',
  'category:promotions',
  'category:updates',
  'category:forums'
]);

const NAV_ITEMS: MailNavItem[] = [
  { id: 'inbox', label: 'Inbox', icon: 'Inbox' as const, query: 'category:primary' },
  { id: 'snooze', label: 'Snooze', icon: 'Clock' as const, layout: 'LATER' as const },
  { id: 'starred', label: 'Starred', icon: 'Star' as const, query: 'is:starred' },
  { id: 'sent', label: 'Sent', icon: 'Send' as const, query: 'in:sent' }
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
  const { activeLayout, globalSearchQuery, searchNewQuery, setActiveLayout } = useGlobalAtom();
  const { threadsMap } = useThreadAtom();

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

  return (
    <div className="flex items-center gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.layout) {
                setActiveLayout(item.layout);
                return;
              }

              searchNewQuery(item.query, undefined, false);
            }}
            className={cn(
              'no-drag flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
              isActive
                ? 'bg-foreground/[0.13] font-semibold text-foreground'
                : 'font-medium text-muted-foreground/90 hover:bg-foreground/[0.06] hover:text-foreground'
            )}
          >
            <MonoIcon type={item.icon} className="h-3.5 w-3.5 shrink-0" />
            <span>{item.label}</span>
            {item.id === 'inbox' && inboxUnreadCount > 0 && (
              <span
                className={cn(
                  'min-w-[1ch] font-mono text-xs tabular-nums',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {inboxUnreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

MailNavTabs.displayName = 'MailNavTabs';
export default MailNavTabs;
