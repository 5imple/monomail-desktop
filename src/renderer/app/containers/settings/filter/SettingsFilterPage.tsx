import FilterForm from '@/renderer/app/containers/settings/forms/FilterForm';
import { useTranslation } from 'react-i18next';

export default function SettingsFilterPage() {
  const { t } = useTranslation();
  return (
    <div className="">
      <FilterForm />
    </div>
  );
}
