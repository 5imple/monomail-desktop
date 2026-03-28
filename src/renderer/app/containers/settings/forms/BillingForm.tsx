import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { Switch } from '@/renderer/app/components/ui/switch';
import PlanSelectionDialog from '@/renderer/app/containers/dialog/PlanSelectionDialog';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { usePlanDetails } from '@/renderer/app/lib/planDetails'; // Updated import
import { cn } from '@/renderer/app/lib/utils';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useCommands } from '@/renderer/app/lib/commands/useCommands';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getPlanAction,
  getButtonTextKey,
  getNextPlan,
  isCurrentPlanHigherThanPlus,
  generatePortalUrl,
  handlePlanChange,
  formatCardInfo,
  getRenewalInfo
} from '@/renderer/app/lib/billingUtils';
import { getDiscordInviteUrl, getSupportEmail } from '@/renderer/app/lib/runtimeBranding';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';

// Define types for subscription and plan details
interface Subscription {
  id: string;
  productId: string;
  status: string;
  cardBrand?: string;
  cardLastFour?: string;
  trialEndsAt?: string;
  renewsAt?: string;
  endsAt?: string;
  cancelled?: boolean;
}

export function BillingForm() {
  const { t } = useTranslation();
  const { member, accounts } = useAuth(); // Get user from auth context
  const { billingInfo, getUserPlan } = useBillingAtom();
  const { closeDialog } = useDialogs();
  const executeCommand = useExecuteCommand();
  const [billingCycle, setBillingCycle] = useState('annually');

  // Use the hook to get internationalized plan details
  const planDetails = usePlanDetails();

  // Determine current plan or default to free if subscription is missing
  const currentPlan = getUserPlan();
  // Handle updating payment method
  const handleUpdatePaymentMethod = () => {
    if (billingInfo.subscription && member?.primaryUid) {
      const portalUrl = generatePortalUrl(
        billingInfo.subscription.id,
        member.primaryUid,
        'payment'
      );
      window.open(portalUrl, '_blank');
    }
  };

  // Handle opening customer portal
  const handleOpenCustomerPortal = () => {
    if (billingInfo.subscription && member?.primaryUid) {
      const portalUrl = generatePortalUrl(billingInfo.subscription.id, member.primaryUid);
      window.open(portalUrl, '_blank');
    }
  };

  // Handle resuming a cancelled subscription
  const handleResumeSubscription = () => {
    if (billingInfo.subscription && member?.primaryUid) {
      const portalUrl = generatePortalUrl(billingInfo.subscription.id, member.primaryUid);
      window.open(portalUrl, '_blank');
    }
  };

  const nextPlan = getNextPlan(currentPlan);
  const renewalInfo = getRenewalInfo(billingInfo.subscription);

  // Handle plan selection for all plans view
  const handleSelectPlan = (planKey: string) => {
    handlePlanChange(planKey, currentPlan, billingInfo.subscription, member, planDetails);
  };

  // Handle student discount contact
  const handleStudentDiscountContact = () => {
    // Close the preference dialog
    closeDialog('preference');

    // Get the primary account email for the compose action
    const primaryAccount = accounts?.find((acc) => acc.uid === member?.primaryUid) || accounts?.[0];
    if (!primaryAccount) return;

    // Create a draft with the student discount subject
    const draft = new MonoDraft({
      from: primaryAccount.email,
      to: [getSupportEmail()],
      subject: 'Student Discount Request'
    });

    // Execute the compose command
    executeCommand('COMPOSE_NEW_MESSAGE', { draft });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <div>
          <h3 className="text-lg font-medium">{t('settings.billing.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('settings.billing.description')}</p>
        </div>
        {/* {currentPlan && ( */}
        <div className="ml-auto flex items-center gap-2">
          <PlanSelectionDialog>
            <Button variant={'secondary'}>
              {t('plan_selection.all_plans')} <MonoIcon type={'ChevronRight'} />
            </Button>
          </PlanSelectionDialog>
        </div>
        {/* )} */}
      </div>

      <div className="flex flex-col space-y-2">
        {/* Render different content based on whether there's an active subscription or one-time purchase */}
        <h3 className="text-md font-medium">{t('settings.billing.plan.current_plan')}</h3>
        {billingInfo.subscription || billingInfo.hasOneTimePurchase ? (
          <>
            <div
              className={cn(
                'relative flex items-center justify-center rounded-lg bg-transparent transition-all duration-300'
              )}
            >
              {/* Current Plan Card */}
              {currentPlan === 'pro' && (
                <div
                  className={cn(
                    'absolute inset-0 animate-gradient-flow rounded-lg bg-gradient-to-r from-pink-500 via-violet-500 to-cyan-500 to-pink-500 blur-xl transition-all duration-6000 ease-bouncy-in-out',
                    'blur-lg',
                    '-z-10'
                  )}
                ></div>
              )}
              <div className="flex-1 rounded-md border bg-card p-4 shadow-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center">
                      <h3 className="text-md font-medium">
                        {t(`plan_selection.plans.${currentPlan}.name`)}
                      </h3>
                      <Badge sizeVariant={'xs'} className="ml-2 rounded-sm" variant="outline">
                        {t('plan_selection.current_plan')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t(`plan_selection.plans.${currentPlan}.description`)}
                    </p>

                    {/* Display canceled subscription message if applicable */}
                    {billingInfo.subscription?.cancelled && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {t('plan_selection.canceled_subscription')}{' '}
                        {billingInfo.subscription.endsAt
                          ? new Date(billingInfo.subscription.endsAt).toLocaleDateString()
                          : t('plan_selection.end_of_billing_period')}
                        .
                      </div>
                    )}
                  </div>
                  {billingInfo.subscription && (
                    <div className="flex flex-col items-end">
                      {renewalInfo && (
                        <div className="text-sm text-muted-foreground">
                          {t(renewalInfo.labelKey, { date: renewalInfo.date })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Resume subscription button for canceled subscriptions */}
                {billingInfo.subscription?.cancelled && (
                  <div className="mt-4">
                    <Button onClick={handleResumeSubscription}>
                      {t('plan_selection.reactivate')}{' '}
                      {t(`plan_selection.plans.${currentPlan}.name`)}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Next Plan Card (for upgrade path) - only show if subscription is not canceled and not already on highest plan */}
            {nextPlan && !billingInfo.subscription?.cancelled && currentPlan !== 'pro' && (
              <div className="relative">
                {nextPlan === 'pro' && (
                  <div className="absolute inset-0 animate-gradient-flow rounded-lg bg-gradient-to-r from-pink-500 via-violet-500 to-cyan-500 to-pink-500 blur-xl transition-all duration-6000 ease-bouncy-in-out"></div>
                )}
                <div
                  className={cn(
                    'relative flex flex-col rounded-md border bg-card p-4 shadow-md transition-all duration-300 hover:shadow-xl',
                    (nextPlan === 'plus' || nextPlan === 'plus_onetime') &&
                      'border bg-primary text-primary-foreground shadow-sm',
                    nextPlan === 'pro' &&
                      'border border-primary bg-primary text-primary-foreground shadow-sm'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center">
                        <h3 className="text-md font-medium">
                          {t(`plan_selection.plans.${nextPlan}.name`)}
                        </h3>
                        {nextPlan === 'pro' && (
                          <Badge
                            sizeVariant={'xs'}
                            variant={'secondary'}
                            className="ml-2 rounded-sm"
                          >
                            {t('plan_selection.popular')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t(`plan_selection.plans.${nextPlan}.description`)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end">
                      <div className="text-xl font-medium">
                        {billingCycle === 'monthly'
                          ? planDetails[nextPlan].monthly.price
                          : planDetails[nextPlan].annually.price}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t('plan_selection.per_month')}, {t('plan_selection.billed')}{' '}
                        {t(`plan_selection.${billingCycle}`)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                    {nextPlan === 'pro' && (
                      <div className="col-span-2 flex items-center text-sm font-medium">
                        {t('plan_selection.everything_in_plus')}
                      </div>
                    )}
                    {Object.entries(
                      t(`plan_selection.plans.${nextPlan}.features`, { returnObjects: true })
                    ).map(([key, feature]) => (
                      <div key={key} className="flex items-center text-sm text-muted-foreground">
                        <MonoIcon type="Check" className="mr-2 h-4 w-4 text-muted-foreground" />
                        {feature}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={billingCycle === 'annually'}
                        onCheckedChange={(e) => setBillingCycle(e ? 'annually' : 'monthly')}
                        size="sm"
                      />
                      <div className="flex items-center gap-2 text-sm">
                        {t('plan_selection.billing_cycle.annually')}
                        <div className="rounded-sm bg-green-100 p-0.5 px-1 text-xs text-green-800">
                          <span className="font-medium">
                            {t('plan_selection.billing_cycle.save_percent', { percent: 20 })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      className="w-32"
                      variant={'secondary'}
                      onClick={() => handleSelectPlan(nextPlan)}
                    >
                      {t('plan_selection.upgrade')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Show free plan as current when no subscription */}
            <div className="flex-1 rounded-md border bg-card p-4 shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center">
                    <h3 className="text-md font-medium">{t(`plan_selection.plans.free.name`)}</h3>
                    <Badge sizeVariant={'xs'} className="ml-2 rounded-sm" variant="outline">
                      {t('plan_selection.current_plan')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(`plan_selection.plans.free.description`)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {billingInfo.subscription || billingInfo.hasOneTimePurchase ? null : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{t('plan_selection.all_plans')}</h4>
            <div className="flex items-center gap-2">
              <Switch
                checked={billingCycle === 'annually'}
                onCheckedChange={(e) => setBillingCycle(e ? 'annually' : 'monthly')}
                size="sm"
              />
              <div className="flex items-center gap-2 text-sm">
                {t('plan_selection.billing_cycle.annually')}
                <div className="rounded-md bg-green-100 p-0.5 px-1 text-sm text-green-800">
                  <span className="font-medium">
                    {t('plan_selection.billing_cycle.save_percent', { percent: 20 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Regular plans in 1-1-1 grid */}
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
                            'border border-primary bg-primary text-primary-foreground shadow-sm',
                          planId === 'plus_onetime' &&
                            'border-primary bg-primary text-primary-foreground shadow-sm'
                          // action === 'current' && 'bg-muted'
                        )}
                      >
                        <h3 className="text-md font-medium">
                          {plan.name}{' '}
                          {action === 'current' ? (
                            <Badge
                              sizeVariant={'xs'}
                              className="ml-2 rounded-sm"
                              variant="secondary"
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
                            {}
                            {planId === 'plus_onetime'
                              ? (plan as any).onetime?.price
                              : billingCycle === 'monthly'
                                ? (plan as any).monthly?.price
                                : (plan as any).annually?.price}
                          </div>
                          {planId !== 'free' && (
                            <div className="text-sm text-muted-foreground">
                              {planId === 'plus_onetime' ? (
                                <>
                                  {t('plan_selection.one_time')} <br />
                                  {t('plan_selection.lifetime_access')}
                                </>
                              ) : (
                                <>
                                  {t('plan_selection.per_month')} <br />{' '}
                                  {t('plan_selection.billed')} {t(`plan_selection.${billingCycle}`)}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="mt-4">
                          <Button
                            className="w-full"
                            variant={'secondary'}
                            disabled={action === 'current'}
                            onClick={() => handleSelectPlan(planId)}
                          >
                            {planId === 'plus_onetime' ? 'Buy' : t(getButtonTextKey(action))}
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
        </div>
      )}

      {/* Payment Details Section (only if a subscription exists) */}
      {billingInfo.subscription && (
        <div>
          <h4 className="mb-4 font-medium">{t('settings.billing.payment_details.title')}</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">
                  {t('settings.billing.payment_details.payment_method')}
                </div>
                <div className="mt-1 flex items-center">
                  <MonoIcon type="CreditCard" className="mr-2 h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const cardInfo = formatCardInfo(billingInfo.subscription);
                      return cardInfo.includes('settings.billing') ? t(cardInfo) : cardInfo;
                    })()}
                  </p>
                </div>
              </div>
              <Button
                variant={'secondary'}
                onClick={handleUpdatePaymentMethod}
                className="whitespace-nowrap"
              >
                {t('settings.billing.payment_details.change_payment_method')}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">
                  {t('settings.billing.payment_details.manage_subscription')}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('settings.billing.payment_details.manage_subscription_description')}
                </p>
              </div>
              <Button
                variant={'secondary'}
                onClick={handleOpenCustomerPortal}
                className="whitespace-nowrap"
              >
                {t('settings.billing.payment_details.customer_portal')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <MonoIcon type={'AlertCircle'} className="h-4 w-4" />
          <span className="text-sm font-normal">{t('settings.billing.trial_notice.message')}</span>
        </div>

        {getDiscordInviteUrl() ? (
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1 text-sm shadow-sm">
            <MonoIcon type={'AlertCircle'} className="" />
            <div>
              {t('settings.billing.beta_notice.message')}
              {t('settings.billing.beta_notice.discount_suffix')}
              <Button variant={'link'} sizeVariant={'sm'} asChild>
                <a href={getDiscordInviteUrl()} target="_blank" rel="noreferrer">
                  {t('sidebar.join_discord')}
                </a>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1 text-sm shadow-sm">
          <MonoIcon type={'AcademicCap'} className="" />
          <div>
            {t('settings.billing.student_discount.message')}
            <Button variant={'link'} sizeVariant={'sm'} onClick={handleStudentDiscountContact}>
              {t('settings.billing.student_discount.contact_link')}
            </Button>
            {t('settings.billing.student_discount.suffix')}
          </div>
        </div>
      </div>
    </div>
  );
}
