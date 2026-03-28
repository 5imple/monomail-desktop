import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback } from 'react';

interface OnboardingState {
  firstReply: boolean;
  aiFilter: boolean;
  extensionInstalled: boolean;
  askedQuestions: boolean;
  calendarEvent: boolean;
  styleTuned: boolean;
  inboxRule: boolean;
  completedAt?: string;
}

const defaultOnboardingState: OnboardingState = {
  firstReply: false,
  aiFilter: false,
  extensionInstalled: false,
  askedQuestions: false,
  calendarEvent: false,
  styleTuned: false,
  inboxRule: false
};

// Persist onboarding state in localStorage
const onboardingAtom = atomWithStorage<OnboardingState>('onboarding:state', defaultOnboardingState);

export const useOnboardingAtom = () => {
  const [onboardingState, setOnboardingState] = useAtom(onboardingAtom);

  const updateOnboardingStep = useCallback(
    (step: keyof OnboardingState, completed: boolean) => {
      setOnboardingState((prev) => {
        const newState = { ...prev, [step]: completed };

        // Check if all steps are completed
        const allStepsCompleted = [
          'firstReply',
          'aiFilter',
          'extensionInstalled',
          'askedQuestions',
          'calendarEvent',
          'styleTuned',
          'inboxRule'
        ].every((key) => newState[key as keyof OnboardingState]);

        // If all steps are completed, record completion time
        if (allStepsCompleted && !prev.completedAt) {
          return {
            ...newState,
            completedAt: new Date().toISOString()
          };
        }

        return newState;
      });
    },
    [setOnboardingState]
  );

  const resetOnboarding = useCallback(() => {
    setOnboardingState(defaultOnboardingState);
  }, [setOnboardingState]);

  const getCompletionPercentage = useCallback(() => {
    const totalSteps = 7; // Number of steps excluding completedAt
    const completedSteps = Object.entries(onboardingState).filter(
      ([key, value]) => key !== 'completedAt' && value === true
    ).length;

    return Math.round((completedSteps / totalSteps) * 100);
  }, [onboardingState]);

  return {
    onboardingState,
    updateOnboardingStep,
    resetOnboarding,
    getCompletionPercentage,
    isCompleted: !!onboardingState.completedAt
  };
};
