import React from 'react';
import { useTranslation } from 'react-i18next';
import { useThreadFilter } from '@/renderer/app/store/thread/useThreadFilter';
import { cn } from '@/renderer/app/lib/utils';

/**
 * Newton-style quick-filter tabs that live under the inbox title.
 *
 *   [All]   Unread   With attachments
 *     ───
 *
 * Three quick filters (All / Unread / With attachments) cover the most
 * common triage gestures with a single click. The full FilterOptionDropdownMenu
 * still exists in the header toolbar for advanced filtering (date ranges,
 * calendar invitations, specific labels, etc.); the tabs are an opinionated
 * shortcut layer on top.
 *
 * The tabs read + mutate the same `activeFilters` atom the dropdown uses,
 * so toggling between dropdown and tabs stays coherent.
 */
const InboxFilterTabs = React.memo(() => {
  const { t } = useTranslation();
  const { activeFilters, setActiveFilters } = useThreadFilter();

  // Mode resolution — the tab that should appear "active" is derived
  // entirely from the activeFilters atom so external mutations (from the
  // dropdown menu, or programmatic searches) move the underline.
  const mode = (() => {
    if (activeFilters.length === 0) return 'all';
    const onlyUnread =
      activeFilters.length === 1 &&
      activeFilters[0].type === 'read_status' &&
      activeFilters[0].value === 'unread' &&
      activeFilters[0].operator === 'is';
    if (onlyUnread) return 'unread';
    const onlyAttachments =
      activeFilters.length === 1 &&
      activeFilters[0].type === 'attachment' &&
      activeFilters[0].operator === 'has';
    if (onlyAttachments) return 'attachments';
    return 'custom'; // dropdown set a more complex filter — no tab highlights
  })();

  const tabs: { id: 'all' | 'unread' | 'attachments'; label: string }[] = [
    { id: 'all', label: t('filter.all', { defaultValue: 'All' }) },
    { id: 'unread', label: t('filter.unread', { defaultValue: 'Unread' }) },
    {
      id: 'attachments',
      label: t('filter.with_attachments', { defaultValue: 'With attachments' })
    }
  ];

  const onPick = (id: 'all' | 'unread' | 'attachments') => {
    if (id === 'all') {
      setActiveFilters([]);
    } else if (id === 'unread') {
      setActiveFilters([{ type: 'read_status', value: 'unread', operator: 'is' }]);
    } else {
      setActiveFilters([{ type: 'attachment', value: undefined, operator: 'has' }]);
    }
  };

  return (
    <nav aria-label="Inbox filters" className="no-drag flex items-center gap-1 px-[10%] text-sm">
      {tabs.map((tab) => {
        const active = mode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onPick(tab.id)}
            className={cn(
              'relative px-2 py-2.5 font-medium tracking-tight transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="px-1.5">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
});

InboxFilterTabs.displayName = 'InboxFilterTabs';
export default InboxFilterTabs;
