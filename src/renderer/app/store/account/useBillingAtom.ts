import {
  CACHE_KEYS,
  CACHE_TTL,
  networkFirstCache
} from '@/renderer/app/lib/cache/networkFirstCache';
import { atom, useAtom } from 'jotai';
import { useState } from 'react';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';

export type SubscriptionStatus =
  | 'on_trial'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'unpaid'
  | 'cancelled'
  | 'expired';

export type UserPlan = 'free' | 'plus' | 'plus_onetime' | 'pro';

export interface LemonSqueezySubscription {
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

export interface LemonSqueezyOrder {
  id: string;
  status: string;
  productId: string;
  productName: string;
  total: number;
  currency: string;
  createdAt: string;
}

export interface IMonoBillingInfo {
  subscription: LemonSqueezySubscription | null;
  order?: LemonSqueezyOrder | null;
  hasOneTimePurchase?: boolean;
}

export const billingInfoAtom = atom<IMonoBillingInfo>({
  subscription: null,
  order: null,
  hasOneTimePurchase: false
});

// Plan product IDs for different environments
const PLAN_PRODUCT_IDS = {
  sandbox: {
    plus: '467649',
    plus_onetime: '467650',
    pro: '467672'
  },
  production: {
    plus: '500803',
    plus_onetime: '500805',
    pro: '500804'
  }
};

// Utility function to get cached billing info from the same cache used by networkFirstCache
export const getCachedBillingInfo = async (): Promise<IMonoBillingInfo | null> => {
  try {
    const cachedData = await monoLocalStorageDb.getItem<{
      data: IMonoBillingInfo;
      hash?: string;
      timestamp: number;
    }>(CACHE_KEYS.BILLING_INFO);

    if (!cachedData) return null;

    // Check if cache is still valid based on TTL
    if (Date.now() - cachedData.timestamp > CACHE_TTL.BILLING_INFO) {
      return null;
    }

    // If hash is enabled, verify the data integrity
    if (cachedData.hash) {
      const msgBuffer = new TextEncoder().encode(JSON.stringify(cachedData.data));
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const currentHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      if (currentHash !== cachedData.hash) {
        console.warn('Cache hash mismatch for billing info, cache invalidated');
        await monoLocalStorageDb.removeItem(CACHE_KEYS.BILLING_INFO);
        return null;
      }
    }

    return cachedData.data;
  } catch (error) {
    console.warn('Failed to get cached billing info:', error);
    return null;
  }
};

export function useBillingAtom() {
  const [billingInfo, setBillingInfo] = useAtom(billingInfoAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has an active subscription
  const hasActiveSubscription = (): boolean => {
    if (billingInfo.hasOneTimePurchase) {
      return true;
    }

    if (!billingInfo.subscription) {
      return false;
    }

    const { status, endsAt } = billingInfo.subscription;

    // Active statuses that are immediately valid
    const activeStatuses: SubscriptionStatus[] = ['on_trial', 'active'];
    if (activeStatuses.includes(status)) {
      return true;
    }

    // For canceled subscriptions, check if we're still within the access period
    if (status === 'cancelled' && endsAt) {
      const currentDate = new Date();
      const endDate = new Date(endsAt);
      return currentDate < endDate;
    }

    return false;
  };

  // Determine user's current plan
  const getUserPlan = (): UserPlan => {
    // Check for active subscription first
    if (billingInfo.subscription && hasActiveSubscription()) {
      const { productId } = billingInfo.subscription;
      const isDevEnvironment = import.meta.env.MONO_ENV_APP_VERSION.includes('dev');
      const productIds = isDevEnvironment ? PLAN_PRODUCT_IDS.sandbox : PLAN_PRODUCT_IDS.production;

      switch (productId) {
        case productIds.plus:
          return 'plus';
        case productIds.pro:
          return 'pro';
        default:
          return 'free';
      }
    }

    // Check for one-time purchase
    if (billingInfo.hasOneTimePurchase && billingInfo.order) {
      const { productId } = billingInfo.order;
      const isDevEnvironment = import.meta.env.MONO_ENV_APP_VERSION.includes('dev');
      const productIds = isDevEnvironment ? PLAN_PRODUCT_IDS.sandbox : PLAN_PRODUCT_IDS.production;

      // Check if the order's productId matches the one-time purchase plan
      if (productId === productIds.plus_onetime) {
        return 'plus_onetime';
      }

      // For other one-time purchase products, determine the appropriate plan
      switch (productId) {
        case productIds.plus:
          return 'plus_onetime'; // One-time purchase of plus plan
        case productIds.pro:
          return 'pro'; // One-time purchase of pro plan (if supported)
        default:
          return 'plus_onetime'; // Default fallback for one-time purchases
      }
    }

    return 'free';
  };

  const hasProAccess = getUserPlan() === 'pro';

  const fetchSubscription = async (idToken: string): Promise<LemonSqueezySubscription | null> => {
    setLoading(true);
    setError(null);

    try {
      if (!idToken) {
        throw new Error('Authentication token not available');
      }

      const billingInfo = await networkFirstCache<IMonoBillingInfo>(
        {
          key: CACHE_KEYS.BILLING_INFO,
          ttl: CACHE_TTL.BILLING_INFO,
          useHash: true // Enable hashing for billing data
        },
        async () => {
          // Use the payment-info API endpoint
          const response = await fetch(
            `https://us-central1-${import.meta.env.MONO_ENV_FIREBASE_PROJECT_ID}.cloudfunctions.net/payment/payment-info`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          // Handle HTTP errors
          if (!response.ok) {
            // Handle 404 as a valid case (no subscription found)
            if (response.status === 404) {
              return {
                subscription: null,
                order: null,
                hasOneTimePurchase: false
              };
            }

            // For other errors, try to get error details and throw
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP Error: ${response.status}`);
          }

          // Parse response data
          const data = await response.json();

          // Handle different response types from payment-info API
          // The API might return subscription data, order data, or both
          let subscription: LemonSqueezySubscription | null = null;
          let order = null;
          let hasOneTimePurchase = false;

          // Check if response has subscription data
          if (data.subscription) {
            subscription = transformSubscription(data.subscription);
          }

          // Check if response has order/one-time purchase data
          if (data.order) {
            order = data.order;
            hasOneTimePurchase = true;
          }

          // Handle legacy response format where subscription might be at root level
          if (!subscription && !order && data.id) {
            // This looks like a subscription object at root level
            subscription = transformSubscription(data);
          }

          return {
            subscription,
            order,
            hasOneTimePurchase
          };
        }
      );

      // Update billing atom
      setBillingInfo(billingInfo);

      return billingInfo.subscription;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch subscription data';
      setError(errorMessage);
      console.error('Error fetching subscription data:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const resetBillingInfo = async () => {
    setBillingInfo({
      subscription: null,
      order: null,
      hasOneTimePurchase: false
    });
    await monoLocalStorageDb.removeItem(CACHE_KEYS.BILLING_INFO);
  };

  // Transform the subscription data to match the expected format
  const transformSubscription = (subscription: any): LemonSqueezySubscription => {
    return {
      id: subscription.id,
      orderId: subscription.orderId || '',
      productId: subscription.productId || '',
      variantId: subscription.variantId || '',
      productName: subscription.productName,
      variantName: subscription.variantName,
      status: subscription.status as SubscriptionStatus,
      statusFormatted: subscription.statusFormatted,
      cardBrand: subscription.cardBrand,
      cardLastFour: subscription.cardLastFour,
      pause: subscription.pause,
      cancelled: subscription.cancelled,
      trialEndsAt: subscription.trialEndsAt,
      updatePaymentMethodUrl: subscription.urls?.updatePaymentMethod || undefined,
      customerPortalUrl: subscription.urls?.customerPortal || undefined,
      updateCustomerPortalUrl: subscription.urls?.updateCustomerPortal || undefined,
      renewsAt: subscription.renewsAt,
      endsAt: subscription.endsAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt
    };
  };

  return {
    billingInfo,
    setBillingInfo,
    resetBillingInfo,
    loading,
    error,
    fetchSubscription,
    getUserPlan,
    hasProAccess,
    hasActiveSubscription
  };
}
