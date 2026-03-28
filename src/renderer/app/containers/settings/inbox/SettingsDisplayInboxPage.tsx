import { DisplayInboxForm } from '@/renderer/app/containers/settings/forms/DisplayInboxForm';
import { useTranslation } from 'react-i18next';

export default function SettingsDisplayInboxPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <DisplayInboxForm />
    </div>
  );
}
