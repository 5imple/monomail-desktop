// src/components/AuthGuard.tsx
import Loader from '@/renderer/app/components/ui/loader';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { cn } from '@/renderer/app/lib/utils';

interface AuthGuardProps {
  children: React.ReactNode;
  to?: string;
  successRedirect?: string;
  requiresSubscription?: boolean;
}

const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  to,
  successRedirect,
  requiresSubscription = true
}) => {
  const { isLoggedIn, isLoading, member, idToken } = useAuth();
  const { spaces, isLoadingSpaces } = useSpaceAtom();
  const { sidebarCollapsed } = useSidebarAtom();

  if (isLoading || (isLoggedIn && isLoadingSpaces)) {
    return (
      <div className="no-drag h-screen bg-gradient-to-tr from-background/90 to-background/80 backdrop-blur-lg">
        <div className="h-full flex-col items-center justify-center">
          <BaseHeader />
          <div className="flex h-full">
            <aside
              className={cn('transition-all duration-300', sidebarCollapsed ? 'w-0' : 'w-[220px]')}
            ></aside>
            <div className="m-1 flex-1 rounded-lg border bg-card/70 shadow-sm dark:bg-card/60"></div>

            {sidebarCollapsed && (
              <Loader className="absolute left-1/2 top-1/2 mb-8 h-[1.1rem] w-[1.1rem] text-foreground/60" />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn && to) {
    return <Navigate to={to} />;
  }

  if (spaces.length === 0) {
    return <Navigate to={'/onboarding'} />;
  }

  return <>{children}</>;
};

export default AuthGuard;
