import { useTranslation } from 'react-i18next';
import { NotificationsForm } from '../forms/NotificationForm';

export default function SettingsNotificationsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.notifications.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.notifications.description')}</p>
      </div>
      <NotificationsForm />
    </div>
  );
}
