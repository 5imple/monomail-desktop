// User-facing strings shown by the main process (native notifications, the OAuth
// loopback pages). The main process has no locale switching yet: i18next lives in
// the renderer bundle and these surfaces can appear with no window open. Keep
// every main-process string in this one typed table so it can be localized later
// without hunting through services. Plain English for now.
//
// Pure module (no electron imports): the pure notification policy imports it and
// is unit-tested under the M365 harness.

export const MAIN_STRINGS = {
  notifications: {
    /** Title when a new-mail frame carries no sender. */
    newMailFallbackTitle: 'New email',
    /** One banner standing in for a burst of new mail in one account. */
    newMailSummaryTitle: (count: number): string => `${count} new emails`,
    newMailSummaryBodyOne: (sender: string): string => `From ${sender}`,
    newMailSummaryBodyTwo: (first: string, second: string): string => `From ${first} and ${second}`,
    newMailSummaryBodyMany: (first: string, second: string): string =>
      `From ${first}, ${second} and others`,
    backFromSnoozeTitle: 'Back from snooze',
    backFromSnoozeFallbackBody: 'A snoozed conversation is back in your inbox.',
    scheduleStuckTitle: 'Scheduled send may not have completed',
    scheduleStuckFallbackBody: 'A scheduled email was interrupted. Check your Sent folder.'
  },
  oauth: {
    successTitle: 'You are signed in',
    successBody: 'Mono Mail is open again. You can close this tab.',
    cancelledTitle: 'Sign-in cancelled',
    cancelledBody: 'You can close this tab and return to Mono Mail.',
    failedTitle: 'Sign-in failed',
    failedBody: 'Close this tab and try again in Mono Mail.'
  }
} as const;
