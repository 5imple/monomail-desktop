import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { Button } from '@/renderer/app/components/ui/button';
import ThemeSkeleton from '@/renderer/app/components/ui/theme-skeleton';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { animated, useTrail, useSpring, config } from '@react-spring/web';
import { FC, useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import MonoIcon from '@/renderer/app/components/icons/icons';

const OnBoardingAppearance: FC<{
  activeTheme: 'light' | 'dark';
  onContinue: () => void;
  onThemeChange?: (theme: 'light' | 'dark') => void;
}> = ({ activeTheme, onContinue, onThemeChange }) => {
  const { t } = useTranslation();
  const { currentTheme, setTheme } = useTheme();
  const { updatePreference, preference } = useAuth();
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Memoize translations
  const translations = useMemo(
    () => ({
      title: t('onboarding.appearance.title'),
      description: t('onboarding.appearance.description'),
      button: t('onboarding.appearance.button'),
      themeTitle: t('onboarding.appearance.theme_selection.title'),
      themeDescription: t('onboarding.appearance.theme_selection.description'),
      lightLabel: t('onboarding.appearance.theme_selection.light.label'),
      darkLabel: t('onboarding.appearance.theme_selection.dark.label'),
      lightDescription: t('onboarding.appearance.theme_selection.light.description'),
      darkDescription: t('onboarding.appearance.theme_selection.dark.description')
    }),
    [t]
  );

  // Optimized animations with reduced complexity
  const leftTrail = useTrail(3, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 300
  });

  const rightSectionSpring = useTrail(2, {
    from: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
    to: { opacity: 1, transform: 'translateY(0px) scale(1)' },
    config: { tension: 280, friction: 20 },
    delay: 500
  });

  const continueButtonSpring = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 300, friction: 25 },
    delay: 800
  });

  // Memoize theme options
  const themeOptions = useMemo(
    () => [
      { key: 'light', label: translations.lightLabel, description: translations.lightDescription },
      { key: 'dark', label: translations.darkLabel, description: translations.darkDescription }
    ],
    [translations]
  );

  // Optimize theme change with useCallback
  const handleChangeAppearance = useCallback(
    (newTheme: 'dark' | 'light') => {
      setIsTransitioning(true);
      electronApi.changeAppearance(newTheme);
      onThemeChange?.(newTheme);

      // Use requestAnimationFrame for smoother transitions
      requestAnimationFrame(() => {
        setTimeout(() => {
          setIsTransitioning(false);
        }, 500); // Reduced timeout
      });
    },
    [isTransitioning, onThemeChange]
  );

  // Optimize continue handler
  const handleContinue = useCallback(() => {
    updatePreference({
      appearance: {
        ...preference.appearance,
        theme: currentTheme
      }
    });
    setTheme(activeTheme);
    onContinue();
  }, [updatePreference, preference, currentTheme, setTheme, activeTheme, onContinue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTheme('light');
    }, 300); // Reduced timeout

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const mappedTheme = currentTheme === 'black' || currentTheme === 'dark' ? 'dark' : 'light';
    onThemeChange?.(mappedTheme);
  }, [currentTheme, onThemeChange]);

  return (
    <>
      <div className={cn('mx-auto max-w-7xl p-6', activeTheme)}>
        <div className="flex w-full items-start gap-12">
          {/* Left Side - Content */}
          <div className="mb-16 flex h-full flex-1 flex-col">
            {leftTrail.map((style, index) => {
              if (index === 0) {
                return (
                  <animated.h1
                    key="title"
                    style={style}
                    className="mb-2 text-3xl font-medium leading-tight text-foreground will-change-transform"
                  >
                    {translations.title}
                  </animated.h1>
                );
              }
              if (index === 1) {
                return (
                  <animated.p
                    key="description"
                    style={style}
                    className="text-lg leading-relaxed text-muted-foreground will-change-transform"
                  >
                    {translations.description}
                  </animated.p>
                );
              }

              if (index === 2) {
                return (
                  <animated.div key="continue-button" style={style} className="mt-12">
                    <animated.div style={continueButtonSpring}>
                      <Button sizeVariant="xl" onClick={handleContinue} disabled={isTransitioning}>
                        {translations.button}
                      </Button>
                    </animated.div>
                  </animated.div>
                );
              }
              return null;
            })}
          </div>

          {/* Right Side - Settings */}
          <div className="relative flex-1 shrink-0 space-y-6">
            {/* Theme Selection */}
            <animated.div
              style={rightSectionSpring[0]}
              className="rounded-lg border bg-background p-6 shadow-sm will-change-transform"
            >
              <div className="mb-6">
                <h3 className="text-lg font-medium text-foreground">{translations.themeTitle}</h3>
                <p className="text-sm text-muted-foreground">{translations.themeDescription}</p>
              </div>

              <div className="space-y-3">
                {themeOptions.map((themeOption) => {
                  const isSelected = activeTheme === themeOption.key;

                  return (
                    <div
                      key={themeOption.key}
                      className="cursor-pointer"
                      onClick={() => handleChangeAppearance(themeOption.key as 'dark' | 'light')}
                    >
                      <div
                        className={cn(
                          'rounded-xl p-4 transition-all duration-200 hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0">
                            <ThemeSkeleton
                              type={themeOption.key}
                              className={cn(
                                'transition-all duration-200',
                                isSelected ? 'ring-2 ring-primary' : ''
                              )}
                            />
                          </div>
                          <div className="flex-1">
                            <h4 className="mb-1 font-medium text-foreground">
                              {themeOption.label}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {themeOption.description}
                            </p>
                          </div>

                          <div
                            className={cn(
                              'shrink-0 opacity-0 transition-opacity duration-200',
                              isSelected && 'opacity-100'
                            )}
                          >
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </animated.div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OnBoardingAppearance;
