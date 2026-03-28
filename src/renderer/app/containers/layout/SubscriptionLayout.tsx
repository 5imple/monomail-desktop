import { FC, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { animated, useTrail, useSpring } from '@react-spring/web';
import { Button } from '@/renderer/app/components/ui/button';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useAuth } from '@/renderer/app/context/AuthContext';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';
import MonoLogo from '@/renderer/app/components/common/MonoLogo';
import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/renderer/app/components/ui/card';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Switch } from '@/renderer/app/components/ui/switch';
import { usePlanDetails } from '@/renderer/app/lib/planDetails';
import { cn } from '@/renderer/app/lib/utils';
import {
  productIdToPlan,
  getPlanAction,
  getButtonTextKey,
  isCurrentPlanHigherThanPlus,
  handlePlanChange
} from '@/renderer/app/lib/billingUtils';
import { useSyncHistory } from '@/renderer/app/context/SyncHistoryContext';
import { useSyncThread } from '@/renderer/app/context/SyncThreadContext';
import { SupportedLanguage } from '@/main/api/auth/types';
import DeleteMemberDialog from '@/renderer/app/containers/dialog/DeleteMemberDialog';

// Language options for the selector
const languageOptions = [
  { key: 'en' as SupportedLanguage, label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  { key: 'ko' as SupportedLanguage, label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷' },
  { key: 'es' as SupportedLanguage, label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸' },
  { key: 'ja' as SupportedLanguage, label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵' }
];

interface SubscriptionLayoutProps {}

const SubscriptionLayout: FC<SubscriptionLayoutProps> = () => {
  const { t, i18n } = useTranslation();
  const { member, signOut, updatePreference, preference } = useAuth();
  const { hasActiveSubscription, loading, billingInfo } = useBillingAtom();
  const { exitWorker: exitHistoryWorker } = useSyncHistory();
  const { exitWorker: exitThreadWorker } = useSyncThread();
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState('annually');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  navigate('/', { replace: true });

  const handleLogout = async () => {
    await exitThreadWorker();
    await exitHistoryWorker();
    await signOut();
    return navigate('/', { replace: true });
  };

  // Handle language change
  const handleLanguageChange = async (newLanguage: SupportedLanguage) => {
    await i18n.changeLanguage(newLanguage);
    updatePreference({
      ...preference,
      language: newLanguage
    });
  };

  // Use the hook to get internationalized plan details
  const planDetails = usePlanDetails();

  // Determine current plan or default to free if subscription is missing
  const currentPlan = billingInfo.subscription?.productId
    ? productIdToPlan[billingInfo.subscription.productId] ?? 'free'
    : 'free';

  // Animation configurations
  const headerTrail = useTrail(3, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 200
  });

  const billingToggleSpring = useSpring({
    from: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
    to: { opacity: 1, transform: 'translateY(0px) scale(1)' },
    config: { tension: 280, friction: 20 },
    delay: 500
  });

  const plansGridTrail = useTrail(Object.keys(planDetails).length, {
    from: { opacity: 0, transform: 'translateY(30px) scale(0.95)' },
    to: { opacity: 1, transform: 'translateY(0px) scale(1)' },
    config: { tension: 300, friction: 25 },
    delay: 700
  });

  const footerSpring = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 300, friction: 25 },
    delay: 1000
  });

  // If user already has active subscription, redirect to main app
  if (!loading && hasActiveSubscription()) {
    return <Navigate to="/" replace />;
  }

  // Handle plan selection using the same logic as PlanSelectionDialog
  const handleSelectPlan = (planKey: string) => {
    if (planKey !== currentPlan) {
      const redirected = handlePlanChange(
        planKey,
        currentPlan,
        billingInfo.subscription,
        member,
        planDetails
      );
      // Dialog closing is not needed here since this is a full page layout
    }
  };

  const handleContactSupport = () => {
    const supportUrl = `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/contact`;
    window.open(supportUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="no-drag h-screen">
        <BaseHeader />
        <div className="fixed bottom-0 left-0 right-0 top-0 flex items-center justify-center overflow-hidden rounded-md border bg-background">
          <div className="flex h-screen flex-col items-center justify-center p-16">
            <MonoLogo className="h-24 opacity-50" />
            <p className="mt-4 text-muted-foreground">{t('subscription.checking_status')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="no-drag h-screen overflow-auto">
      <BaseHeader />
      <div className="flex h-screen flex-col items-center justify-center overflow-hidden bg-background">
        <div className="relative px-6 py-12">
          {/* Language Selector */}
          <div className="absolute left-0 top-0">
            <animated.div style={headerTrail[0]} className="will-change-transform">
              <Button variant={'ghost'} onClick={handleLogout}>
                <MonoIcon type="ArrowLeft" className="mr-2 h-4 w-4" />
                {t('subscription.log_out')}
              </Button>
            </animated.div>
          </div>

          {/* Header Section */}
          <div className="mb-8 text-center">
            {/* <MonoLogo className="mx-auto mb-6" /> */}
            <animated.h1
              style={headerTrail[1]}
              className="mb-4 text-2xl font-medium tracking-tight will-change-transform"
            >
              {t('subscription.choose_plan')}
            </animated.h1>
            <animated.div
              style={headerTrail[2]}
              className="mx-auto max-w-2xl text-xl leading-relaxed text-muted-foreground will-change-transform"
            >
              <p className="mb-2">{t('subscription.description')}</p>
              {/* <p className="mb-4">{t('subscription.description_additional')}</p> */}
            </animated.div>
          </div>

          {/* Billing Cycle Toggle */}
          <animated.div
            style={billingToggleSpring}
            className="mx-auto mb-8 flex max-w-md items-center justify-center gap-2 will-change-transform"
          >
            <span
              className={cn(
                'text-sm',
                billingCycle === 'monthly' ? 'font-medium' : 'text-muted-foreground'
              )}
            >
              {t('plan_selection.billing_cycle.monthly')}
            </span>
            <Switch
              checked={billingCycle === 'annually'}
              onCheckedChange={(checked) => setBillingCycle(checked ? 'annually' : 'monthly')}
              size="sm"
            />
            <div className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  billingCycle === 'annually' ? 'font-medium' : 'text-muted-foreground'
                )}
              >
                {t('plan_selection.billing_cycle.annually')}
              </span>
              <div className="rounded-md bg-green-100 p-0.5 px-1 text-xs text-green-800">
                <span className="font-medium">
                  {t('plan_selection.billing_cycle.save_percent', { percent: 20 })}
                </span>
              </div>
            </div>
          </animated.div>

          {/* Plans Grid */}
          <div className="mx-auto mb-12 grid grid-cols-3 gap-8 md:grid-cols-3">
            {Object.entries(planDetails).map(([planId, plan], index) => {
              const action = getPlanAction(currentPlan, planId);
              const isPlanHighlighted = planId === 'pro'; // Highlight Plus plan
              const shouldShowPopularBadge =
                isPlanHighlighted && !isCurrentPlanHigherThanPlus(currentPlan);

              return (
                <animated.div
                  key={planId}
                  style={plansGridTrail[index]}
                  className="relative will-change-transform"
                >
                  {planId === 'pro' && (
                    <div className="absolute inset-0 animate-gradient-flow rounded-lg bg-gradient-to-r from-pink-500 via-violet-500 to-cyan-500 to-pink-500 blur-xl transition-all duration-6000 ease-bouncy-in-out"></div>
                  )}
                  <Card
                    className={cn(
                      'relative flex h-full flex-col p-4 transition-all duration-200 hover:shadow-lg',
                      planId === currentPlan && 'shadow-lg',
                      isPlanHighlighted &&
                        !isCurrentPlanHigherThanPlus(currentPlan) &&
                        currentPlan !== planId &&
                        action === 'current' &&
                        'bg-muted'
                    )}
                  >
                    <CardHeader className="pb-2 text-start">
                      <CardTitle className="text-2xl font-medium">{plan.name}</CardTitle>
                      <div className="flex items-end justify-start gap-1">
                        <span className="w-20 text-4xl font-medium">
                          {billingCycle === 'monthly' ? (plan as any).monthly?.price : (plan as any).annually?.price}
                        </span>
                        <div className="">
                          <div className="text-sm text-muted-foreground">
                            / {t('plan_selection.per_month')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {t('plan_selection.billed')} {t(`plan_selection.${billingCycle}`)}
                          </div>
                        </div>
                      </div>
                      <CardDescription className="mt-4">{plan.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="pt-4">
                      <ul className="space-y-3">
                        {planId === 'pro' && (
                          <li className="flex items-center gap-3 font-medium">
                            <MonoIcon type="CheckCircle" className="h-4 w-4 text-green-500" />
                            <span>{t('plan_selection.everything_in_plus')}</span>
                          </li>
                        )}
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-center gap-3">
                            <MonoIcon type="CheckCircle" className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>

                    <CardFooter className="mt-auto">
                      <Button
                        className="w-full"
                        variant={
                          action === 'current'
                            ? 'secondary'
                            : shouldShowPopularBadge
                              ? 'default'
                              : 'secondary'
                        }
                        sizeVariant="lg"
                        // disabled={action === 'current'}
                        onClick={() => handleSelectPlan(planId)}
                      >
                        {t(getButtonTextKey(action))}
                      </Button>
                    </CardFooter>
                  </Card>
                </animated.div>
              );
            })}
          </div>

          <animated.div
            style={footerSpring}
            className="space-y-2 text-center text-sm will-change-transform"
          >
            <p>
              {t('subscription.existing_subscriber')}{' '}
              <Button typeVariant={'inline'} variant={'link'} onClick={handleContactSupport}>
                {t('subscription.contact_support')}
              </Button>
            </p>
            <p>
              <Button
                className="text-foreground"
                typeVariant={'inline'}
                variant={'link'}
                onClick={handleContactSupport}
              >
                {t('subscription.student_discount')}
              </Button>{' '}
              {/* <Button
                className="text-destructive hover:text-destructive"
                typeVariant={'inline'}
                variant={'link'}
                onClick={() => setIsDialogOpen(true)}
              >
                {t('settings.profile.delete_account.button')}
              </Button> */}
            </p>
          </animated.div>
        </div>
      </div>

      <DeleteMemberDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) setIsDialogOpen(false);
        }}
      />
    </div>
  );
};

export default SubscriptionLayout;
