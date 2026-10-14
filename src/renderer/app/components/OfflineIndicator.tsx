import MonoIcon from '@/renderer/app/components/icons/icons';
import Loader from '@/renderer/app/components/ui/loader';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useOffline } from '@/renderer/app/context/OfflineContext';
import { cn } from '@/renderer/app/lib/utils';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface OfflineIndicatorProps {
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ className }) => {
  const {
    isOnline,
    isOfflineMode,
    queuedActionsCount,
    syncQueuedActions,
    isSyncing,
    hasProAccess
  } = useOffline();
  const { t } = useTranslation();

  useEffect(() => {
    // Only auto-sync for Pro users
    if (hasProAccess && isOnline && !isSyncing && queuedActionsCount > 0 && !isOfflineMode) {
      syncQueuedActions();
    }
  }, [hasProAccess, isOnline, isSyncing, queuedActionsCount, isOfflineMode, syncQueuedActions]);

  // Don't show indicator for non-Pro users when offline, or when online with no queued actions
  if ((!hasProAccess && isOfflineMode) || (!isOfflineMode && queuedActionsCount === 0)) {
    return null;
  }

  const pendingCount = hasProAccess ? queuedActionsCount : 0;
  const label = isSyncing
    ? t('offline.syncing', { defaultValue: 'Syncing…' })
    : isOfflineMode
      ? hasProAccess
        ? t('offline.offline_mode', { defaultValue: 'Offline mode' })
        : t('offline.offline', { defaultValue: 'Offline' })
      : pendingCount > 0
        ? t('offline.pending', { defaultValue: '{{count}} pending', count: pendingCount })
        : t('offline.online', { defaultValue: 'Online' });
  const description = isOfflineMode
    ? t('offline.description_offline', {
        defaultValue:
          "You're offline. Changes you make are saved and sent when the connection is back."
      })
    : t('offline.description_pending', {
        defaultValue: 'Changes made while offline are being sent.'
      });

  // Titlebar chip: same height/radius as the nav tabs, so it reads as status
  // rather than a control. Full explanation lives in the tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-live="polite"
          aria-label={`${label}. ${description}`}
          className={cn(
            'flex h-[29px] cursor-default items-center gap-1.5 rounded-[7px] bg-foreground/[0.06] px-2 text-[12px] text-muted-foreground',
            className
          )}
        >
          {isSyncing ? (
            <Loader className="h-3.5 w-3.5" />
          ) : isOfflineMode ? (
            <MonoIcon type="Offline" className="h-3.5 w-3.5" />
          ) : (
            <MonoIcon type="Cloud" className="h-3.5 w-3.5" />
          )}
          <span className="whitespace-nowrap tabular-nums">{label}</span>
          {isOfflineMode && pendingCount > 0 && (
            <span className="tabular-nums text-muted-foreground/80">{pendingCount}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom" className="max-w-64">
          {description}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};

export default OfflineIndicator;
