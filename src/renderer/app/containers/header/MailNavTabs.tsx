import React, { useMemo } from 'react';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';

const NAV_ITEMS = [
  { id: 'inbox', label: 'Inbox', icon: 'Inbox' as const, query: 'in:inbox' },
  { id: 'snooze', label: 'Snooze', icon: 'Clock' as const, query: 'is:snoozed' },
  { id: 'starred', label: 'Starred', icon: 'Star' as const, query: 'is:starred' },
  { id: 'sent', label: 'Sent', icon: 'Send' as const, query: 'in:sent' },
];

const MailNavTabs = React.memo(() => {
  const { globalSearchQuery, searchNewQuery } = useGlobalAtom();
  const { threadsMap } = useThreadAtom();

  const inboxUnreadCount = useMemo(
    () =>
      Object.values(threadsMap).filter(
        (t) => t && t.labelIds.includes('INBOX') && t.labelIds.includes('UNREAD')
      ).length,
    [threadsMap]
  );

  const activeId = NAV_ITEMS.find((item) => item.query === globalSearchQuery)?.id ?? null;

  return (
    <div className="flex items-center gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => searchNewQuery(item.query)}
            className={cn(
              'no-drag flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
              isActive
                ? 'bg-foreground/[0.13] font-semibold text-foreground'
                : 'font-medium text-muted-foreground/70 hover:text-foreground'
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
