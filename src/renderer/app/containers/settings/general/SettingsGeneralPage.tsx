import { GeneralForm } from '@/renderer/app/containers/settings/forms/GeneralForm';
import { useTranslation } from 'react-i18next';

export default function SettingsGeneralPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.general.title')}</h3>
        <p className="text-sm text-muted-foreground outline-ring">
          {t('settings.general.description')}
        </p>
      </div>
      <GeneralForm />
    </div>
  );
}
