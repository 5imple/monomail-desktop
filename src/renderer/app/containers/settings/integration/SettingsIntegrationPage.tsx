import { useTranslation } from 'react-i18next';
import { IntegrationForm } from '../forms/IntegrationForm';

export default function SettingsIntegrationPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.integration.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.integration.description')}</p>
      </div>
      <IntegrationForm />
    </div>
  );
}
