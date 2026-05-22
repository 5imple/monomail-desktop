import { MonoIconType } from '@/renderer/app/components/icons/icons';
import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface MonoNotificationAlert {
  id: string;
  icon?: MonoIconType;
  title?: string;
  query: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  closeable: boolean;
  showEverywhere?: boolean;
}

// Store dismissed alert IDs
const dismissedAlertsAtom = atomWithStorage<string[]>(
  'alerts:dismissed',
  [],
  createIndexedDBStorage<string[]>({
    defaultValue: []
  })
);

const notificationAlertAtom = atom<MonoNotificationAlert[]>([]);

export type LoadingStatus = 'INIT' | 'LOADING' | 'ERROR' | 'DONE';

const loadingStatusAtom = atom<LoadingStatus>('INIT');

export function useThreadListAtom() {
  const [notificationAlert, setNotificationAlert] = useAtom(notificationAlertAtom);
  const [dismissedAlerts, setDismissedAlerts] = useAtom(dismissedAlertsAtom);
  const [loadingStatus, setLoadingStatus] = useAtom(loadingStatusAtom);

  // Filter out dismissed alerts
  const visibleAlerts = notificationAlert.filter((alert) => !dismissedAlerts.includes(alert.id));

  const dismissAlert = async (alertId: string) => {
    setDismissedAlerts(async (prev) => [...(await prev), alertId]);
  };

  return {
    notificationAlert: visibleAlerts,
    setNotificationAlert,
    dismissAlert,
    loadingStatus,
    setLoadingStatus
  };
}
