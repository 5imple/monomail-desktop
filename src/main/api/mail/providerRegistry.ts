export type MailProvider = 'google' | 'microsoft';

// Renderer-populated map of account uid → provider. `mailApi` dispatches each
// provider-specific call to the matching adapter. Defaults to 'google' for any
// uid not yet registered, so the original Gmail-only behavior is preserved if
// the registry hasn't been populated (or for a uid the registry doesn't know).
let providerByUid: Record<string, MailProvider> = {};

export function setMailAccountProviders(map: Record<string, MailProvider>): void {
  providerByUid = { ...map };
}

export function getProviderForUid(uid: string): MailProvider {
  // Microsoft uids carry their provider as a prefix: use it when the registry
  // isn't filled yet (at startup it was empty, and a Microsoft account's
  // calendar and avatar calls went to the Gmail adapter and failed).
  return providerByUid[uid] ?? (uid?.startsWith('microsoft:') ? 'microsoft' : 'google');
}
