import { animated, useTrail } from '@react-spring/web';
import { FC, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';

interface OnBoardingCommandTriggerProps {
  onContinue: () => void;
}

const OnBoardingCommandTrigger: FC<OnBoardingCommandTriggerProps> = ({ onContinue }) => {
  const { t } = useTranslation();
  const [activeKeys, setActiveKeys] = useState<{ cmd: boolean; k: boolean }>({
    cmd: false,
    k: false
  });

  const elements = ['title', 'description', 'shortcuts', 'button'];

  const trail = useTrail(elements.length, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 400
  });

  // Handle keydown events for ⌘ and K
  useHotkeys('MOD', () => setActiveKeys((prev) => ({ ...prev, cmd: true })), {
    keydown: true,
    preventDefault: true,
    useKey: true
  });

  useHotkeys('K', () => setActiveKeys((prev) => ({ ...prev, k: true })), {
    keydown: true,
    preventDefault: true,
    useKey: true
  });

  // Handle keyup events to reset state
  useHotkeys('MOD', () => setActiveKeys((prev) => ({ ...prev, cmd: false })), {
    keyup: true,
    preventDefault: true,
    useKey: true
  });

  useHotkeys('K', () => setActiveKeys((prev) => ({ ...prev, k: false })), {
    keyup: true,
    preventDefault: true,
    useKey: true
  });

  // Trigger the command menu when ⌘ + K is pressed
  useHotkeys(
    'MOD+K',
    () => {
      onContinue();
      // Trigger your command menu logic here
    },
    { keydown: true, preventDefault: true }
  );

  return (
    <div className="text-center">
      {trail.map((style, index) => {
        if (index === 0) {
          return (
            <animated.h1 key="title" style={style} className="mb-3 text-2xl font-semibold">
              {t('onboarding.command_trigger.title')}
            </animated.h1>
          );
        }
        if (index === 1) {
          return (
            <animated.div key="description" style={style} className="mb-6 text-xl">
              <p>{t('onboarding.command_trigger.description')}.</p>
              <p>{t('onboarding.command_trigger.shortcut_hint')}</p>
            </animated.div>
          );
        }

        if (index === 2) {
          return (
            <animated.div
              key="shortcuts"
              style={style}
              className="flex flex-col items-center gap-6 rounded-lg pb-8"
            >
              <div className="flex gap-8">
                <div
                  className={`rounded-2xl border-2 transition-all ${
                    activeKeys.cmd
                      ? 'border-2 text-foreground'
                      : 'border-b-[8px] text-muted-foreground'
                  } flex h-32 w-32 items-center justify-center bg-muted text-[48px] shadow-md`}
                >
                  ⌘
                </div>
                <div
                  className={`rounded-2xl border-2 transition-all ${
                    activeKeys.k
                      ? 'border-2 text-foreground'
                      : 'border-b-[8px] text-muted-foreground'
                  } flex h-32 w-32 items-center justify-center bg-muted text-[48px] shadow-md`}
                >
                  K
                </div>
              </div>
            </animated.div>
          );
        }
        // if (index === 3) {
        //   return (
        //     <animated.div key="button" style={style} className="flex justify-center mt-4">
        //       <Button sizeVariant="xl" onClick={onContinue}>
        //         Continue
        //       </Button>
        //     </animated.div>
        //   );
        // }
        return null;
      })}
    </div>
  );
};

export default OnBoardingCommandTrigger;
