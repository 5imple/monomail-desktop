import { IntegrationForm } from '../forms/IntegrationForm';
import { useTranslation } from 'react-i18next';

export default function SettingsAccountPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.team.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.team.description')}</p>
      </div>
      <IntegrationForm />
    </div>
  );
}
