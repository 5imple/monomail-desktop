import { isBackendConfigured } from '@/main/api/apiClient';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Alert, AlertDescription } from '@/renderer/app/components/ui/alert';
import { Button } from '@/renderer/app/components/ui/button';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import InboxFilterTabs from '@/renderer/app/containers/filter/InboxFilterTabs';
import PinHeader from '@/renderer/app/containers/header/PinHeader';
import ThreadSelectionToast from '@/renderer/app/containers/list/ThreadSelectionToast';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useIsSearchView } from '@/renderer/app/hooks/useIsSearchView';
import { useAuth } from '@/renderer/app/context/AuthContext';

import React from 'react';
import { useTranslation } from 'react-i18next';

interface ListPanelHeaderProps {
  isScrolled: boolean;
}

// Queries the titlebar tabs and the sidebar's built-in rows open: a list
// showing one of these is a named view, not a search.
/**
 * Shown only while a search is running. Search itself lives behind ⌘F / ⌘K and
 * in the sidebar, so a named view carries no field; but once a search ran
 * nothing on screen said so — no query in sight, no way out but clicking a
 * view. This strip names the query (click to refine it in the palette) and
 * clears it back to the Inbox.
 */
const ActiveSearchStrip = () => {
  const { t } = useTranslation();
  const { globalSearchQuery, searchNewQuery } = useGlobalAtom();
  const { openDialog } = useDialogs();

  return (
    <div className="no-drag flex items-center gap-1">
      <button
        type="button"
        aria-label={t('thread_list.search_showing', {
          defaultValue: 'Showing results for {{query}}. Edit search',
          query: globalSearchQuery
        })}
        onClick={() =>
          openDialog('commandPalette', { pages: ['SEARCH'], searchQuery: globalSearchQuery })
        }
        className={cn(
          'flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-3 text-left text-[13px] text-foreground transition-colors hover:bg-muted/70',
          ringVariants
        )}
      >
        <MonoIcon type="Search" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">{globalSearchQuery}</span>
      </button>
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
    </div>
  );
};

const ListPanelHeader = React.forwardRef<HTMLDivElement, ListPanelHeaderProps>(
  ({ isScrolled }, ref) => {
    const { sidebarCollapsed } = useSidebarAtom();
    const { globalSearchQuery } = useGlobalAtom();
    const { t } = useTranslation();
    const isSearch = useIsSearchView();
    // "Deleted after 30 days" is Gmail's rule; Microsoft 365 retention is set
    // by the organisation, so the notice shows only when every account is Gmail.
    const { accounts } = useAuth();
    const allGmail = accounts.length > 0 && accounts.every((a) => a.provider !== 'microsoft');

    return (
      <div ref={ref} className="z-10">
        <ThreadSelectionToast />
        {/* The strip under the titlebar, aligned with the rows (px-[10%]): the
            running search, when there is one; otherwise just the breathing
            room above the tabs. It drags the window either way. */}
        <div
          className={cn(
            'drag flex items-center gap-2 px-[10%] pt-3 sm:pt-4',
            isSearch ? 'pb-1' : 'pb-2'
          )}
        >
          {!isElectron && sidebarCollapsed && <SidebarCollapseButton className="mr-2" />}
          {isSearch && (
            <div className="min-w-0 flex-1">
              <ActiveSearchStrip />
            </div>
          )}
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
        {globalSearchQuery === 'in:trash' && allGmail && (
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
