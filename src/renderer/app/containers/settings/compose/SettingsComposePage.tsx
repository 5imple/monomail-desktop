import { ComposeForm } from '@/renderer/app/containers/settings/forms/ComposeForm';
import { useTranslation } from 'react-i18next';

export default function SettingsComposePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.compose.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.compose.description')}</p>
      </div>
      <ComposeForm />
    </div>
  );
}
