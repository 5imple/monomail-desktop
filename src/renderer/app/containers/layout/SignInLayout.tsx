import { Button } from '@/renderer/app/components/ui/button';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';

import MonoLogo from '@/renderer/app/components/common/MonoLogo';
import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogTitle
} from '@/renderer/app/components/ui/alert-dialog';
import Loader from '@/renderer/app/components/ui/loader';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import type { TFunction } from 'i18next';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';

interface SignInLayoutProps {}

type SignInProvider = 'google' | 'microsoft';
type SignInResult = { ok: true } | { ok: false; error: string };

// Tenant/workspace policy blocks: Entra admin consent / user assignment, Google admin policy.
const ADMIN_CONSENT_ERROR =
  /AADSTS(?:65001|90094|90095|900941|50105)\b|admin(?:istrator)?[\s_-]*(?:consent|approval|permission)|admin_policy_enforced/i;

// Turns raw OAuth / main-process errors into plain copy. Unmapped errors keep
// the raw message so diagnostics aren't lost.
const showSignInError = (t: TFunction, error: string) => {
  if (/already in progress/i.test(error)) {
    toast.error(
      t('layout.sign_in.error_in_progress', {
        defaultValue: 'A sign-in window is already open in your browser.'
      })
    );
  } else if (ADMIN_CONSENT_ERROR.test(error)) {
    toast.error(
      t('layout.sign_in.error_admin_consent', {
        defaultValue:
          'Your organization’s account needs admin approval before this app can sign in. Ask your IT administrator to grant consent, then try again.'
      }),
      { duration: 10000 }
    );
  } else if (/access_denied|cancel|AADSTS65004/i.test(error)) {
    toast(t('layout.sign_in.error_cancelled', { defaultValue: 'Sign-in cancelled.' }));
  } else if (/timed out/i.test(error)) {
    toast.error(
      t('layout.sign_in.error_timed_out', { defaultValue: 'Sign-in timed out. Try again.' })
    );
  } else {
    toast.error(
      t('layout.sign_in.error_generic', { defaultValue: 'Sign-in failed: {{error}}', error })
    );
  }
};

