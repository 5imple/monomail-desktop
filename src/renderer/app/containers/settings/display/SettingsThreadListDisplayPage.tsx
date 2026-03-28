import { useTranslation } from 'react-i18next';
import { ThreadListDisplayForm } from '../forms/ThreadListDisplayForm';

export default function SettingsThreadListDisplayPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <ThreadListDisplayForm />
    </div>
  );
}
