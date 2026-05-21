import { ShortcutForm } from '@/renderer/app/containers/settings/forms/ShortcutForm';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useTranslation } from 'react-i18next';

export default function SettingsShortcutPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title={t('settings.shortcut.title')}
        description={t('settings.shortcut.description')}
      />
      <ShortcutForm />
    </div>
  );
}
