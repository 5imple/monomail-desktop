import { getBillingCheckoutOrigin } from '@/renderer/app/lib/runtimeBranding';

// Order of plans from lowest to highest for comparison
export const planOrder = ['free', 'plus', 'plus_onetime', 'pro'];

/** Map payment-provider product/variant IDs to internal plan keys — configure for your billing integration. */
export const productIdToPlan: Record<string, string> = {};

// Determine if a plan is an upgrade, downgrade, or current
export const getPlanAction = (currentPlan: string | null, planId: string) => {
  // Default to free plan if no current plan
  const currentPlanKey = currentPlan || 'free';
  if (planId === currentPlanKey) return 'current';
  const currentIndex = planOrder.indexOf(currentPlanKey);
  const planIndex = planOrder.indexOf(planId);
  return planIndex > currentIndex ? 'upgrade' : 'downgrade';
};

// Gets button text key based on plan action (returns i18n key)
export const getButtonTextKey = (action: string) => {
  switch (action) {
    case 'current':
      return 'plan_selection.current_plan';
    case 'upgrade':
      return 'plan_selection.upgrade';
    case 'downgrade':
      return 'plan_selection.downgrade';
    default:
      return 'plan_selection.select_plan';
  }
};

// Find the next plan in the order (for upgrade)
export const getNextPlan = (currentPlan: string | null) => {
  // Default to free plan if no current plan
  const currentPlanKey = currentPlan || 'free';
  
  // Special handling for plus and plus_lifetime plans - they should upgrade to pro
  if (currentPlanKey === 'plus' || currentPlanKey === 'plus_lifetime') {
    return 'pro';
  }
  
  const currentIndex = planOrder.indexOf(currentPlanKey);
  if (currentIndex < planOrder.length - 1) {
    return planOrder[currentIndex + 1];
  }
  return null; // No next plan available (user is on highest plan)
};

// Check if current plan is higher than plus
export const isCurrentPlanHigherThanPlus = (currentPlan: string | null) => {
  const currentIndex = planOrder.indexOf(currentPlan ?? 'plus');
  const plusIndex = planOrder.indexOf('plus');
  return currentIndex > plusIndex;
};

// Generate Lemon Squeezy checkout URL with user info
export const generateCheckoutUrl = (
  planKey: string,
  planDetails: any,
  member: { primaryUid?: string; email?: string; displayName?: string } | null
) => {
  const variantId = planDetails[planKey].id; // Using the ID as the variant ID for the URL
  const userId = member?.primaryUid;
  const userEmail = member?.email;
  const displayName = member?.displayName;

  if (!userId || !userEmail) return;

  const origin = getBillingCheckoutOrigin();
  if (!origin) return;

  const baseUrl = `${origin}/buy/${variantId}`;
  const params = new URLSearchParams();

  // Add user ID as custom data
  params.append('checkout[custom][uid]', userId);
  if (userEmail) params.append('checkout[email]', userEmail);
  if (displayName) params.append('checkout[name]', displayName);

  return `${baseUrl}?${params.toString()}`;
};

// Generate customer portal URL
export const generatePortalUrl = (
  subscriptionId: string,
  userId: string,
  type: 'portal' | 'payment' = 'portal',
  requestedPlan?: string
) => {
  const baseUrl = `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/customer`;
  const params = new URLSearchParams();

  params.append('uid', userId);
  params.append('type', type);
  params.append('subscriptionId', subscriptionId);

  // Optionally add requested plan change info
  if (requestedPlan) {
    params.append('requestedPlan', requestedPlan);
  }

  return `${baseUrl}?${params.toString()}`;
};

// Handle plan selection/change
export const handlePlanChange = (
  planKey: string,
  currentPlan: string | null,
  subscription: any,
  member: { primaryUid?: string } | null,
  planDetails: any
) => {
  const currentPlanKey = currentPlan || 'free';
  if (planKey === currentPlanKey) return; // No change needed

  // Don't allow selecting free plan if already free (it's the default state)
  if (planKey === 'free') return;

  // If user already has a subscription, redirect to customer portal
  if (subscription) {
    const userId = member?.primaryUid;
    if (userId) {
      const portalUrl = generatePortalUrl(subscription.id, userId, 'portal', planKey);
      console.log(`Redirecting to portal: ${portalUrl}`);
      window.open(portalUrl, '_blank');
      return true; // Indicate redirect happened
    }
  } else {
    // Only use checkout URL for new subscriptions
    const checkoutUrl = generateCheckoutUrl(planKey, planDetails, member);
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank');
      return true; // Indicate redirect happened
    }
  }

  return false; // Indicate no redirect happened
};

// Format card information (returns i18n key or formatted string)
export const formatCardInfo = (subscription: any) => {
  if (subscription) {
    const { cardBrand, cardLastFour } = subscription;
    if (cardBrand && cardLastFour) {
      return `${cardBrand} •••• ${cardLastFour}`;
    }
  }
  return 'settings.billing.payment_details.no_payment_method';
};

// Get the appropriate renewal info with i18n keys
export const getRenewalInfo = (subscription: any) => {
  if (!subscription) return null;

  const { trialEndsAt, renewsAt, endsAt, cancelled } = subscription;
  const now = new Date();

  if (cancelled && endsAt) {
    const endDate = new Date(endsAt);
    if (endDate > now) {
      return {
        labelKey: 'settings.billing.renewal_info.ends',
        date: endDate.toLocaleDateString()
      };
    }
  }

  if (renewsAt) {
    const renewalDate = new Date(renewsAt);
    if (renewalDate > now) {
      return {
        labelKey: 'settings.billing.renewal_info.renews',
        date: renewalDate.toLocaleDateString()
      };
    }
  }

  if (trialEndsAt) {
    const trialEndDate = new Date(trialEndsAt);
    if (trialEndDate > now) {
      return {
        labelKey: 'settings.billing.renewal_info.trial_ends',
        date: trialEndDate.toLocaleDateString()
      };
    }
  }

  return null;
};

// Space limits by plan
export const getSpaceLimitForPlan = (plan: string | null): number => {
  switch (plan) {
    case 'plus':
    case 'plus_onetime':
    case 'pro':
      return -1; // -1 means unlimited
    case 'free':
    default:
      return 2; // Free tier gets 2 spaces
  }
};

// Check if user can create more spaces
export const canCreateMoreSpaces = (currentSpaceCount: number, plan: string | null): boolean => {
  const limit = getSpaceLimitForPlan(plan);
  if (limit === -1) return true; // Unlimited
  return currentSpaceCount < limit;
};

// Get space limit text for display
export const getSpaceLimitText = (plan: string | null, t: any): string => {
  const limit = getSpaceLimitForPlan(plan);
  if (limit === -1) {
    return t('plan_selection.plans.plus.features.spaces'); // "Unlimited Spaces"
  }
  return t('plan_selection.space_limit', { count: limit });
};

// Check if plan has unlimited spaces
export const hasUnlimitedSpaces = (plan: string | null): boolean => {
  return plan === 'plus' || plan === 'plus_onetime' || plan === 'pro';
};

// Check if user has plus-level access or higher (includes plus_onetime)
export const hasPlusLevelAccess = (plan: string | null): boolean => {
  return plan === 'plus' || plan === 'plus_onetime' || plan === 'pro';
};

// Check if user has premium access (non-free)
export const hasPremiumAccess = (plan: string | null): boolean => {
  return plan !== 'free' && plan !== null;
};

// Check if user is on a one-time payment plan
export const isOneTimePlan = (plan: string | null): boolean => {
  return plan === 'plus_onetime';
};
