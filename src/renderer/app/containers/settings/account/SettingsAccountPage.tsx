import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';
import { AccountForm } from '../forms/AccountForm';

export default function SettingsAccountPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.account.title')}
        description={t('settings.account.description')}
      />
      <AccountForm />
    </div>
  );
}
