import { Button } from '@/renderer/app/components/ui/button';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';

import MonoLogo from '@/renderer/app/components/common/MonoLogo';
import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogTitle
} from '@/renderer/app/components/ui/alert-dialog';
import Loader from '@/renderer/app/components/ui/loader';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';

interface SignInLayoutProps {}

const SignInLayout: FC<SignInLayoutProps> = () => {
  const { t } = useTranslation();
  const { isLoading, isLoggedIn, member } = useAuth();
  const { loading } = useGlobalAtom();
  const { spaces } = useSpaceAtom();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSignIn = useCallback(async () => {
    // Direct Google OAuth (PKCE) is the only sign-in path.
    if (!isElectron || !(import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim()) {
      toast.error('Sign-in unavailable: set MONO_ENV_GOOGLE_CLIENT_ID and rebuild.');
      return;
    }
    const result = await electronApi.initiateSignIn();
    if (!result.ok) {
      toast.error(`Sign-in failed: ${result.error}`);
    }
  }, []);

  useEffect(() => {
    electronApi.checkForUpdate();

    const updateAvailableListener = electronApi.on('renderer:update:available', () => {
      setUpdateAvailable(true);
    });

    return () => {
      updateAvailableListener();
    };
  }, []);

  const handleUpdateApplication = useCallback(() => {
    setIsUpdating(true);
    electronApi.downloadAndInstallUpdate();
  }, []);

  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    setAppVersion(import.meta.env.MONO_ENV_APP_VERSION);
  }, []);

  // Show a clear setup screen instead of blank when Google OAuth isn't configured.
  const googleConfigured = !!(import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim();
  if (!googleConfigured) {
    return (
      <div className="no-drag flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold">Google sign-in not configured</h1>
          <p className="text-sm text-muted-foreground">
            Copy{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.example</code> to{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code> and set{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              MONO_ENV_GOOGLE_CLIENT_ID
            </code>{' '}
            (and secret), then restart the app.
          </p>
        </div>
      </div>
    );
  }

  if (loading || isLoading) return null;

  if (isLoggedIn && member) {
    if (spaces.length === 0) {
      return <Navigate to={'/onboarding'} />;
    }

    // Payment removed — go straight to inbox after onboarding.
    return <Navigate to={'/'} />;
  }

  return (
    <div className="no-drag h-screen">
      <AlertDialog open={updateAvailable} onOpenChange={setUpdateAvailable}>
        <AlertDialogOverlay />
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Update Available</AlertDialogTitle>
            <AlertDialogDescription>
              Update this app to the newest version. For your protection and security reasons, we
              recommend this update.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex sm:justify-between">
            <Button
              className="w-full"
              sizeVariant={'lg'}
              onClick={handleUpdateApplication}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader className="mr-2" />
                  Updating...
                </>
              ) : (
                'Update now'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="fixed bottom-0 left-0 right-0 top-0 flex items-center justify-center overflow-hidden rounded-md border bg-background">
        <BaseHeader />

        <div className="flex h-screen flex-col items-center justify-between p-16 transition-colors">
          <div></div>
          {/* Newton entrance: fade + subtle lift on first paint so the
              sign-in surface doesn't pop in. Honors prefers-reduced-motion
              automatically via tailwindcss-animate. */}
          <div className="flex flex-col items-center gap-8 duration-500 animate-in fade-in-0 slide-in-from-bottom-2">
            <MonoLogo className="h-24" />
            <Button variant={'secondary'} disabled={isLoading} onClick={handleSignIn}>
              {isLoading ? (
                <Loader className="mr-2" />
              ) : (
                <MonoIcon type={'Google'} className="mr-2" />
              )}
              {t('layout.sign_in.sign_in_with_google')}
            </Button>
          </div>
          <div>
            <div className="mt-4 text-xs text-muted-foreground">
              {t('layout.sign_in.agreement')} {t('layout.sign_in.legal')} {t('layout.sign_in.and')}{' '}
              {t('layout.sign_in.privacy')}.
            </div>
          </div>
        </div>
      </div>
      {appVersion && (
        <div className="fixed bottom-3 right-3">
          <div className="text-xs text-muted-foreground/50">v{appVersion}</div>
        </div>
      )}
    </div>
  );
};

export default SignInLayout;
