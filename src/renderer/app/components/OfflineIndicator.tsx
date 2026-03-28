import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { useOffline } from '@/renderer/app/context/OfflineContext';
import { cn } from '@/renderer/app/lib/utils';
import React, { useEffect } from 'react';
import { toast } from 'sonner';

interface OfflineIndicatorProps {
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ className }) => {
  const {
    isOnline,
    isOfflineMode,
    queuedActionsCount,
    syncQueuedActions,
    clearQueue,
    isSyncing,
    hasProAccess
  } = useOffline();

  useEffect(() => {
    // Only auto-sync for Pro users
    if (hasProAccess && isOnline && !isSyncing && queuedActionsCount > 0 && !isOfflineMode) {
      syncQueuedActions();
    }
  }, [hasProAccess, isOnline, isSyncing, queuedActionsCount, isOfflineMode, syncQueuedActions]);

  const handleManualSync = () => {
    if (!hasProAccess) {
      toast.error('Offline sync is only available for Pro users');
      return;
    }
    if (!isOnline) {
      toast.error('Cannot sync while offline');
      return;
    }
    syncQueuedActions();
  };

  const handleClearQueue = () => {
    if (!hasProAccess) {
      toast.error('Offline queue management is only available for Pro users');
      return;
    }
    clearQueue();
    toast.info('Offline queue cleared');
  };

  // Don't show indicator for non-Pro users when offline, or when online with no queued actions
  if ((!hasProAccess && isOfflineMode) || (!isOfflineMode && queuedActionsCount === 0)) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex h-7 items-center gap-1 rounded-md border px-2 py-1 text-xs shadow-sm',
        queuedActionsCount > 0 && 'pr-1',
        className
      )}
    >
      {isSyncing ? (
        <Loader className="h-4 w-4" />
      ) : isOfflineMode ? (
        <MonoIcon type="Offline" className="h-4 w-4" />
      ) : (
        <MonoIcon type="Cloud" className="h-4 w-4" />
      )}
      <div className="flex items-center gap-2 overflow-hidden text-ellipsis">
        {isSyncing ? (
          <span className="whitespace-nowrap">Syncing...</span>
        ) : isOfflineMode ? (
          <span className="whitespace-nowrap">{hasProAccess ? 'Offline mode' : 'Offline'}</span>
        ) : (
          <span className="whitespace-nowrap">Online</span>
        )}

        {hasProAccess && queuedActionsCount > 0 && (
          <>
            <span className="flex h-5 min-w-5 items-center justify-center whitespace-nowrap rounded border bg-muted p-0.5 text-xs shadow-sm">
              {queuedActionsCount}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;
