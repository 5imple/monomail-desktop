import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import { Progress } from '@/renderer/app/components/ui/progress';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useOnboardingAtom } from '@/renderer/app/store/onboarding/useOnBoardingAtom';

interface OnboardingChecklistDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  key: string;
}

const OnboardingChecklistDialog: FC<OnboardingChecklistDialogProps> = ({
  children,
  open = true,
  onOpenChange
}) => {
  const { t } = useTranslation();
  const { member } = useAuth();
  // This is a placeholder - you'll need to implement the actual onboarding state management
  const { onboardingState, updateOnboardingStep } = useOnboardingAtom();

  // Sample onboarding steps - replace with your actual steps from state management
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: 1,
      title: t('onboarding.step1.title', 'Send your first AI-drafted reply'),
      description: t('onboarding.step1.description', 'Filter emails with Needs Reply label'),
      completed: onboardingState?.firstReply || false,
      key: 'firstReply'
    },
    {
      id: 2,
      title: t('onboarding.step2.title', 'Create an AI filter & label'),
      description: t('onboarding.step2.description', 'Setup automatic email filtering'),
      completed: onboardingState?.aiFilter || false,
      key: 'aiFilter'
    },
    {
      id: 3,
      title: t('onboarding.step3.title', 'Install the Mono Chrome Extension'),
      description: t('onboarding.step3.description', 'Access Mono directly in your browser'),
      completed: onboardingState?.extensionInstalled || false,
      key: 'extensionInstalled'
    },
    {
      id: 4,
      title: t('onboarding.step4.title', 'Ask questions about your emails and attachments'),
      description: t('onboarding.step4.description', 'Use AI to analyze email content'),
      completed: onboardingState?.askedQuestions || false,
      key: 'askedQuestions'
    },
    {
      id: 5,
      title: t('onboarding.step5.title', 'Create a calendar event using Mono'),
      description: t('onboarding.step5.description', 'Schedule meetings with AI assistance'),
      completed: onboardingState?.calendarEvent || false,
      key: 'calendarEvent'
    },
    {
      id: 6,
      title: t('onboarding.step6.title', 'Fine-tune your reply writing style'),
      description: t('onboarding.step6.description', 'Customize AI writing to match your voice'),
      completed: onboardingState?.styleTuned || false,
      key: 'styleTuned'
    },
    {
      id: 7,
      title: t('onboarding.step7.title', 'Create your first inbox rule'),
      description: t('onboarding.step7.description', 'Automate email organization'),
      completed: onboardingState?.inboxRule || false,
      key: 'inboxRule'
    }
  ]);

  // Calculate completion percentage
  const completedSteps = steps.filter((step) => step.completed).length;
  const completionPercentage = Math.round((completedSteps / steps.length) * 100);

  const handleStartStep = (stepKey: string) => {
    // Implement navigation to the corresponding feature or tutorial
    // This would depend on your application's routing/navigation structure
    console.log(`Starting step: ${stepKey}`);
    onOpenChange(false);

    // Example navigation logic:
    // if (stepKey === 'firstReply') navigate('/inbox?filter=needs-reply');
    // else if (stepKey === 'aiFilter') navigate('/settings/filters');
    // etc.
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent
          aria-description=""
          className="max-h-[90vh] overflow-y-auto dark:border sm:max-w-[600px]"
        >
          <DialogHeader>
            <DialogTitle className="font-medium">
              Kickstart your Mono journey & earn extra week of Plus
            </DialogTitle>
            <DialogDescription className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Complete these steps to get the most out of Mono
              </span>
            </DialogDescription>

            <div>
              <span className="text-sm text-muted-foreground">
                {completionPercentage}% completed
              </span>
              <Progress value={completionPercentage} className="mt-1 h-1" />
            </div>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-0">
            {steps.map((step, index) => (
              <div key={step.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-md font-medium ${
                      step.completed ? 'bg-green-500' : 'bg-muted-low'
                    }`}
                  >
                    {step.completed ? (
                      <MonoIcon type={'CheckCircle'} className="h-6 w-6" />
                    ) : (
                      step.id
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-10 w-0.5 ${step.completed ? 'bg-green-500' : 'bg-muted-low'}`}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3
                        className={`text-sm font-medium ${
                          step.completed ? 'text-muted-foreground line-through' : ''
                        }`}
                      >
                        {step.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                    {!step.completed && (
                      <Button
                        onClick={() => handleStartStep(step.key)}
                        className="flex items-center gap-2"
                      >
                        <MonoIcon type={'PlayCircle'} className="h-4 w-4" />
                        Start
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {completionPercentage === 100 && (
            <div className="mt-6 rounded-lg bg-gradient-to-r from-green-800 to-green-900 p-4">
              <h3 className="text-lg font-bold text-white">
                {`Congratulations! You've completed all onboarding steps`}
              </h3>
              <p className="text-green-100">
                An extra week of Mono Plus has been added to your account
              </p>
            </div>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default OnboardingChecklistDialog;
