import mailApi from '@/main/api/mail/mailApi';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';
import electronApi from '@/renderer/app/lib/electronApi';
import {
  getCachedBillingInfo,
  type IMonoBillingInfo,
  type SubscriptionStatus,
  type UserPlan
} from '@/renderer/app/store/account/useBillingAtom';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface OfflineAction {
  id: string;
  type: 'THREAD_LABEL_ACTION';
  timestamp: number;
  data: {
    uid: string;
    threadIds: string[];
    addLabels?: string[];
    removeLabels?: string[];
  };
}

interface OfflineContextType {
  isOnline: boolean;
  isOfflineMode: boolean;
  queuedActionsCount: number;
  isSyncing: boolean;
  hasProAccess: boolean;
  queueAction: (action: Omit<OfflineAction, 'id' | 'timestamp'>) => Promise<void>;
  syncQueuedActions: () => Promise<void>;
  clearQueue: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);
OfflineContext.displayName = 'OfflineContext';

const OFFLINE_QUEUE_KEY = 'offline_actions_queue';

// Plan product IDs for different environments
const PLAN_PRODUCT_IDS = {
  sandbox: {
    plus: '467649',
    pro: '467672'
  },
  production: {
    plus: '500803',
    pro: '500804'
  }
};

// Utility functions to determine user plan and subscription status from cached billing info
const getUserPlanFromCache = (billingInfo: IMonoBillingInfo | null): UserPlan => {
  if (
    !billingInfo?.subscription ||
    (billingInfo.subscription.status !== 'active' && billingInfo.subscription.status !== 'on_trial')
  ) {
    return 'free';
  }

  const { productId } = billingInfo.subscription;
  const isDevEnvironment = import.meta.env.MONO_ENV_APP_VERSION.includes('dev');
  const productIds = isDevEnvironment ? PLAN_PRODUCT_IDS.sandbox : PLAN_PRODUCT_IDS.production;

  switch (productId) {
    case productIds.plus:
      return 'plus';
    case productIds.pro:
      return 'pro';
    default:
      return 'free';
  }
};

