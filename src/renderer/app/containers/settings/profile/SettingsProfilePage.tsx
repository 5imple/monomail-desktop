import { useTranslation } from 'react-i18next';
import { ProfileForm } from '../forms/ProfileForm';

export default function SettingsProfilePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.profile.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.profile.description')}</p>
      </div>
      {/* <div>
        <h3 className="text-lg font-medium">Profile</h3>
        <p className="text-sm text-muted-foreground">
          This is how others will see you on the site.
        </p>
      </div> */}
      <ProfileForm />
    </div>
  );
}
