import { GeneralForm } from '@/renderer/app/containers/settings/forms/GeneralForm';
import { SystemForm } from '@/renderer/app/containers/settings/forms/SystemForm';
import { useTranslation } from 'react-i18next';

export default function SettingsSystemPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.system.title')}</h3>
        <p className="text-sm text-muted-foreground outline-ring">
          {t('settings.system.description')}
        </p>
      </div>
      <SystemForm />
    </div>
  );
}
