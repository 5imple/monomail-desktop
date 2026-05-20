import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { IntegrationForm } from '../forms/IntegrationForm';
import { useTranslation } from 'react-i18next';

export default function SettingsAccountPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.team.title')}
        description={t('settings.team.description')}
      />
      <IntegrationForm />
    </div>
  );
}
