import { GmailMessage, GmailThreadGetResponse } from '@/main/api/gmail/types';
import shareApi from '@/main/api/share/shareApi';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import MessageCard from '@/renderer/app/components/card/MessageCard';
import MonoLogo from '@/renderer/app/components/common/MonoLogo';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getShareCookieDomain, getUtmSource } from '@/renderer/app/lib/runtimeBranding';

interface LinkShareLayoutProps {}

const LinkShareLayout: FC<LinkShareLayoutProps> = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { member, isLoading: authLoading, signIn, isLoggedIn } = useAuth();
  const { id } = useParams();
  const [messages, setMessages] = useState<MonoMessage[]>([]);
  const [subject, setSubject] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');

  useEffect(() => {
    // Check for token in URL params (coming back from sign-in)
    if (tokenParam) {
      handleSignInWithToken(tokenParam);
    }
  }, [tokenParam]);

  const handleSignInWithToken = useCallback(
    async (token: string) => {
      try {
        if (!token) throw new Error('Invalid token received.');
        await signIn(token);
        toast.success(t('toast.link_share.sign_in_success'));

        // Check if we need to refresh data after sign-in
        if (id) {
          fetchData(id);
        }
      } catch (error: any) {
        toast.error(error.message || 'An error occurred during sign-in.');
      }
    },
    [signIn, id, t]
  );

  const fetchData = async (shareId: string) => {
    try {
      setIsLoading(true);

      const response = await shareApi.getLinkShare({ dataId: shareId });

      // Temporary array to store the parsed messages
      let messages: MonoMessage[] = [];

      if (response.sharedDataType === 'MESSAGE') {
        const sharedMessage = response.sharedEmailData as GmailMessage;
        messages = sharedMessage?.payload ? [MonoMessage.fromGmailMessage(sharedMessage)] : [];
        setSubject(sharedMessage.subject);
      } else if (response.sharedDataType === 'THREAD') {
        const threadMessages = response.sharedEmailData as GmailThreadGetResponse;
        // Parse all thread messages that have a usable payload
        messages = threadMessages.messages
          .filter((message) => message?.payload)
          .map((message) => MonoMessage.fromGmailMessage(message));
        setSubject((response.sharedEmailData as GmailThreadGetResponse).subject);
      }

      // Set the parsed messages to state
      setMessages(messages);
    } catch (error) {
      console.error('Error fetching public share data:', error);
      // Handle error here
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchData(id);
    }
  }, [id, member]);

  const handleSignInMono = () => {
    // Set return URL cookie for cross-domain redirect
    const domain = getShareCookieDomain();

    document.cookie = `mono_return_url=${encodeURIComponent(window.location.href)}; path=/; domain=${domain}; max-age=3600; SameSite=Lax`;

    // Redirect to sign-in page
    const client = isElectron ? 'web-electron' : 'web';
    window.open(`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=${client}`);
  };

  return (
    <main className="min-h-screen bg-background duration-500 animate-in fade-in-0">
      <BaseHeader
        className={'sticky top-0 z-10 h-fit w-full bg-background/80 p-2 backdrop-blur-xl'}
      >
        <div className="mx-auto flex items-center">
          <a href="/" className="flex cursor-pointer items-center gap-1">
            <MonoLogo className="w-9" />
            <span className="cursor-pointer text-xl font-semibold">Mono Mail</span>
          </a>

          <div className="ml-auto flex items-center gap-2">
            {/* {!isLoading &&
              (!isLoggedIn ? (
                <Button variant={'secondary'} onClick={handleSignInMono} className="cursor-pointer">
                  Sign in
                </Button>
              ) : (
                <Button
                  variant={'secondary'}
                  onClick={() => navigate('/')}
                  className="cursor-pointer"
                >
                  Go to Inbox
                </Button>
              ))} */}
            <Button asChild className="cursor-pointer">
              <a
                href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/download?utm_source=${encodeURIComponent(getUtmSource())}&utm_medium=email_share}`}
              >
                <MonoIcon type={'Apple'} className="mr-2" />
                Download Mono
              </a>
            </Button>
          </div>
        </div>
      </BaseHeader>
      <div className="overflow-hidden bg-background">
        {isLoading || authLoading ? (
          <div className="flex">
            <Loader className="mx-auto mt-16" />
          </div>
        ) : subject ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-transparent md:mx-auto md:max-w-[720px]">
            <div className="m-3 mb-0 md:mt-6">
              <div className="line-clamp-1 flex gap-2 rounded-lg border border-border bg-muted p-2 text-xs text-muted-foreground">
                <MonoIcon type={'AlertCircle'} />
                Mono does not control the Content sent via the Service, nor does it guarantee the
                accuracy, integrity or quality of said Content.
              </div>
            </div>
            <h1 className="mx-3 py-6 text-xl font-medium">{subject}</h1>
            <div className="w-full flex-1">
              <div className="flex flex-col items-center justify-center gap-8 md:mx-3">
                {messages.map((parsed, index) => (
                  <MessageCard
                    preview
                    className="w-full overflow-scroll"
                    cardClassName={cn(
                      'border-0 rounded-none md:border md:rounded-md border-y'
                      // index === messages.length - 1 && 'border-b'
                    )}
                    key={parsed.id}
                    item={parsed}
                  />
                ))}
              </div>
            </div>
            <div className="py-16 text-center text-xs text-muted-foreground">
              © 2025 Raum Labs.
            </div>
          </div>
        ) : (
          <div className="mt-16 flex h-full flex-col items-center justify-center text-center">
            <h1 className="text-md px-3 font-medium">{t('layout.link_share.not_found.title')}</h1>
          </div>
        )}
      </div>
    </main>
  );
};

export default LinkShareLayout;
