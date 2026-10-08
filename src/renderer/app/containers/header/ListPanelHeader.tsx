import { isBackendConfigured } from '@/main/api/apiClient';
import draftApi from '@/main/api/draft/draftApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Alert, AlertDescription } from '@/renderer/app/components/ui/alert';
import InboxFilterTabs from '@/renderer/app/containers/filter/InboxFilterTabs';
import PinHeader from '@/renderer/app/containers/header/PinHeader';
import ThreadSelectionToast from '@/renderer/app/containers/list/ThreadSelectionToast';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTrackingAtom } from '@/renderer/app/store/tracking/useTrackingAtom';

interface ListPanelHeaderProps {
  isScrolled: boolean;
}

const ListPanelHeader = React.forwardRef<HTMLDivElement, ListPanelHeaderProps>(
  ({ isScrolled }, ref) => {
    const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
    const { globalSearchQuery } = useGlobalAtom();
    const { t } = useTranslation();

    const { fetchAndSetTrackingHistories } = useTrackingAtom();
    // Use our context hook to get fetchThreadsHandler and isLoading
    const { fetchThreadsHandler, resetThreadsArray } = useThreadList();
    const { updateDraft } = useDraftAtom();
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
            {/* Account-error and offline status live in the titlebar, where they
                stay visible while reading or in Later. */}
          </div>
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