const hasActiveSubscriptionFromCache = (billingInfo: IMonoBillingInfo | null): boolean => {
  if (!billingInfo?.subscription) {
    return false;
  }

  const { status, endsAt } = billingInfo.subscription;

  // Active statuses that are immediately valid
  const activeStatuses: SubscriptionStatus[] = ['on_trial', 'active'];
  if (activeStatuses.includes(status)) {
    return true;
  }

  // For canceled subscriptions, check if we're still within the access period
  if (status === 'cancelled' && endsAt) {
    const currentDate = new Date();
    const endDate = new Date(endsAt);
    return currentDate < endDate;
  }

  return false;
};

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [queuedActionsCount, setQueuedActionsCount] = useState(0);
  const [cachedBillingInfo, setCachedBillingInfo] = useState<IMonoBillingInfo | null>(null);
  const { updateThreadsState } = useThreadOperationAtom();

  // Load cached billing info on mount
  useEffect(() => {
    const loadCachedBillingInfo = async () => {
      try {
        const billingInfo = await getCachedBillingInfo();
        setCachedBillingInfo(billingInfo);
      } catch (error) {
        console.warn('Failed to load cached billing info:', error);
        setCachedBillingInfo(null);
      }
    };
    loadCachedBillingInfo();
  }, []);

  // Check if user has Pro access using cached billing info
  const hasProAccess = useMemo(() => {
    const userPlan = getUserPlanFromCache(cachedBillingInfo);
    const hasActiveSub = hasActiveSubscriptionFromCache(cachedBillingInfo);
    return userPlan === 'pro' && hasActiveSub;
  }, [cachedBillingInfo]);

  // Load queued actions count on mount, but only for Pro users
  useEffect(() => {
    if (!hasProAccess) return;

    const loadQueuedActionsCount = async () => {
      const queue = await monoLocalStorageDb.getItem<OfflineAction[]>(OFFLINE_QUEUE_KEY, []);
      setQueuedActionsCount(queue.length);
    };
    loadQueuedActionsCount();
  }, [hasProAccess]);

  const queueAction = useCallback(
    async (action: Omit<OfflineAction, 'id' | 'timestamp'>) => {
      // Only allow queueing actions for Pro users
      if (!hasProAccess) {
        console.warn('Offline actions are only available for Pro users');
        return;
      }

      const queuedAction: OfflineAction = {
        ...action,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now()
      };

      const currentQueue = await monoLocalStorageDb.getItem<OfflineAction[]>(OFFLINE_QUEUE_KEY, []);
      const updatedQueue = [...currentQueue, queuedAction];

      await monoLocalStorageDb.setItem(OFFLINE_QUEUE_KEY, updatedQueue);
      setQueuedActionsCount(updatedQueue.length);

      console.log('Action queued for offline sync:', queuedAction);
    },
    [hasProAccess]
  );

  const syncQueuedActions = useCallback(async () => {
    // Only allow syncing for Pro users
    if (!hasProAccess || !isOnline || isSyncing) return;

    setIsSyncing(true);

    const queue = await monoLocalStorageDb.getItem<OfflineAction[]>(OFFLINE_QUEUE_KEY, []);
    if (queue.length === 0) {
      setIsSyncing(false);
      return;
    }

    console.log(`Syncing ${queue.length} queued actions...`);
    let successCount = 0;
    const failedActions: OfflineAction[] = [];

    for (const action of queue) {
      try {
        if (action.type === 'THREAD_LABEL_ACTION') {
          const { uid, threadIds, addLabels = [], removeLabels = [] } = action.data;

          if (threadIds.length > 1) {
            await mailApi.batchModifyThreads(uid, threadIds, addLabels, removeLabels);
          } else if (threadIds.length === 1) {
            await mailApi.modifyThread(uid, threadIds[0], addLabels, removeLabels);
          }

          // Update badge counts
          if (addLabels.includes('UNREAD')) {
            electronApi.incrementBadge(threadIds.length);
          }
          if (removeLabels.includes('UNREAD')) {
            electronApi.decrementBadge(threadIds.length);
          }

          successCount++;
        }
      } catch (error) {
        console.error('Failed to sync action:', action, error);

        // Revert the state changes for failed actions
        if (action.type === 'THREAD_LABEL_ACTION') {
          const { uid, threadIds, addLabels = [], removeLabels = [] } = action.data;

          // Revert by swapping add/remove labels
          const revertAddLabels = removeLabels; // What we removed, we now add back
          const revertRemoveLabels = addLabels; // What we added, we now remove

          try {
            await updateThreadsState(uid, threadIds, revertAddLabels, revertRemoveLabels, true, {
              shouldRemoveThreads: false,
              shouldRestoreThreads: false
            });
            console.log('State changes reverted for failed action:', action.id);
          } catch (revertError) {
            console.error('Failed to revert state changes for action:', action.id, revertError);
          }
        }

        // Do not add to failedActions - we don't want to retry
      }
    }

    // Clear the entire queue - no retries for failed actions
    await monoLocalStorageDb.setItem(OFFLINE_QUEUE_KEY, []);
    setQueuedActionsCount(0);

    if (successCount > 0) {
      toast.success(`Synced ${successCount} offline actions`);
    }

    const failedCount = queue.length - successCount;
    if (failedCount > 0) {
      toast.error(`Failed to sync ${failedCount} actions - state changes reverted`);
    }

    console.log(`Sync completed: ${successCount} successful, ${failedCount} failed and reverted`);
    setIsSyncing(false);
  }, [hasProAccess, isOnline, isSyncing, updateThreadsState]);

  const clearQueue = useCallback(async () => {
    // Only allow clearing queue for Pro users
    if (!hasProAccess) return;

    await monoLocalStorageDb.setItem(OFFLINE_QUEUE_KEY, []);
    setQueuedActionsCount(0);
  }, [hasProAccess]);

  useEffect(() => {
    const handleOnline = async () => {
      console.log('Internet connection restored');
      electronApi.setOfflineStatus(true);
      setIsOnline(true);
      setIsOfflineMode(false);

      // Refresh cached billing info when coming back online
      try {
        const billingInfo = await getCachedBillingInfo();
        setCachedBillingInfo(billingInfo);
      } catch (error) {
        console.warn('Failed to refresh cached billing info on reconnect:', error);
      }

      // Auto-sync when coming back online, but only for Pro users
      if (hasProAccess) {
        setTimeout(() => {
          syncQueuedActions();
        }, 1000); // Small delay to ensure connection is stable
      }
    };

    const handleOffline = () => {
      console.log('Internet connection lost - entering offline mode');
      electronApi.setOfflineStatus(false);
      setIsOnline(false);
      setIsOfflineMode(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial offline mode state
    if (!navigator.onLine) {
      setIsOfflineMode(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hasProAccess, syncQueuedActions]);

  const contextValue = useMemo(
    () => ({
      isOnline,
      isOfflineMode,
      queuedActionsCount: hasProAccess ? queuedActionsCount : 0,
      queueAction,
      syncQueuedActions,
      isSyncing: hasProAccess ? isSyncing : false,
      clearQueue,
      hasProAccess
    }),
    [
      isOnline,
      isOfflineMode,
      queuedActionsCount,
      queueAction,
      syncQueuedActions,
      isSyncing,
      clearQueue,
      hasProAccess
    ]
  );

  return <OfflineContext.Provider value={contextValue}>{children}</OfflineContext.Provider>;
};

export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};
