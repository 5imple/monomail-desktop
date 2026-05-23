import draftApi from '@/main/api/draft/draftApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Alert, AlertDescription } from '@/renderer/app/components/ui/alert';
import { Button } from '@/renderer/app/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import OfflineIndicator from '@/renderer/app/components/OfflineIndicator';
import PinHeader from '@/renderer/app/containers/header/PinHeader';
import ThreadSelectionToast from '@/renderer/app/containers/list/ThreadSelectionToast';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
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
    const { globalSearchQuery } = useGlobalAtom();
    const { accounts } = useAuth();
    const { t } = useTranslation();

    const { fetchAndSetTrackingHistories } = useTrackingAtom();
    // Use our context hook to get fetchThreadsHandler and isLoading
    const { fetchThreadsHandler, resetThreadsArray } = useThreadList();
    const { updateDraft } = useDraftAtom();
    const { openDialog } = useDialogs();
    const { labelsMapByAccount } = useLabelAtom();

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
            <OfflineIndicator />
          </div>
        </div>
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
