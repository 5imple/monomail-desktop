import SignatureForm from '@/renderer/app/containers/settings/forms/SignatureForm';
import { useTranslation } from 'react-i18next';

export default function SettingsSignaturePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* <div>
        <h3 className="text-lg font-medium">{t('settings.signature.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.signature.description')}</p>
      </div> */}
      <SignatureForm />
    </div>
  );
}
