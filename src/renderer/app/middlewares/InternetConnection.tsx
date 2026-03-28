import { OfflineProvider, useOffline } from '@/renderer/app/context/OfflineContext';
import OfflineView from '@/renderer/app/components/OfflineView';
import React from 'react';

interface InternetConnectionProps {
  children: React.ReactNode;
}

const InternetConnectionInner: React.FC<InternetConnectionProps> = ({ children }) => {
  const { isOfflineMode, hasProAccess } = useOffline();

  // Show offline upgrade view for non-Pro users when offline
  if (isOfflineMode && !hasProAccess) {
    return <OfflineView />;
  }

  return <>{children}</>;
};

const InternetConnection: React.FC<InternetConnectionProps> = ({ children }) => {
  return (
    <OfflineProvider>
      <InternetConnectionInner>{children}</InternetConnectionInner>
    </OfflineProvider>
  );
};

export default InternetConnection;
