import TemplateForm from '@/renderer/app/containers/settings/forms/TemplateForm';
import { useTranslation } from 'react-i18next';

export default function SettingsTemplatePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* <div>
        <h3 className="text-lg font-medium">{t('settings.template.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.template.description')}</p>
      </div> */}
      <TemplateForm />
    </div>
  );
}
