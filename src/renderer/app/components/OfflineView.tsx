import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/app/lib/utils';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';

interface OfflineViewProps {
  className?: string;
}

const OfflineView: React.FC<OfflineViewProps> = ({ className }) => {
  const { t } = useTranslation();

  return (
    <div className={cn('no-drag h-screen', className)}>
      <BaseHeader />
      <div className="absolute bottom-0 left-0 right-0 top-0 flex flex-col items-center justify-center">
        <div className="text-md">You&apos;re offline</div>
        <div className="text-md text-muted-foreground">
          Try checking your connection or reconnecting to Wi-Fi
        </div>
        <div className="mt-4 rounded-md bg-muted p-3 text-center text-xs">
          Upgrade to Pro for offline access
        </div>
      </div>
    </div>
  );
};

export default OfflineView;
