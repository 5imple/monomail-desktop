import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';
import { DisplayForm } from '../forms/DisplayForm';

export default function SettingsDisplayPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.display.title')}
        description={t('settings.display.description')}
      />
      <DisplayForm />
    </div>
  );
}
