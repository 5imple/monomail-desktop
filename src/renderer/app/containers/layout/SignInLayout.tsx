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
import { Textarea } from '@/renderer/app/components/ui/textarea';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';

interface SignInLayoutProps {}

const SignInLayout: FC<SignInLayoutProps> = () => {
  const { t } = useTranslation();
  const { signIn, isLoading, signOut, isLoggedIn, preference, member, idToken } = useAuth();
  const { loading } = useGlobalAtom();
  const { spaces } = useSpaceAtom();
  const { hasActiveSubscription, fetchSubscription } = useBillingAtom();
  const [devToken, setDevToken] = useState<string>('');
  const navigate = useNavigate();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);

  const handleSignIn = useCallback(() => {
    const rawBaseUrl = (import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN || '').trim();
    if (!rawBaseUrl) {
      toast.error(
        'Sign-in unavailable: MONO_ENV_HOMEPAGE_DOMAIN is not configured for this build.'
      );
      return;
    }
    // Reject unschemed values like "localhost" — the main-process
    // window-open guard would silently deny them and the button would
    // appear broken. Tell the user instead.
    const baseUrl = /^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : '';
    if (!baseUrl) {
      toast.error(
        `Sign-in unavailable: MONO_ENV_HOMEPAGE_DOMAIN is "${rawBaseUrl}", which must start with http(s)://. ` +
          'Point this at your on-prem sign-in page and rebuild.'
      );
      return;
    }
    const client = isElectron ? 'web-electron' : 'web';
    window.open(`${baseUrl.replace(/\/$/, '')}/sign-in?client=${client}`);
  }, []);
  const [searchParams] = useSearchParams();
  const tokenParams = searchParams.get('token');

  const signInWithToken = useCallback(
    async (token: string) => {
      try {
        if (!token) throw new Error('Invalid token received.');
        await signIn(token);
      } catch (error: any) {
        console.error('Error signing in:', error);
        toast.error(t('toast.error.sign_in'));
      }
    },
    [signIn, t]
  );

  useEffect(() => {
    if (tokenParams) {
      signIn(tokenParams);
    }
  }, [tokenParams]);

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

  const handleDevSignIn = useCallback(() => {
    signInWithToken(devToken);
  }, [devToken, signInWithToken]);

  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    const fetchAppVersion = async () => {
      try {
        const version = import.meta.env.MONO_ENV_APP_VERSION;

        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };

    fetchAppVersion();
  }, []);

  // Fetch subscription data when user is logged in
  useEffect(() => {
    if (isLoggedIn && member && idToken && !subscriptionChecked) {
      fetchSubscription(idToken).finally(() => {
        setSubscriptionChecked(true);
      });
    }
  }, [isLoggedIn, member, idToken, fetchSubscription, subscriptionChecked]);

  if (loading || (isLoggedIn && member && !subscriptionChecked)) return null;

  if (isLoggedIn && member && subscriptionChecked) {
    if (spaces.length === 0) {
      return <Navigate to={'/onboarding'} />;
    }

    // Check subscription status after onboarding
    if (!hasActiveSubscription()) {
      return <Navigate to={'/subscription'} />;
    }

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
          <div className="flex flex-col items-center gap-8">
            <MonoLogo className="h-24" />
            <Button variant={'secondary'} disabled={isLoading} onClick={handleSignIn}>
              {isLoading ? (
                <Loader className="mr-2" />
              ) : (
                <MonoIcon type={'Google'} className="mr-2" />
              )}
              {t('layout.sign_in.sign_in_with_google')}
            </Button>
            {(() => {
              const homepage = (import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN || '').trim();
              const homepageMisconfigured =
                !homepage || !/^https?:\/\//i.test(homepage);
              const showDevAffordances =
                process.env.NODE_ENV === 'development' || homepageMisconfigured;
              if (!showDevAffordances) return null;
              return (
                <div className="flex w-80 flex-col gap-2">
                  {homepageMisconfigured && (
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Backend not configured
                    </p>
                  )}
                  {homepageMisconfigured && (
                    <p className="text-xs text-muted-foreground">
                      Set <code>MONO_ENV_HOMEPAGE_DOMAIN</code> to your on-prem sign-in URL
                      (e.g. <code>https://app.example.com</code>) and rebuild. Until then,
                      paste a backend-issued access token here to sign in directly.
                    </p>
                  )}
                  <Textarea
                    value={devToken}
                    onChange={(e) => setDevToken(e.target.value)}
                    placeholder="Paste access token"
                  ></Textarea>
                  <Button onClick={handleDevSignIn}>Sign in with Token</Button>
                </div>
              );
            })()}
          </div>
          <div>
            <div className="mt-4 text-xs text-muted-foreground">
              {t('layout.sign_in.agreement')}{' '}
              <Button variant={'link'} typeVariant={'inline'} asChild>
                <a
                  href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/terms`}
                  target="_blank"
                  className="text-xs text-primary hover:underline"
                  rel="noreferrer"
                >
                  {t('layout.sign_in.legal')}
                </a>
              </Button>{' '}
              {t('layout.sign_in.and')}{' '}
              <Button variant={'link'} typeVariant={'inline'} asChild>
                <a
                  href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/privacy`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {t('layout.sign_in.privacy')}
                </a>
              </Button>
              .
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
