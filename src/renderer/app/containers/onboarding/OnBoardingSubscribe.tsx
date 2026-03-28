import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Switch } from '@/renderer/app/components/ui/switch';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { animated, useTrail } from '@react-spring/web';
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDiscordInviteUrl, getSocialXUrl } from '@/renderer/app/lib/runtimeBranding';

interface OnBoardingSubscribeProps {
  onContinue: () => void;
}

const OnBoardingSubscribe: FC<OnBoardingSubscribeProps> = ({ onContinue }) => {
  const { t } = useTranslation();
  const elements = ['icon', 'title', 'description', 'button'];
  const { updatePreference, preference } = useAuth();

  const [marketingAgreement, setMarketingAgreement] = useState(true);

  const trail = useTrail(elements.length, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 400
  });

  const handleSignIn = () => {
    if (isElectron) {
      window.open(`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=web-electron`);
    } else {
      window.open(`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=web`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6 text-center">
      {trail.map((style, index) => {
        if (index === 0) {
          return (
            <animated.div key="title" style={style} className="mb-3 text-2xl font-semibold">
              {t('onboarding.subscribe.title')}
            </animated.div>
          );
        }
        if (index === 1) {
          return (
            <animated.div key="description" style={style} className="mb-6 text-lg">
              {t('onboarding.subscribe.description')}
            </animated.div>
          );
        }
        if (index === 2) {
          return (
            <animated.div key="content" style={style} className="mb-6 text-lg">
              <div className="flex flex-col rounded-md border">
                <div className="flex items-center gap-6 p-6">
                  <div className="text-start">
                    <div>{t('onboarding.subscribe.subscribe_changelog')}</div>
                    <div className="text-sm text-muted-foreground">
                      {t('onboarding.subscribe.subscribe_changelog_description')}
                    </div>
                  </div>
                  <div className="ml-auto">
                    <Switch checked={marketingAgreement} onCheckedChange={setMarketingAgreement} />
                  </div>
                </div>
                {getSocialXUrl() ? (
                  <>
                    <Separator />
                    <div className="flex items-center gap-6 p-6">
                      <div className="text-start">
                        <div className="flex items-center">
                          <MonoIcon type={'Twitter'} className="mr-2" />
                          {t('onboarding.subscribe.follow_x')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t('onboarding.subscribe.follow_x_description')}
                        </div>
                      </div>
                      <div className="ml-auto">
                        <Button variant={'secondary'} asChild>
                          <a href={getSocialXUrl()} target="_blank" rel="noreferrer">
                            {t('onboarding.subscribe.follow_x')}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
                {getDiscordInviteUrl() ? (
                  <>
                    <Separator />
                    <div className="flex items-center gap-6 p-6">
                      <div className="text-start">
                        <div className="flex items-center">
                          <MonoIcon type={'Discord'} className="mr-2" />
                          {t('onboarding.subscribe.join_discord')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t('onboarding.subscribe.join_discord_description')}
                        </div>
                      </div>
                      <div className="ml-auto">
                        <Button variant={'secondary'} asChild>
                          <a href={getDiscordInviteUrl()} target="_blank" rel="noreferrer">
                            {t('onboarding.subscribe.join_discord')}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </animated.div>
          );
        }
        if (index === 3) {
          return (
            <animated.div key="button" style={style} className="mt-4 flex justify-center">
              <Button
                sizeVariant="xl"
                onClick={() => {
                  updatePreference({
                    notification: {
                      ...preference.notification,
                      marketingEmails: marketingAgreement
                    }
                  });
                  onContinue();
                }}
              >
                {t('onboarding.subscribe.button')}
              </Button>
            </animated.div>
          );
        }
        return null;
      })}
    </div>
  );
};

export default OnBoardingSubscribe;
