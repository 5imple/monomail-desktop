import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Separator } from '@/renderer/app/components/ui/separator';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { animated, useTrail } from '@react-spring/web';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface OnBoardingFinalProps {
  onContinue: () => void;
}

const OnBoardingFinal: FC<OnBoardingFinalProps> = ({ onContinue }) => {
  const { t } = useTranslation();
  const elements = ['icon', 'title', 'description', 'button'];

  const trail = useTrail(elements.length, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 400
  });

  const handleSignIn = () => {
    const client = isElectron ? 'web-electron' : 'web';
    window.open(`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=${client}`);
  };

  const features = [
    {
      icon: 'Bolt',
      title: t('onboarding.final.features.feedback.title'),
      subtitle: (
        <>
          {t('onboarding.final.features.feedback.description')}{' '}
          <ShortcutKeyboard shortcut={'G+F'} className="inline-flex" />
        </>
      )
    },
    {
      icon: 'Send',
      title: t('onboarding.final.features.compose.title'),
      subtitle: (
        <>
          {t('onboarding.final.features.compose.description')}{' '}
          <ShortcutKeyboard shortcut={'C'} className="inline-block" />
        </>
      )
    },
    // {
    //   icon: 'UserPlus',
    //   title: 'Tell your team',
    //   subtitle: 'Make sure to invite your team members.'
    // },
    // {
    //   icon: 'Bolt',
    //   title: 'Integrate Github & Slack',
    //   subtitle: 'Link your pull requests and create issues from Slack.'
    // },
    {
      icon: 'Command',
      title: t('onboarding.final.features.keyboard_shortcuts.title'),
      subtitle: (
        <>
          {t('onboarding.final.features.keyboard_shortcuts.description')}{' '}
          <ShortcutKeyboard shortcut={'?'} className="inline-block" />
        </>
      )
    }
  ];

  return (
    <div className="mx-auto max-w-xl p-6 text-center">
      {trail.map((style, index) => {
        switch (index) {
          case 0:
            return (
              <animated.div key="title" style={style} className="mb-3 text-2xl font-semibold">
                {t('onboarding.final.title')}
              </animated.div>
            );
          case 1:
            return (
              <animated.div key="description" style={style} className="mb-6 text-lg">
                {t('onboarding.final.description')}
              </animated.div>
            );
          case 2:
            return (
              <animated.div key="content" style={style} className="mb-6 text-lg">
                <div className="flex min-w-[380px] flex-col rounded-md border">
                  {features.map(({ icon, title, subtitle }, idx) => (
                    <React.Fragment key={idx}>
                      <div className="flex items-center gap-6 p-6">
                        <div className="text-start">
                          <div className="mb-2">
                            <MonoIcon type={icon as MonoIconType} />
                          </div>
                          <div>{title}</div>
                          <div className="text-sm text-muted-foreground">{subtitle}</div>
                        </div>
                      </div>
                      {idx < features.length - 1 && <Separator />}
                    </React.Fragment>
                  ))}
                </div>
              </animated.div>
            );
          case 3:
            return (
              <animated.div key="button" style={style} className="mt-4 flex justify-center">
                <Button
                  sizeVariant="xl"
                  onClick={() => {
                    onContinue();
                  }}
                >
                  {t('onboarding.final.button')}
                </Button>
              </animated.div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};

export default OnBoardingFinal;
