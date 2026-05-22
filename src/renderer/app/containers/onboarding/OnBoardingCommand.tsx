import { Button } from '@/renderer/app/components/ui/button';
import CommandPalette from '@/renderer/app/containers/command/CommandPalette';
import { animated, useTrail } from '@react-spring/web';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface OnBoardingCommandProps {
  onContinue: () => void;
}

const OnBoardingCommand: FC<OnBoardingCommandProps> = ({ onContinue }) => {
  const { t } = useTranslation();
  // Local state for Command Palette
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [bookmarkName, setBookmarkName] = useState<string>('');
  const [bookmarkIcon, setBookmarkIcon] = useState<string>('');
  const [pages, setPages] = useState<string[]>([]);
  const [pinContact, setPinContact] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const trail = useTrail(4, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 300
  });
  useEffect(() => {
    const timeout = setTimeout(() => {
      setOpen(true);
    }, 0);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="text-center">
      {trail.map((style, index) => {
        if (index === 0) {
          return (
            <animated.h1 key="title" style={style} className="mb-3 text-2xl font-semibold">
              {t('onboarding.command.title')}
            </animated.h1>
          );
        }
        if (index === 1) {
          return (
            <animated.p key="description" style={style} className="text-xl">
              {t('onboarding.command.description')}
            </animated.p>
          );
        }
        if (index === 2) {
          return (
            <animated.div key="shortcuts" style={style} className="h-[500px] rounded-lg py-8">
              {/* Localized CommandPalette */}
              <CommandPalette
                overlay={false}
                searchQuery={searchQuery}
                bookmarkName={bookmarkName}
                bookmarkIcon={bookmarkIcon}
                pages={pages}
                pinContact={pinContact}
                setSearchQuery={setSearchQuery}
                setBookmarkName={setBookmarkName}
                setBookmarkIcon={setBookmarkIcon}
                setPages={setPages}
                setPinContact={setPinContact}
                selectedAccountId={selectedAccountId}
                setSelectedAccountId={setSelectedAccountId}
                selectedSpaceId={undefined}
                setSelectedSpaceId={() => {}} // No-op for onboarding
                open={open} // Always open during onboarding
                onOpenChange={() => {}} // No-op for onboarding
              />
            </animated.div>
          );
        }
        if (index === 3) {
          return (
            <animated.div
              key="button"
              style={style}
              className="pointer-events-auto flex justify-center"
            >
              <Button
                sizeVariant="xl"
                onClick={() => {
                  setOpen(false);
                  setTimeout(() => {
                    onContinue();
                  }, 0);
                }}
              >
                {t('onboarding.command.button')}
              </Button>
            </animated.div>
          );
        }
        return null;
      })}
    </div>
  );
};

export default OnBoardingCommand;
