// src/components/AuthGuard.tsx
import Loader from '@/renderer/app/components/ui/loader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { cn } from '@/renderer/app/lib/utils';

interface AuthGuardProps {
  children: React.ReactNode;
  to?: string;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children, to }) => {
  const { isLoggedIn, isLoading, idToken } = useAuth();
  const { spaces, isLoadingSpaces } = useSpaceAtom();
  const { sidebarCollapsed } = useSidebarAtom();

  // Treat "logged in but token not yet ready" as still loading. AuthContext
  // sets isLoggedIn=true from cached auth before the fresh idToken settles
  // — without this gate, child components mount and fire tokenless API
  // requests (401s) AND a freshly signed-out user could briefly see the
  // previous session's UI shell before the redirect fires.
  const tokenReady = !isLoggedIn || !!idToken;

  if (isLoading || (isLoggedIn && isLoadingSpaces) || !tokenReady) {
    // The app's own chrome (52 px titlebar, sidebar column, flat list area),
    // so the inbox slots in without the layout jumping. It used to be a
    // frosted card with a 32 px header that snapped to the real layout.
    return (
      <div className="no-drag flex h-screen flex-col bg-white dark:bg-background">
        <div className="drag h-[52px] w-full shrink-0" />
        <div className="relative flex flex-1">
          <aside className={cn('shrink-0', sidebarCollapsed ? 'w-0' : 'w-[220px]')} />
          <div className="flex-1" />
          {sidebarCollapsed && (
            <Loader className="absolute left-1/2 top-1/2 mb-8 h-[1.1rem] w-[1.1rem] text-foreground/60" />
          )}
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