const SignInLayout: FC<SignInLayoutProps> = () => {
  const { t } = useTranslation();
  const { isLoading, isLoggedIn, member } = useAuth();
  const { loading } = useGlobalAtom();
  const { spaces } = useSpaceAtom();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pending, setPending] = useState<Record<SignInProvider, boolean>>({
    google: false,
    microsoft: false
  });
  const [signedIn, setSignedIn] = useState(false);
  const inFlight = useRef(new Set<SignInProvider>());
  const releaseTimers = useRef(new Set<number>());

  useEffect(() => {
    const timers = releaseTimers.current;
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  const runSignIn = useCallback(
    async (provider: SignInProvider, start: () => Promise<SignInResult>) => {
      if (inFlight.current.has(provider)) return;
      inFlight.current.add(provider);
      // A new browser flow supersedes an earlier success that didn't stick.
      setSignedIn(false);
      setPending((prev) => ({ ...prev, [provider]: true }));
      let ok = false;
      try {
        const result = await start();
        ok = result.ok;
        if (result.ok) setSignedIn(true);
        else showSignInError(t, result.error);
      } catch (e) {
        showSignInError(t, (e as Error)?.message ?? String(e));
      } finally {
        const release = () => {
          inFlight.current.delete(provider);
          setPending((prev) => ({ ...prev, [provider]: false }));
        };
        if (ok) {
          // The invoke reply lands before AuthContext flips isLoading, so hold the
          // spinner briefly instead of flashing the buttons back on.
          const id = window.setTimeout(() => {
            releaseTimers.current.delete(id);
            release();
          }, 1500);
          releaseTimers.current.add(id);
        } else {
          release();
        }
      }
    },
    [t]
  );

  const handleSignIn = useCallback(async () => {
    // Direct Google OAuth (PKCE) in the system browser.
    if (!isElectron || !(import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim()) {
      toast.error('Sign-in unavailable: set MONO_ENV_GOOGLE_CLIENT_ID and rebuild.');
      return;
    }
    await runSignIn('google', () => electronApi.initiateSignIn());
  }, [runSignIn]);

  const handleMicrosoftSignIn = useCallback(async () => {
    // Direct Microsoft OAuth (PKCE) in the system browser — work/school accounts.
    if (!isElectron || !(import.meta.env.MONO_ENV_MICROSOFT_CLIENT_ID || '').trim()) {
      toast.error('Sign-in unavailable: set MONO_ENV_MICROSOFT_CLIENT_ID and rebuild.');
      return;
    }
    await runSignIn('microsoft', () => electronApi.initiateMicrosoftSignIn());
  }, [runSignIn]);

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

  // Show a clear setup screen instead of blank when no provider is configured.
  const googleConfigured = !!(import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim();
  const microsoftConfigured = !!(import.meta.env.MONO_ENV_MICROSOFT_CLIENT_ID || '').trim();
  if (!googleConfigured && !microsoftConfigured) {
    return (
      <div className="no-drag flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold">Sign-in not configured</h1>
          <p className="text-sm text-muted-foreground">
            Copy{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.example</code> to{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code> and set{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              MONO_ENV_GOOGLE_CLIENT_ID
            </code>{' '}
            (Google, see docs/GOOGLE_OAUTH_SETUP.md) and/or{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              MONO_ENV_MICROSOFT_CLIENT_ID
            </code>{' '}
            (Microsoft 365 work/school), then restart the app.
          </p>
        </div>
      </div>
    );
  }

  const authBusy = loading || isLoading;
  const anyPending = pending.google || pending.microsoft;
  const signingIn = anyPending || signedIn;

  if (!authBusy && isLoggedIn && member) {
    if (spaces.length === 0) {
      return <Navigate to={'/onboarding'} />;
    }

    // Payment removed — go straight to inbox after onboarding.
    return <Navigate to={'/'} />;
  }

  return (
    <div className="no-drag h-screen">
      <AlertDialog open={updateAvailable && !authBusy} onOpenChange={setUpdateAvailable}>
        <AlertDialogOverlay />
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('update_notification.electron.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('update_notification.electron.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              className="w-full"
              sizeVariant={'lg'}
              onClick={handleUpdateApplication}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader className="mr-2" />
                  {t('layout.sign_in.update_updating', { defaultValue: 'Updating…' })}
                </>
              ) : (
                t('update_notification.electron.button')
              )}
            </Button>
            <AlertDialogCancel className="mt-0 h-11 w-full" disabled={isUpdating}>
              {t('layout.sign_in.update_later', { defaultValue: 'Later' })}
            </AlertDialogCancel>
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
            {/* A logo over two buttons said nothing about what this is or
                what signing in does. */}
            <div className="max-w-sm text-center">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {t('onboarding.welcome.title', { defaultValue: 'Welcome to Mono Mail' })}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t('layout.sign_in.intro', {
                  defaultValue:
                    'Sign in with the account you want to read mail from. Your mail stays between your provider and this app.'
                })}
              </p>
            </div>
            {/* While auth loads, the buttons stay laid out but invisible so the
                logo doesn't move when they appear. */}
            <div className="relative flex flex-col items-center gap-3">
              <div
                className={cn(
                  'flex w-64 flex-col gap-3',
                  authBusy ? 'invisible' : 'duration-300 animate-in fade-in-0'
                )}
              >
                {microsoftConfigured && (
                  <Button
                    variant={'secondary'}
                    className="w-full"
                    disabled={pending.microsoft}
                    onClick={handleMicrosoftSignIn}
                  >
                    {pending.microsoft ? (
                      <Loader className="mr-2" />
                    ) : (
                      <MonoIcon type={'Outlook'} className="mr-2" />
                    )}
                    {t('layout.sign_in.sign_in_with_microsoft')}
                  </Button>
                )}
                {googleConfigured && (
                  <Button
                    variant={'secondary'}
                    className="w-full"
                    disabled={pending.google}
                    onClick={handleSignIn}
                  >
                    {pending.google ? (
                      <Loader className="mr-2" />
                    ) : (
                      <MonoIcon type={'Google'} className="mr-2" />
                    )}
                    {t('layout.sign_in.sign_in_with_google')}
                  </Button>
                )}
              </div>
              <p
                aria-live="polite"
                className={cn('h-4 text-xs text-muted-foreground', authBusy && 'invisible')}
              >
                {anyPending
                  ? signedIn
                    ? t('layout.sign_in.signing_in', { defaultValue: 'Signing you in…' })
                    : t('layout.sign_in.waiting', {
                        defaultValue: 'Finish signing in in your browser…'
                      })
                  : null}
              </p>
              {authBusy && (
                <div
                  role="status"
                  className={cn(
                    'absolute inset-0 flex flex-col items-center justify-center gap-3 duration-300 animate-in fade-in-0',
                    // Delay the spinner at app start / after sign-out so a fast load doesn't flash it.
                    !signingIn && 'delay-200 fill-mode-backwards'
                  )}
                >
                  <Loader />
                  {signingIn && (
                    <p className="text-sm text-muted-foreground">
                      {t('layout.sign_in.signing_in', { defaultValue: 'Signing you in…' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className={cn(authBusy && 'invisible')}>
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
