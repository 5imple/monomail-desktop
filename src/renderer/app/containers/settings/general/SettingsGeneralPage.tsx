import { GeneralForm } from '@/renderer/app/containers/settings/forms/GeneralForm';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';

export default function SettingsGeneralPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.general.title')}
        description={t('settings.general.description')}
      />
      <GeneralForm />
    </div>
  );
}
