import { MonoAccount } from '@/main/api/auth/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { SelectedSpace } from '@/renderer/app/containers/layout/OnBoardingLayout';
import {
  AI_FILTER_TEMPLATES,
  generateMockEmails,
  MockEmail
} from '@/renderer/app/containers/onboarding/aiFilterExamples';
import { animated, useSpring, useTrail } from '@react-spring/web';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface OnBoardingAIFiltersProps {
  selectedSpace: SelectedSpace | null;
  accounts: Array<MonoAccount>;
  onContinue: () => void;
  onBack?: () => void;
}

const OnBoardingAIFilters: FC<OnBoardingAIFiltersProps> = ({
  selectedSpace,
  onContinue,
  onBack
}) => {
  const { t } = useTranslation();
  const [animationPhase, setAnimationPhase] = useState(0);
  const [mockEmails, setMockEmails] = useState<MockEmail[]>([]);

  const filters =
    AI_FILTER_TEMPLATES[selectedSpace?.templateId as keyof typeof AI_FILTER_TEMPLATES] ||
    AI_FILTER_TEMPLATES.work;

  const leftTrail = useTrail(4, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 300
  });

  const emailsSpring = useTrail(mockEmails.length, {
    from: { opacity: 0, transform: 'translateX(20px)', filter: 'blur(4px)' },
    to: {
      opacity: animationPhase >= 1 ? 1 : 0,
      transform: animationPhase >= 1 ? 'translateX(0px)' : 'translateX(20px)',
      filter: animationPhase >= 1 ? 'blur(0px)' : 'blur(4px)'
    },
    config: { tension: 280, friction: 25 }
  });

  const labelSpring = useSpring({
    from: { opacity: 0, scale: 0.8 },
    to: { opacity: animationPhase >= 2 ? 1 : 0, scale: animationPhase >= 2 ? 1 : 0.8 },
    config: { tension: 300, friction: 20 },
    delay: 0
  });

  useEffect(() => {
    if (selectedSpace?.templateId) {
      setMockEmails(generateMockEmails(selectedSpace.templateId));

      // Animation sequence
      const timer1 = setTimeout(() => setAnimationPhase(1), 300);
      const timer2 = setTimeout(() => setAnimationPhase(2), 1000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
    return undefined;
  }, [selectedSpace?.templateId]);

  const getFilterForEmail = (email: any) => {
    return filters.find((f) => f.id === email.filter);
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <Button
        variant="ghost"
        sizeVariant="sm"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        <MonoIcon type="ChevronLeft" className="h-4 w-4" />
        {t('onboarding.add_accounts.back')}
      </Button>
      <div className="mb-24 flex items-center gap-12">
        {/* Left Side - Content */}
        <div className="flex-1">
          {leftTrail.map((style, index) => {
            if (index === 0) {
              return (
                <animated.h1
                  key="title"
                  style={style}
                  className="mb-2 text-3xl font-medium leading-tight text-foreground"
                >
                  {t('onboarding.ai_filters.title', {
                    default: "We'll organize everything for you"
                  })}
                </animated.h1>
              );
            }
            if (index === 1) {
              return (
                <animated.p
                  key="description"
                  style={style}
                  className="mb-4 text-lg leading-relaxed text-muted-foreground"
                >
                  {t('onboarding.ai_filters.description', {
                    default:
                      'Our AI will automatically sort your emails into smart categories, so you can focus on what matters most.'
                  })}
                </animated.p>
              );
            }
            // if (index === 2) {
            //   return (
            //     <animated.div key="accounts" style={style} className="space-y-3">
            //       <h3 className="text-lg font-medium">Connected Accounts</h3>
            //       <div className="space-y-3">
            //         {accounts.map((account, accountIndex) => (
            //           <div
            //             key={account.uid}
            //             className="flex items-center gap-4 rounded-lg border p-4 shadow-sm"
            //           >
            //             <MonoIcon type={'Gmail'} className="h-5 w-5" />
            //
            //             <span className="text-sm font-medium">{account.email}</span>
            //
            //             <Badge
            //               variant={'secondary'}
            //               sizeVariant={'sm'}
            //               className={'ml-auto rounded-sm'}
            //             >
            //               Connected
            //             </Badge>
            //           </div>
            //         ))}
            //         <button
            //           onClick={onAddAccount}
            //           className="flex w-full items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/20 hover:text-foreground"
            //         >
            //           <MonoIcon type="Plus" className="h-4 w-4 text-muted-foreground" />
            //           <span className="text-sm text-muted-foreground">Connect more accounts</span>
            //         </button>
            //       </div>
            //     </animated.div>
            //   );
            // }
            if (index === 3) {
              return (
                <animated.div key="continue-button" style={style} className={'mt-12'}>
                  <Button sizeVariant="xl" onClick={onContinue} className="px-8">
                    {t('onboarding.ai_filters.continue')}
                  </Button>
                </animated.div>
              );
            }
            return null;
          })}
        </div>

        {/* Right Side - Email Preview */}
        <div className="relative flex-1 shrink-0 space-y-4">
          <animated.div
            style={useSpring({
              from: { opacity: 0, transform: 'translateY(10px)' },
              to: { opacity: 1, transform: 'translateY(0px)' },
              config: { tension: 300, friction: 25 },
              delay: 600
            })}
            className="flex justify-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
              <MonoIcon type="Sparkles" className="h-4 w-4" />
              {t('onboarding.ai_filters.preview_label')}
            </div>
          </animated.div>
          <div className="rounded-lg border bg-background p-4 shadow-sm">
            <div className="space-y-2">
              {emailsSpring.map((springStyle, index) => {
                const email = mockEmails[index];
                if (!email) return null;

                const filter = getFilterForEmail(email);

                return (
                  <animated.div key={email.subject} style={springStyle} className="relative">
                    <div className="flex items-center gap-3 rounded-lg bg-background p-3 transition-colors hover:bg-muted/50">
                      <div
                        className={`h-2 w-2 rounded-full ${email.isNew ? 'bg-primary' : 'bg-accent'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{email.sender}</span>
                          <span className="text-xs text-muted-foreground">{email.time}</span>
                        </div>
                        <div className="truncate text-start text-sm text-muted-foreground">
                          {email.subject}
                        </div>
                      </div>

                      {/* Animated Label */}
                      {filter && (
                        <animated.div style={labelSpring}>
                          <Badge
                            className="shrink-0 rounded-sm text-xs"
                            style={{
                              backgroundColor: `${filter.color.background}`,
                              color: filter.color.text
                            }}
                            variant={'default'}
                            sizeVariant={'sm'}
                          >
                            {filter.name}
                          </Badge>
                        </animated.div>
                      )}
                    </div>
                  </animated.div>
                );
              })}
            </div>
          </div>
          {/* AI Badge above email list */}
        </div>
      </div>
    </div>
  );
};

export default OnBoardingAIFilters;
