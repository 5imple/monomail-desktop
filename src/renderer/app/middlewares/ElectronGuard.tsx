// src/components/ElectronGuard.tsx
import MonoLogo from '@/renderer/app/components/common/MonoLogo';
import { Button } from '@/renderer/app/components/ui/button';
import { isElectron } from '@/renderer/app/lib/electronApi';
import React from 'react';

interface ElectronGuardProps {
  children: React.ReactNode;
}

const ElectronGuard: React.FC<ElectronGuardProps> = ({ children }) => {
  if (!isElectron) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <MonoLogo className="mx-auto" />
          <h1 className="mt-6 text-3xl font-medium">Welcome to Mono Mail</h1>
          <div className="text-md mt-3 text-muted-foreground">
            This account does not have access to Mono Mail. Sign up for the waitlist{' '}
            <Button className="text-md" variant={'link'} typeVariant={'inline'} asChild>
              <a href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}`}>here</a>
            </Button>
          </div>
          <div></div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ElectronGuard;
