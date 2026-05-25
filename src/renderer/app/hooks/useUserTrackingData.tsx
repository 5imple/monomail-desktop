import { useAuth } from '@/renderer/app/context/AuthContext';
import mixpanel from 'mixpanel-browser';
import * as amplitude from '@amplitude/analytics-browser';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';

export const useUserTrackingData = () => {
  const { member } = useAuth();

  // Function to track events
  const trackEvent = (eventName: string, eventData: Record<string, any> = {}): void => {
    if (!member) return;

    const userData: Record<string, any> = {
      user_id: member.uid ?? 'unknown',
      email: member.email ?? 'unknown',
      name: member.displayName ?? 'unknown',
      member_name: member?.memberName ?? 'unknown'
    };

    const eventPayload = { ...userData, ...eventData };

    if (!isDevelopment()) {
      mixpanel.track(eventName, eventPayload);
      amplitude.track(eventName, eventPayload);
    }
  };

  return { trackEvent };
};
