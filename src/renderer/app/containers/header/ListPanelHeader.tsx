import draftApi from '@/main/api/draft/draftApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import UserAvatar from '@/renderer/app/components/avatar/UserAvatar';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Alert, AlertDescription } from '@/renderer/app/components/ui/alert';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import OfflineIndicator from '@/renderer/app/components/OfflineIndicator';
import FilterOptionDropdownMenu from '@/renderer/app/containers/filter/FilterOptionDropdownMenu';
import InboxFilterTabs from '@/renderer/app/containers/filter/InboxFilterTabs';
import PinHeader from '@/renderer/app/containers/header/PinHeader';
import ThreadSelectionToast from '@/renderer/app/containers/list/ThreadSelectionToast';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useSyncHistory } from '@/renderer/app/context/SyncHistoryContext';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { parseQueryFieldLabel } from '@/renderer/app/lib/queryUtils';
import { cn } from '@/renderer/app/lib/utils';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useDefaultNav, useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';

import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTrackingAtom } from '@/renderer/app/store/tracking/useTrackingAtom';

interface ListPanelHeaderProps {
  isScrolled: boolean;
}

const ListPanelHeader = React.forwardRef<HTMLDivElement, ListPanelHeaderProps>(
  ({ isScrolled }, ref) => {
    const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
    const { globalSearchQuery, calendarDisplayPanel, setCalendarDisplayPanel } = useGlobalAtom();
    const { member, accounts } = useAuth();
    const { t } = useTranslation();

    const { fetchAndSetTrackingHistories } = useTrackingAtom();
    // Use our context hook to get fetchThreadsHandler and isLoading
    const { fetchThreadsHandler, resetThreadsArray, loadingStatus } = useThreadList();
    const { aggregatedSyncState } = useSyncHistory();
    const { updateDraft } = useDraftAtom();
    const { openDialog } = useDialogs();
    const { labelsMapByAccount } = useLabelAtom();

    // Get default nav items
    const defaultNavItems = useDefaultNav();

    // Account error detection logic
    const accountsWithErrors = useMemo(() => {
      return accounts.filter((account) => {
        // Don't show label-related errors during initial load when labels are still loading
        const hasLabelsLoaded = Object.keys(labelsMapByAccount).length > 0;
        const hasLabelError = hasLabelsLoaded && !labelsMapByAccount[account.uid];

        return (
          hasLabelError ||
          account.isExpired ||
          !account.scopes.some((scope) => scope.includes('https://mail.google.com'))
        );
      });
    }, [accounts, labelsMapByAccount]);

    // Get account status tooltip
    const getAccountStatusTooltip = useCallback(() => {
      if (accountsWithErrors.length === 0) return '';

      const errorMessagesSet = new Set<string>();
      const hasLabelsLoaded = Object.keys(labelsMapByAccount).length > 0;

      accountsWithErrors.forEach((account) => {
        if (account.isExpired) {
          errorMessagesSet.add(t('tooltips.account_status.authentication_expired'));
        } else if (hasLabelsLoaded && !labelsMapByAccount[account.uid]) {
          errorMessagesSet.add(t('tooltips.account_status.too_many_requests'));
        } else if (!account.scopes.some((scope) => scope.includes('https://mail.google.com'))) {
          errorMessagesSet.add(t('tooltips.account_status.missing_gmail_permissions'));
        } else {
          errorMessagesSet.add(t('tooltips.account_status.requires_reconnecting'));
        }
      });

      return Array.from(errorMessagesSet).join('\n');
    }, [accountsWithErrors, labelsMapByAccount, t]);

    // Handle account reconnection
    const handleAccountReconnectClick = useCallback(() => {
      openDialog('preference', { defaultPage: 'integration' });
    }, [openDialog]);

    // Define Gmail categories for title lookup
    const gmailCategories = useMemo(
      () => [
        {
          id: 'category:primary',
          query: 'category:primary',
          title: t('sidebar.nav.category.inbox')
        },
        {
          id: 'in:all',
          query: 'in:all -in:trash',
          title: t('sidebar.nav.all_mail')
        },
        {
          id: 'category:social',
          query: 'category:social',
          title: t('sidebar.nav.category.social')
        },
        {
          id: 'category:promotions',
          query: 'category:promotions',
          title: t('sidebar.nav.category.promotions')
        },
        {
          id: 'category:updates',
          query: 'category:updates',
          title: t('sidebar.nav.category.updates')
        },
        { id: 'category:forums', query: 'category:forums', title: t('sidebar.nav.category.forums') }
      ],
      [t]
    );

    // Determine active item using a comprehensive approach
    const activeItem = useMemo(() => {
      // First, check if it matches a default mail folder
      const defaultMatch = defaultNavItems.find((nav) => nav.query === globalSearchQuery);
      if (defaultMatch) return defaultMatch;

      // Check if it matches a Gmail category
      const categoryMatch = gmailCategories.find(
        (category) => category.query === globalSearchQuery
      );
      if (categoryMatch) return categoryMatch;

      // For custom searches or other queries
      if (globalSearchQuery) {
        // Try to extract label or category from query if present
        const { field: prefix, label: value } = parseQueryFieldLabel(globalSearchQuery, true);
        if (prefix && value) {
          if (prefix === 'in' || prefix === 'is' || prefix === 'category') {
            return {
              id: globalSearchQuery,
              query: globalSearchQuery,
              title: value.charAt(0).toUpperCase() + value.slice(1)
            };
          }
        }

        // Generic search query
        return {
          id: 'search',
          query: globalSearchQuery,
          title: t('header.list.searched')
        };
      }

      // Fallback case
      return null;
    }, [globalSearchQuery, defaultNavItems, gmailCategories, t]);

    const handleRefresh = async () => {
      resetThreadsArray();
      fetchThreadsHandler(); // Force refresh
      fetchAndSetTrackingHistories();
      try {
        const response = await draftApi.getDrafts();
        // The response now contains drafts organized by account ID
        // e.g., response = { drafts: { "account-id-1": [...drafts], "account-id-2": [...drafts] } }

        // Process drafts for all accounts in the response
        if (response?.drafts) {
          // Iterate through each account's drafts
          for (const [accountId, drafts] of Object.entries(response.drafts)) {
            // Process each draft for this account
            for await (const draft of drafts) {
              const responseDraft = MonoDraft.fromPlainObject(draft);
              await updateDraft(accountId, responseDraft, false, true);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    // Newton-style header: hero title at text-2xl tracking-tight,
    // a quiet mono uppercase scope label above, calm muted-foreground
    // toolbar buttons on the right. The title block uses more vertical
    // breathing room (px-6 pt-4) than the original compact toolbar so
    // the inbox feels editorial rather than dashboard-y.
    const scopeLabel = activeItem?.title
      ? activeItem.title
      : globalSearchQuery
        ? t('header.list.searched')
        : t('header.list.no_inbox_selected');

    return (
      <div ref={ref} className="z-10">
        <ThreadSelectionToast />
        <div className="drag flex items-end gap-3 px-6 pb-3 pt-4 sm:pt-5">
          <div
            className={cn(
              'flex min-w-0 flex-1 items-end gap-3',
              // Only add transition if not loading
              !sidebarLoading && 'transition-all duration-200',
              sidebarCollapsed && isElectron ? 'translate-x-[88px]' : ''
            )}
          >
            {!isElectron && sidebarCollapsed && <SidebarCollapseButton className="mr-2" />}

            <div className="min-w-0">
              <p className="mb-0.5 line-clamp-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {globalSearchQuery && activeItem?.id !== 'search' ? 'Inbox' : 'Newton'}
              </p>
              <h1 className="line-clamp-1 text-[22px] font-medium tracking-tight text-foreground sm:text-[26px]">
                {scopeLabel}
              </h1>
            </div>

            {accountsWithErrors.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    sizeVariant="sm"
                    className="mb-1 h-6 w-6 p-0 hover:bg-destructive/10"
                    onClick={handleAccountReconnectClick}
                  >
                    <MonoIcon type="AlertCircle" className="h-4 w-4 text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs whitespace-pre-wrap">
                  {getAccountStatusTooltip()}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="no-drag mb-1 ml-auto flex items-center gap-1.5">
            <Button
              disabled={loadingStatus === 'LOADING'}
              variant={'ghost'}
              sizeVariant={'sm'}
              className="mb-1 text-muted-foreground hover:text-foreground"
              onClick={handleRefresh}
              tooltip={t('header.list.refresh') || 'Refresh'}
            >
              {aggregatedSyncState.isSyncing || loadingStatus === 'LOADING' ? (
                <Loader />
              ) : (
                <MonoIcon type={'RotateCcw'} className="h-3.5 w-3.5" />
              )}
            </Button>
            <OfflineIndicator />

            <UserAvatar user={member} />

            <Button
              onClick={() => setCalendarDisplayPanel(!calendarDisplayPanel)}
              variant="ghost"
              typeVariant="icon"
              tooltip={
                calendarDisplayPanel ? t('calendar.hide_calendar') : t('calendar.show_calendar')
              }
              sizeVariant="sm"
            >
              <MonoIcon type="GoogleCalendar" className="text-muted-foreground" />
            </Button>

            <FilterOptionDropdownMenu />
          </div>
        </div>
        {/* Newton filter tabs — quick All / Unread / With attachments
            shortcuts under the title. The full FilterOptionDropdownMenu
            stays in the toolbar above for advanced filtering. */}
        <InboxFilterTabs />
        <div id="pin-header" className={cn('no-drag flex items-center px-6')}>
          <PinHeader />
        </div>
        {globalSearchQuery === 'in:trash' && (
          <div className={cn('no-drag p-2 transition-all', isScrolled && 'border-b shadow-sm')}>
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
