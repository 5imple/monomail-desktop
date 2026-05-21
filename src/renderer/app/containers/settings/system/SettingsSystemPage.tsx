import { SystemForm } from '@/renderer/app/containers/settings/forms/SystemForm';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';

export default function SettingsSystemPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.system.title')}
        description={t('settings.system.description')}
      />
      <SystemForm />
    </div>
  );
}
