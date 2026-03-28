import { apiClient } from '@/main/api/apiClient';

export type SubscriptionStatus =
  | 'on_trial'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'unpaid'
  | 'cancelled'
  | 'expired';
interface LemonSqueezySubscription {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  productName?: string;
  variantName?: string;
  status: SubscriptionStatus;
  statusFormatted?: string;
  cardBrand?: string;
  cardLastFour?: string;
  pause?: {
    mode: 'void' | 'free';
    resumesAt: string;
  } | null;
  cancelled?: boolean;
  trialEndsAt?: string | null;
  updatePaymentMethodUrl?: string;
  customerPortalUrl?: string;
  updateCustomerPortalUrl?: string;
  renewsAt: string | null;
  endsAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Fetches user subscriptions
 *
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<LemonSqueezySubscription[]>} The response from the API.
 */
const getSubscriptions = (signal?: AbortSignal): Promise<LemonSqueezySubscription[]> => {
  return apiClient.get(`/mono/subscriptions`, { signal });
};

export default {
  getSubscriptions
};
