import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';
import { NotificationsForm } from '../forms/NotificationForm';

export default function SettingsNotificationsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.notifications.title')}
        description={t('settings.notifications.description')}
      />
      <NotificationsForm />
    </div>
  );
}
