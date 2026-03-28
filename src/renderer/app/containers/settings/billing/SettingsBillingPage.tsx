import { BillingForm } from '@/renderer/app/containers/settings/forms/BillingForm';
import { useTranslation } from 'react-i18next';

export default function SettingsBillingPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* <div>
        <h3 className="text-lg font-medium">{t('settings.billing.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.billing.description')}</p>
      </div> */}
      <BillingForm />
    </div>
  );
}
