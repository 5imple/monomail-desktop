import { useAuth } from '@/renderer/app/context/AuthContext';
// Payment-free build — billingInfo no longer carried.
import mixpanel from 'mixpanel-browser';
import * as amplitude from '@amplitude/analytics-browser';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';

export const useUserTrackingData = () => {
  const { member } = useAuth();

  // Function to track events
  const trackEvent = (eventName: string, eventData: Record<string, any> = {}): void => {
    if (!member) return;

    let userData: Record<string, any> = {
      user_id: member.uid ?? 'unknown',
      email: member.email ?? 'unknown',
      name: member.displayName ?? 'unknown',
      member_name: member?.memberName ?? 'unknown',
      subscription: '',
      subscriptionVariant: ''
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
      mixpanel.track(eventName, eventPayload);
      amplitude.track(eventName, eventPayload);
    }
  };

  return { trackEvent };
};
