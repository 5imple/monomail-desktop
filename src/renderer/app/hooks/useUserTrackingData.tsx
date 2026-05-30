// Telemetry (Amplitude + Mixpanel) was removed for the standalone build.
// This hook is kept as a no-op so existing `trackEvent(...)` call sites don't
// need to change; it simply does nothing now.
export const useUserTrackingData = () => {
  const trackEvent = (_eventName: string, _eventData: Record<string, any> = {}): void => {
    // no-op: analytics intentionally disabled in the standalone build
  };

  return { trackEvent };
};
