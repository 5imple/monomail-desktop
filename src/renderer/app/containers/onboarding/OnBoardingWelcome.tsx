import MonoLogo from '@/renderer/app/components/common/MonoLogo';
import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { Button } from '@/renderer/app/components/ui/button';
import { cn } from '@/renderer/app/lib/utils';
import { animated, easings, useSpring, useTrail, config } from '@react-spring/web';
import { FC, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const OnboardingWelcome: FC<{ onContinue: () => void }> = ({ onContinue }) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Memoize translation strings to prevent re-renders
  const translations = useMemo(
    () => ({
      title: t('onboarding.welcome.title'),
      description: t('onboarding.welcome.description'),
      button: t('onboarding.welcome.button')
    }),
    [t]
  );

  // Optimized logo animation with reduced complexity
  const logoAnimation = useSpring({
    from: { opacity: 0, transform: 'scale(5) translateY(500%)', filter: 'blur(8px)' },
    to: { opacity: 1, transform: 'scale(1) translateY(0%)', filter: 'blur(0)' },
    config: {
      tension: 200,
      duration: 1500,
      easing: easings.easeOutCubic
    }
  });

  // Memoize elements to prevent recreation on each render
  const elements = useMemo(
    () => [
      <h1 key="title" className="mb-2 text-3xl font-medium">
        {translations.title}
      </h1>,
      <p key="description" className="mb-8 text-lg">
        {translations.description}
      </p>,
      <div key="button" className="mt-4 flex justify-center">
        <Button sizeVariant="xl" onClick={onContinue} disabled={isTransitioning}>
          {translations.button}
        </Button>
      </div>
    ],
    [translations, onContinue, isTransitioning]
  );

  // Optimized trail animation
  const trail = useTrail(elements.length, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 100, friction: 20 },
    delay: 1000 // Starts after the logo animation finishes
  });

  return (
    <div className="pb-4 text-center">
      {/* Logo Animation with will-change optimization */}
      <div className="mb-2">
        <animated.div
          style={logoAnimation}
          className="will-change-transform" // Only specify what actually changes
        >
          <MonoLogo className="mx-auto h-28 w-28 text-foreground" />
        </animated.div>
      </div>

      {/* Trail Animation for Titles and Others */}
      {trail.map((style, index) => (
        <animated.div
          key={elements[index].key} // Use stable keys
          style={style}
          className="will-change-transform" // Only specify what actually changes
        >
          {elements[index]}
        </animated.div>
      ))}
    </div>
  );
};

export default OnboardingWelcome;
