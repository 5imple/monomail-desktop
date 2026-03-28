import AutoPilotForm from '@/renderer/app/containers/settings/forms/AutoPilotForm';
import { useTranslation } from 'react-i18next';

export default function SettingsAutoPilotPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <AutoPilotForm />
    </div>
  );
}
