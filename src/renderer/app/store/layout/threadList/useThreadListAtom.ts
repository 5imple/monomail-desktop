import { MonoIconType } from '@/renderer/app/components/icons/icons';
import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useTranslation } from 'react-i18next';

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

const notificationAlertAtom = atom<MonoNotificationAlert[]>([
  // {
  //   id: 'subscription-june-10',
  //   query: '',
  //   showEverywhere: true,
  //   title: 'Subscription needed',
  //   description: 'You need a subscription by June 10',
  //   icon: 'Rocket',
  //   closeable: true
  // }
]);

export type LoadingStatus = 'INIT' | 'LOADING' | 'ERROR' | 'DONE';

const loadingStatusAtom = atom<LoadingStatus>('INIT');

export function useThreadListAtom() {
  const [notificationAlert, setNotificationAlert] = useAtom(notificationAlertAtom);
  const [dismissedAlerts, setDismissedAlerts] = useAtom(dismissedAlertsAtom);
  const [loadingStatus, setLoadingStatus] = useAtom(loadingStatusAtom);
  const { t } = useTranslation();

  // Filter out dismissed alerts
  const visibleAlerts = notificationAlert.filter((alert) => !dismissedAlerts.includes(alert.id));

  const dismissAlert = async (alertId: string) => {
    setDismissedAlerts(async (prev) => [...(await prev), alertId]);
  };

  // Update subscription alert description with translation
  const alertsWithTranslation = visibleAlerts.map((alert) => {
    if (alert.id === 'subscription-june-10') {
      return {
        ...alert,
        title: t('alerts.subscription_needed_june_10_title'),
        description: t('alerts.subscription_needed_june_10')
      };
    }
    return alert;
  });

  return {
    notificationAlert: alertsWithTranslation,
    setNotificationAlert,
    dismissAlert,
    loadingStatus,
    setLoadingStatus
  };
}
