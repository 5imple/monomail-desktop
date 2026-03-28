import { useTranslation } from 'react-i18next';
import { DisplayForm } from '../forms/DisplayForm';

export default function SettingsDisplayPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.display.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.display.description')}</p>
      </div>
      <DisplayForm />
    </div>
  );
}
