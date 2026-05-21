import { MonoAccount } from '@/main/api/auth/types';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { animated, useSpring, useTrail } from '@react-spring/web';
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface OnBoardingAddAccountsProps {
  selectedSpace: {
    name: string;
    icon: string;
    color: string;
    templateId: string;
  };
  accounts: MonoAccount[];
  onContinue: () => void;
  onAddAccount: (provider: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onSkip: () => void;
  onBack?: () => void;
  isCreatingSpace?: boolean; // Add this prop to track loading state
}

const EMAIL_PROVIDERS = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: 'Gmail' as MonoIconType,
    color: '#ea4335',
    description: 'Connect your Google workspace or personal Gmail',
    popular: true,
    supported: true
  },
  {
    id: 'outlook',
    name: 'Outlook',
    icon: 'Outlook' as MonoIconType,
    color: '#0078d4',
    description: 'Microsoft Outlook and Office 365 accounts',
    popular: true,
    supported: false
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    icon: 'Yahoo' as MonoIconType,
    color: '#6001d2',
    description: 'Yahoo Mail and Yahoo Business accounts',
    popular: false,
    supported: false
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    icon: 'Apple' as MonoIconType,
    color: '#007aff',
    description: 'Apple iCloud email accounts',
    popular: false,
    supported: false
  },
  {
    id: 'other',
    name: 'Other IMAP',
    icon: 'Envelope' as MonoIconType,
    color: '#6b7280',
    description: 'Any IMAP-compatible email provider',
    popular: false,
    supported: false
  }
];

