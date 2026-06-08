import drafts from '@/main/api/mail/drafts';
import reminder from '@/main/api/mail/reminder';
import cloudPubSub from '@/main/api/mail/cloudPubSub';
import {
  googleMailProvider,
  MailProviderAdapter
} from '@/main/api/mail/providers/googleMailProvider';
import { microsoftMailProvider } from '@/main/api/mail/providers/microsoftMailProvider';
import { getProviderForUid } from '@/main/api/mail/providerRegistry';

function adapterFor(uid: string): MailProviderAdapter {
  return getProviderForUid(uid) === 'microsoft' ? microsoftMailProvider : googleMailProvider;
}

// Every provider-specific call takes the account `uid` as its first argument, so
// a uniform forwarder dispatches by that uid. Keys come from the Google adapter
// at runtime, so adding a method to the contract automatically dispatches.
const dispatched = Object.fromEntries(
  Object.keys(googleMailProvider).map((name) => [
    name,
    (uid: string, ...args: unknown[]) =>
      (adapterFor(uid)[name as keyof MailProviderAdapter] as (...a: unknown[]) => unknown)(
        uid,
        ...args
      )
  ])
) as MailProviderAdapter;

// drafts/reminder/cloudPubSub are backend/local (not the Gmail API) and stay
// provider-neutral.
export default {
  ...dispatched,
  ...drafts,
  ...reminder,
  ...cloudPubSub
};
