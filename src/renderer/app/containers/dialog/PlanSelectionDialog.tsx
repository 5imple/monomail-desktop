import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
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
import { Switch } from '@/renderer/app/components/ui/switch';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { usePlanDetails } from '@/renderer/app/lib/planDetails'; // Updated import
import { cn } from '@/renderer/app/lib/utils';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getPlanAction,
  getButtonTextKey, // Updated import
  isCurrentPlanHigherThanPlus,
  handlePlanChange
} from '@/renderer/app/lib/billingUtils';

// Define types for better type safety
interface PlanSelectionDialogProps {
  children: React.ReactNode;
}

const PlanSelectionDialog = ({ children }: PlanSelectionDialogProps) => {
  const { t } = useTranslation();
  const { member } = useAuth(); // Get user from auth context
  const { billingInfo, getUserPlan } = useBillingAtom(); // Get billing info and getUserPlan from atom
  const [open, setOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState('annually');

  // Use the hook to get internationalized plan details
  const planDetails = usePlanDetails();

  // Determine current plan using the proper function that handles both subscriptions and one-time purchases
  const currentPlan = getUserPlan();

  // Handle plan selection
  const handleSelectPlan = (planKey: string) => {
    if (planKey !== currentPlan) {
      const redirected = handlePlanChange(
        planKey,
        currentPlan,
        billingInfo.subscription,
        member,
        planDetails
      );

      if (redirected) {
        setOpen(false); // Close the dialog after opening checkout/portal
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogPortal>
          <DialogOverlay className="bg-black/50" />
          <DialogContent closeButton={false} className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-md font-medium">{t('plan_selection.title')}</DialogTitle>
              <DialogDescription className="text-md text-muted-foreground">
                {t('plan_selection.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Switch
                checked={billingCycle === 'annually'}
                onCheckedChange={(e) => setBillingCycle(e ? 'annually' : 'monthly')}
                size="sm"
              />
              <div className="flex items-center gap-2 text-sm">
                {t('plan_selection.billing_cycle.annually')}
                <div className="rounded-md bg-green-100 p-0.5 px-1 text-xs text-green-800">
                  <span className="font-medium">
                    {t('plan_selection.billing_cycle.save_percent', { percent: 20 })}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {/* All plans in 1-1-1 grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {Object.entries(planDetails)
                  .filter(([planId]) => planId !== 'free')
                  .map(([planId, plan]) => {
                    const action = getPlanAction(currentPlan, planId);
                    const isPlanHighlighted = planId === 'pro'; // Highlight Pro plan
                    const shouldShowPopularBadge =
                      isPlanHighlighted && !isCurrentPlanHigherThanPlus(currentPlan);

                    return (
                      <div className="relative" key={planId}>
                        {planId === 'pro' && (
                          <div className="absolute inset-0 animate-gradient-flow rounded-lg bg-gradient-to-r from-pink-500 via-violet-500 to-cyan-500 to-pink-500 blur-xl transition-all duration-6000 ease-bouncy-in-out"></div>
                        )}
                        <div
                          className={cn(
                            'relative flex flex-col rounded-md border bg-card p-4 shadow-md transition-all duration-300 hover:shadow-xl',
                            planId === currentPlan && 'shadow-lg',
                            isPlanHighlighted &&
                              !isCurrentPlanHigherThanPlus(currentPlan) &&
                              currentPlan !== planId &&
                              'border border-primary bg-primary text-primary-foreground shadow-sm'
                          )}
                        >
                          <h3 className="text-md font-medium">
                            {plan.name}{' '}
                            {action === 'current' ? (
                              <Badge
                                sizeVariant={'xs'}
                                className="ml-2 rounded-sm"
                                variant="outline"
                              >
                                {t('plan_selection.current_plan')}
                              </Badge>
                            ) : (
                              shouldShowPopularBadge && (
                                <Badge
                                  sizeVariant={'xs'}
                                  variant={'secondary'}
                                  className="ml-2 rounded-sm"
                                >
                                  {t('plan_selection.popular')}
                                </Badge>
                              )
                            )}
                          </h3>
                          <h4 className="text-sm text-muted-foreground">{plan.description}</h4>
                          <div className="mt-2 flex gap-4">
                            <div
                              className={cn(
                                'w-12 text-3xl font-medium',
                                planId === 'free' && 'text-2xl'
                              )}
                            >
                              {planId === 'plus_onetime'
                                ? (plan as any).onetime?.price
                                : billingCycle === 'monthly'
                                  ? (plan as any).monthly?.price
                                  : (plan as any).annually?.price}
                            </div>
                            {planId !== 'free' && (
                              <div className="text-xs text-muted-foreground">
                                {planId === 'plus_onetime' ? (
                                  <>
                                    {t('plan_selection.one_time')} <br />
                                    {t('plan_selection.lifetime_access')}
                                  </>
                                ) : (
                                  <>
                                    {t('plan_selection.per_month')} <br />{' '}
                                    {t('plan_selection.billed')}{' '}
                                    {t(`plan_selection.${billingCycle}`)}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="mt-4">
                            <Button
                              className="w-full"
                              variant={
                                action === 'current'
                                  ? 'secondary'
                                  : shouldShowPopularBadge
                                    ? 'secondary'
                                    : 'default'
                              }
                              disabled={action === 'current'}
                              onClick={() => handleSelectPlan(planId)}
                            >
                              {t(getButtonTextKey(action))}
                            </Button>
                          </div>

                          <ul className="mt-6 space-y-2">
                            {planId === 'pro' && (
                              <li className="flex items-center text-sm font-medium">
                                {t('plan_selection.everything_in_plus')}
                              </li>
                            )}
                            {plan.features.map((feature, index) => (
                              <li
                                key={index}
                                className="flex items-center text-sm text-muted-foreground"
                              >
                                <MonoIcon type={'Check'} className="mr-2 text-muted-foreground" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  );
};

export default PlanSelectionDialog;
