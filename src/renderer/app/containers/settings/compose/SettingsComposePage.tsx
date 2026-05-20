import { ComposeForm } from '@/renderer/app/containers/settings/forms/ComposeForm';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';

export default function SettingsComposePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.compose.title')}
        description={t('settings.compose.description')}
      />
      <ComposeForm />
    </div>
  );
}