const OnBoardingAddAccounts: FC<OnBoardingAddAccountsProps> = ({
  selectedSpace,
  onContinue,
  onAddAccount,
  onRemoveAccount,
  onSkip,
  onBack,
  isCreatingSpace = false
}) => {
  const { member, accounts } = useAuth();
  const { t } = useTranslation();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const addAccountUrl = `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/add-account?client=web-electron`;

  const leftTrail = useTrail(5, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 300
  });

  const providersTrail = useTrail(EMAIL_PROVIDERS.length, {
    from: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
    to: { opacity: 1, transform: 'translateY(0px) scale(1)' },
    config: { tension: 280, friction: 20 },
    delay: 600
  });

  const accountsTrail = useTrail(accounts.length, {
    from: { opacity: 0, transform: 'translateX(-20px)' },
    to: { opacity: 1, transform: 'translateX(0px)' },
    config: { tension: 280, friction: 20 },
    delay: 400
  });

  const continueButtonSpring = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: {
      opacity: 1,
      transform: 'translateY(0px)'
    },
    config: { tension: 300, friction: 25 }
  });

  const handleAddAccount = async (providerId: string) => {
    setConnectingProvider(providerId);
    try {
      await onAddAccount(providerId);
    } finally {
      setConnectingProvider(null);
    }
  };

  const getProviderIcon = (email: string) => {
    if (email.includes('@gmail.com') || email.includes('@googlemail.com')) return 'Gmail';
    if (
      email.includes('@outlook.com') ||
      email.includes('@hotmail.com') ||
      email.includes('@live.com')
    )
      return 'Mail';
    return 'Envelope';
  };

  const getProviderColor = (email: string) => {
    if (email.includes('@gmail.com') || email.includes('@googlemail.com')) return '#ea4335';
    if (
      email.includes('@outlook.com') ||
      email.includes('@hotmail.com') ||
      email.includes('@live.com')
    )
      return '#0078d4';
    return '#6b7280';
  };

  const renderProviderButton = (provider: any, springStyle: any) => {
    const isConnecting = connectingProvider === provider.id;
    const isSupported = provider.supported;

    const buttonContent = (
      <div
        className={`group relative w-full rounded-lg border p-4 text-left transition-all duration-200 ${
          isSupported ? 'cursor-pointer hover:shadow-md' : 'cursor-not-allowed opacity-20'
        } disabled:opacity-50`}
      >
        <div className="flex items-center gap-4">
          <div
            className="rounded-lg p-2.5"
            style={{
              backgroundColor: `${provider.color}20`,
              color: provider.color
            }}
          >
            {isConnecting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <MonoIcon type={provider.icon} className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-medium">{provider.name}</h3>
            <p className="text-sm text-muted-foreground">{provider.description}</p>
          </div>
          <MonoIcon
            type="Plus"
            className={`h-5 w-5 text-foreground transition-transform ${
              isSupported ? 'group-hover:translate-x-1' : ''
            }`}
          />
        </div>
      </div>
    );

    if (!isSupported) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent>
            <p>Coming soon - Not supported yet</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <a
        href={addAccountUrl}
        target="_blank"
        rel="noreferrer"
      >
        {buttonContent}
      </a>
    );
  };

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-7xl p-6">
        <Button
          variant="ghost"
          sizeVariant="sm"
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground"
          disabled={isCreatingSpace}
        >
          <MonoIcon type="ChevronLeft" className="h-4 w-4" />
          {t('onboarding.add_accounts.back')}
        </Button>

        <div className="flex items-start gap-12">
          <div className="flex-1">
            {leftTrail.map((style, index) => {
              if (index === 0) {
                return (
                  <animated.div key="space-info" style={style} className="mb-6">
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="rounded-lg p-2"
                        style={{
                          backgroundColor: `${selectedSpace.color}20`,
                          color: selectedSpace.color
                        }}
                      >
                        <MonoIcon type={selectedSpace.icon as MonoIconType} className="h-5 w-5" />
                      </div>
                      <h2 className="text-lg font-medium text-muted-foreground">
                        {t('onboarding.add_accounts.setting_up')}:{' '}
                        <span className="text-foreground">{selectedSpace.name}</span>
                      </h2>
                    </div>
                  </animated.div>
                );
              }
              if (index === 1) {
                return (
                  <animated.h1
                    key="title"
                    style={style}
                    className="mb-2 text-3xl font-medium leading-tight text-foreground"
                  >
                    {t('onboarding.add_accounts.title')}
                  </animated.h1>
                );
              }
              if (index === 2) {
                return (
                  <animated.p
                    key="description"
                    style={style}
                    className="mb-8 text-lg leading-relaxed text-muted-foreground"
                  >
                    {t('onboarding.add_accounts.description')}
                  </animated.p>
                );
              }
              if (index === 3) {
                return (
                  <animated.div key="connected-accounts" style={style} className="mb-8">
                    {accounts.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">
                          {t('onboarding.add_accounts.connected_accounts')} ({accounts.length})
                        </h3>
                        <div className="space-y-3">
                          {accountsTrail.map((accountStyle, accountIndex) => {
                            const account = accounts[accountIndex];
                            if (!account) return null;
                            return (
                              <animated.div
                                key={account.uid}
                                style={accountStyle}
                                className="flex items-center gap-4 border-b px-1 py-6 first:pt-2 last:border-0"
                              >
                                <MonoIcon
                                  type={getProviderIcon(account.email) as MonoIconType}
                                  className="h-5 w-5 text-foreground/80"
                                />
                                <div className="flex-1">
                                  <span className="text-sm">{account.email}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {t('onboarding.add_accounts.primary_account')}
                                </div>
                              </animated.div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="">
                      <Button
                        sizeVariant="xl"
                        variant={'secondary'}
                        className="w-full"
                        disabled={accounts.length === 0 || isCreatingSpace}
                        asChild
                      >
                        <a
                          href={addAccountUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MonoIcon type="Plus" className="mr-2 h-4 w-4" />
                          {t('onboarding.add_accounts.connect_another')}
                        </a>
                      </Button>
                    </div>
                  </animated.div>
                );
              }
              if (index === 4) {
                return (
                  <animated.div key="continue-button" style={style} className={'mt-12'}>
                    <animated.div style={continueButtonSpring}>
                      <Button
                        sizeVariant="xl"
                        onClick={onContinue}
                        className="px-8"
                        disabled={accounts.length === 0 || isCreatingSpace}
                      >
                        {isCreatingSpace ? (
                          <>
                            <Loader className="mr-2" />
                            Creating space...
                          </>
                        ) : accounts.length === 0 ? (
                          t('onboarding.add_accounts.connect_prompt')
                        ) : (
                          t('onboarding.add_accounts.continue')
                        )}
                      </Button>
                      {accounts.length === 0 && !isCreatingSpace && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t('onboarding.add_accounts.connect_hint')}
                        </p>
                      )}
                    </animated.div>
                  </animated.div>
                );
              }
              return null;
            })}
          </div>

          <div className="relative flex-1 shrink-0">
            <div className="rounded-lg border bg-background p-6 shadow-sm">
              <div className="mb-6">
                <h3 className="mb-2 text-lg font-medium">
                  {t('onboarding.add_accounts.choose_provider')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('onboarding.add_accounts.choose_provider_description')}
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-3">
                  {providersTrail.map((springStyle, providerIndex) => {
                    const provider = EMAIL_PROVIDERS[providerIndex];
                    if (!provider.popular) return null;

                    return (
                      <animated.div key={provider.id} style={springStyle}>
                        {renderProviderButton(provider, springStyle)}
                      </animated.div>
                    );
                  })}
                  {providersTrail.map((springStyle, providerIndex) => {
                    const provider = EMAIL_PROVIDERS[providerIndex];
                    if (provider.popular) return null;

                    return (
                      <animated.div key={provider.id} style={springStyle}>
                        {renderProviderButton(provider, springStyle)}
                      </animated.div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 rounded-lg bg-muted p-4">
                <div className="flex items-start gap-3">
                  <MonoIcon type={'AlertCircle'} className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="mb-1 font-medium">{t('onboarding.add_accounts.help_title')}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t('onboarding.add_accounts.help_description')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default OnBoardingAddAccounts;
