import MonoIcon from '@/renderer/app/components/icons/icons';
import React, { FC } from 'react';
import { useTrail, animated } from '@react-spring/web';
import { Button } from '@/renderer/app/components/ui/button';
import { isElectron } from '@/renderer/app/lib/electronApi';

interface OnBoardingGmailProps {
  onContinue: () => void;
}

const OnBoardingGmail: FC<OnBoardingGmailProps> = ({ onContinue }) => {
  const elements = ['icon', 'title', 'description', 'button'];

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
    <div className="text-center">
      {trail.map((style, index) => {
        if (index === 0) {
          return (
            <animated.div key="icon" style={style} className="flex justify-center mb-4">
              <MonoIcon type="Gmail" className="w-10 h-10" />
            </animated.div>
          );
        }
        if (index === 1) {
          return (
            <animated.div key="title" style={style} className="text-2xl font-semibold mb-3">
              Connect with Gmail
            </animated.div>
          );
        }
        if (index === 2) {
          return (
            <animated.div key="description" style={style} className="text-lg mb-6">
              Integrate Gmail to streamline your email experience.
            </animated.div>
          );
        }
        if (index === 3) {
          return (
            <animated.div key="button" style={style} className="flex justify-center mt-4">
              <Button sizeVariant="xl" onClick={handleSignIn}>
                Sign in with Google
              </Button>
            </animated.div>
          );
        }
        return null;
      })}
    </div>
  );
};

export default OnBoardingGmail;
