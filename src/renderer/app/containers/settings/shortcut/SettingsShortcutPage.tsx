import { ShortcutForm } from '@/renderer/app/containers/settings/forms/ShortcutForm';
import { useTranslation } from 'react-i18next';

export default function SettingsShortcutPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.shortcut.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.shortcut.description')}</p>
      </div>
      <ShortcutForm />
    </div>
  );
}
