import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/app/lib/utils';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';

interface OfflineViewProps {
  className?: string;
}

// Shown instead of the app while offline. There are no plans in this build,
// so it no longer advertises an upgrade for offline access.
const OfflineView: React.FC<OfflineViewProps> = ({ className }) => {
  const { t } = useTranslation();
  return (
    <div className={cn('no-drag h-screen', className)}>
      <BaseHeader />
      <div className="absolute bottom-0 left-0 right-0 top-0 flex flex-col items-center justify-center">
        <div className="text-md">{t('offline.view_title')}</div>
        <div className="text-md text-muted-foreground">{t('offline.view_hint')}</div>
      </div>
    </div>
  );
};

export default OfflineView;
