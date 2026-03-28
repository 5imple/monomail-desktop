import { useAuth } from '@/renderer/app/context/AuthContext';
import { analytics } from '@/renderer/app/lib/firebase';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { logEvent } from 'firebase/analytics';
import mixpanel from 'mixpanel-browser';
import * as amplitude from '@amplitude/analytics-browser';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';

export const useUserTrackingData = () => {
  const { member } = useAuth();
  const { billingInfo } = useBillingAtom();

  // Function to track events
  const trackEvent = (eventName: string, eventData: Record<string, any> = {}): void => {
    if (!member) return;

    let userData: Record<string, any> = {
      user_id: member.uid ?? 'unknown',
      email: member.email ?? 'unknown',
      name: member.displayName ?? 'unknown',
      member_name: member?.memberName ?? 'unknown',
      subscription: billingInfo.subscription?.productName ?? '',
      subscriptionVariant: billingInfo.subscription?.variantName ?? ''
    };

    if (member.demographics) {
      userData = {
        ...userData,
        demographics_role: member.demographics.role ?? 'unknown',
        demographics_discovery_source: member.demographics.discoverySource ?? 'unknown',
        demographics_email_usage: member.demographics.emailUsage ?? 'unknown'
      };
    }

    const eventPayload = { ...userData, ...eventData };

    if (!isDevelopment()) {
      // Track in Mixpanel
      mixpanel.track(eventName, eventPayload);

      // Track in Firebase
      logEvent(analytics, eventName, eventPayload);

      // Track in Amplitude
      amplitude.track(eventName, eventPayload);
    }
  };

  return { trackEvent };
};
