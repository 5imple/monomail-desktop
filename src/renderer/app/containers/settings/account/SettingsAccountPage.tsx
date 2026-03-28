import { useTranslation } from 'react-i18next';
import { AccountForm } from '../forms/AccountForm';

export default function SettingsAccountPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.account.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.account.description')}</p>
      </div>
      <AccountForm />
    </div>
  );
}
