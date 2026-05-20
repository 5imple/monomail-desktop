import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';
import { IntegrationForm } from '../forms/IntegrationForm';

export default function SettingsIntegrationPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.integration.title')}
        description={t('settings.integration.description')}
      />
      <IntegrationForm />
    </div>
  );
}
