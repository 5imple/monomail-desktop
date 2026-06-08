import thread from '@/main/api/mail/thread';
import message from '@/main/api/mail/message';
import attachment from '@/main/api/mail/attachment';
import label from '@/main/api/mail/label';
import history from '@/main/api/mail/history';

// The current Gmail-direct behavior, unchanged — just grouped behind the
// provider seam. drafts/reminder/cloudPubSub are NOT here: they hit the backend
// `apiClient` (or local stores), not the Gmail API, so they are provider-neutral
// and stay on `mailApi` directly.
export const googleMailProvider = {
  ...thread,
  ...message,
  ...attachment,
  ...label,
  ...history
};

// The adapter contract is *derived* from the Google implementation, so the
// interface and the Gmail behavior can never drift, and microsoftMailProvider
// is forced to implement exactly the same shape.
export type MailProviderAdapter = typeof googleMailProvider;
