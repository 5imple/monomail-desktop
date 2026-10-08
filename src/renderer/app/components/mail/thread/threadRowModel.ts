import type { MonoMessage } from '@/main/models/message/MonoMessage';
import type { MonoThread } from '@/main/models/thread/MonoThread';
import type { MonoRecipient } from '@/main/models/types';

// Pure row logic for the inbox list (see ThreadRowParts), kept free of React
// so it can be unit-tested.

type AccountLike = { email: string };

export const isOwnAddress = (accounts: AccountLike[], email?: string) => {
  const normalized = email?.trim().toLowerCase();
  return !!normalized && accounts.some((a) => a.email.trim().toLowerCase() === normalized);
};

const threadMessages = (thread: MonoThread) =>
  thread.items.filter(
    (item): item is MonoMessage => item.type === 'message' && !!(item as MonoMessage).from
  );

/** Every message in the thread was written by one of your accounts (Sent). */
export function isAllMine(thread: MonoThread, accounts: AccountLike[]) {
  const messages = threadMessages(thread);
  return messages.length > 0 && messages.every((m) => isOwnAddress(accounts, m.from.email));
}

/** The thread's recipients other than you. */
export function otherRecipients(thread: MonoThread, accounts: AccountLike[]): MonoRecipient[] {
  return thread.to.filter((r) => r?.email && !isOwnAddress(accounts, r.email));
}

/**
 * Who the row's avatar shows: the latest sender — or, when you wrote every
 * message (the Sent view), the first person you wrote to instead of yourself.
 */
export function rowAvatarRecipient(thread: MonoThread, accounts: AccountLike[]): MonoRecipient {
  if (isAllMine(thread, accounts)) {
    const firstRecipient = otherRecipients(thread, accounts)[0];
    if (firstRecipient) return firstRecipient;
  }
  const messages = threadMessages(thread);
  return messages[messages.length - 1]?.from ?? thread.from?.[0] ?? { email: '', name: '' };
}

// The org banner prefixed to external mail ("**External Email-Use caution
// with attachments and links from unknown senders **") filled most previews.
// Only the list preview drops it — the reader still shows the full message.
// Also matches a preview cut off before the closing "**".
const EXTERNAL_BANNER = /^\s*\*\*\s*External Email\b[^*]*(?:\*\*)?\s*/i;
// Microsoft 365's first-contact safety tip, which Outlook puts at the top of
// the body (and so the preview): "You don't often get email from x@y.
// Learn why this is important" / "Some people who received this message …".
const FIRST_CONTACT_TIP =
  /^\s*(?:Some people who received this message don['’]t|You don['’]t) often get email from \S+?\.?\s+(?:Learn why this is important\.?\s*(?:<[^>]*>)?\s*)?/i;

export function stripExternalBanner(snippet: string | null | undefined): string {
  if (!snippet) return '';
  let text = snippet;
  // Either can come first; strip a couple of rounds.
  for (let i = 0; i < 2; i++) {
    text = text.replace(EXTERNAL_BANNER, '').replace(FIRST_CONTACT_TIP, '');
  }
  return text.trim();
}
