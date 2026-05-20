import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';
import { ProfileForm } from '../forms/ProfileForm';

export default function SettingsProfilePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.profile.title')}
        description={t('settings.profile.description')}
      />
      <ProfileForm />
    </div>
  );
}
