import { isBackendConfigured } from '@/main/api/apiClient';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Alert, AlertDescription } from '@/renderer/app/components/ui/alert';
import { Button } from '@/renderer/app/components/ui/button';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import InboxFilterTabs from '@/renderer/app/containers/filter/InboxFilterTabs';
import PinHeader from '@/renderer/app/containers/header/PinHeader';
import ThreadSelectionToast from '@/renderer/app/containers/list/ThreadSelectionToast';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useCustomSidebarAtom } from '@/renderer/app/store/space/useCustomSidebarAtom';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface ListPanelHeaderProps {
  isScrolled: boolean;
}

// Queries the titlebar tabs and the sidebar's built-in rows open: a list
// showing one of these is a named view, not a search.
const NAMED_VIEW_QUERIES = new Set([
  'category:primary',
  'in:inbox',
  'is:starred',
  'in:sent',
  'in:draft',
  'in:all -in:trash',
  'not in:inbox',
  'in:trash',
  'in:spam',
  'is:important',
  'is:snoozed',
  'category:social',
  'category:promotions',
  'category:updates',
  'category:forums'
]);

const normalizeQuery = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The search field at the top of the list. Search used to live only in the
 * sidebar (gone when it's collapsed) and behind ⌘F / ⌘K, and once a search
 * was running nothing on screen said so — no query in sight, no way out but
 * clicking a view. Now the field shows the query being viewed, with a clear
 * button back to the Inbox; a named view (Inbox, Sent, a sidebar label…)
 * just shows the placeholder.
 */
const ListSearchBar = () => {
  const { t } = useTranslation();
  const { globalSearchQuery, searchNewQuery } = useGlobalAtom();
  const { openDialog } = useDialogs();
  const { getCurrentSidebarState } = useCustomSidebarAtom();

  const sidebarQueries = useMemo(() => {
    const state = getCurrentSidebarState();
    return new Set(
      Object.values(state?.items ?? {})
        .map((item) => (item.query ? normalizeQuery(item.query) : ''))
        .filter(Boolean)
    );
  }, [getCurrentSidebarState]);

  const normalized = normalizeQuery(globalSearchQuery);
  const isSearch =
    normalized.length > 0 && !NAMED_VIEW_QUERIES.has(normalized) && !sidebarQueries.has(normalized);
  const placeholder = t('thread_list.search_placeholder', { defaultValue: 'Search mail' });

  return (
    <div className="no-drag flex items-center gap-1">
      <button
        type="button"
        aria-label={
          isSearch
            ? t('thread_list.search_showing', {
                defaultValue: 'Showing results for {{query}}. Edit search',
                query: globalSearchQuery
              })
            : placeholder
        }
        onClick={() =>
          openDialog('commandPalette', {
            pages: ['SEARCH'],
            // The current search comes along to be refined; a named view
            // starts a fresh one.
            searchQuery: isSearch ? globalSearchQuery : ''
          })
        }
        className={cn(
          'group flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-3 text-left text-[13px] transition-colors hover:bg-muted/70',
          ringVariants,
          isSearch ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <MonoIcon type="Search" className="h-4 w-4 shrink-0" />
        <span className={cn('min-w-0 flex-1 truncate', isSearch && 'font-medium')}>
          {isSearch ? globalSearchQuery : placeholder}
        </span>
        {!isSearch && (
          <ShortcutKeyboard
            variant="flat"
            sizeVariant="xs"
            shortcut="MOD+F"
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </button>
      {isSearch && (
        <Button
          variant="ghost"
          sizeVariant="sm"
          typeVariant="icon"
          className="text-muted-foreground hover:text-foreground"
          tooltip={t('thread_list.clear_search', { defaultValue: 'Clear search' })}
          onClick={() => searchNewQuery('category:primary', undefined, false)}
        >
          <MonoIcon type="X" />
        </Button>
      )}
    </div>
  );
};

const ListPanelHeader = React.forwardRef<HTMLDivElement, ListPanelHeaderProps>(
  ({ isScrolled }, ref) => {
    const { sidebarCollapsed } = useSidebarAtom();
    const { globalSearchQuery } = useGlobalAtom();
    const { t } = useTranslation();

    return (
      <div ref={ref} className="z-10">
        <ThreadSelectionToast />
        {/* The strip under the titlebar: the search field, aligned with the
            rows (px-[10%]). The rest of it still drags the window. */}
        <div className="drag flex items-center gap-2 px-[10%] pb-1 pt-3 sm:pt-4">
          {!isElectron && sidebarCollapsed && <SidebarCollapseButton className="mr-2" />}
          <div className="min-w-0 flex-1">
            <ListSearchBar />
          </div>
          {/* Account-error and offline status live in the titlebar, where they
              stay visible while reading or in Later. */}
        </div>
        {/* Pins are stored with the backend; without one they can't be saved. */}
        {isBackendConfigured() && (
          <div id="pin-header" className={cn('no-drag flex items-center px-[10%]')}>
            <PinHeader />
          </div>
        )}
        <InboxFilterTabs />
        {globalSearchQuery === 'in:trash' && (
          <div
            className={cn(
              'no-drag px-[10%] pb-2 pt-2 transition-all',
              isScrolled && 'border-b shadow-sm'
            )}
          >
            <Alert className="">
              {<MonoIcon type={'AlertCircle'} className="h-4 w-4" />}
              <AlertDescription>{t('header.list.trash_alert')}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    );
  }
);
ListPanelHeader.displayName = 'ListPanelHeader';

export default ListPanelHeader;
