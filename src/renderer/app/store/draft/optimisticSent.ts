import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';

/**
 * A sent reply shown in its conversation before the provider has it.
 *
 * Gmail's send returns the new message's id, and the app fetches and inserts
 * it. Microsoft Graph's sendMail returns nothing (202, no body), and the mail
 * poller only watches the Inbox, so a reply never showed up in the open
 * conversation: it looked unanswered. The app inserts this stand-in at once
 * and swaps it for the real message once the conversation lists it.
 */

export const OPTIMISTIC_SENT_ID_PREFIX = 'local-sent:';

export const optimisticSentId = (draftId: string) => `${OPTIMISTIC_SENT_ID_PREFIX}${draftId}`;

const toBase64Url = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Rough plain text of the reply itself (quoted history left out). */
export const snippetFromHtml = (html: string, length = 160): string =>
  html
    .replace(/<div[^>]*data-history[\s\S]*$/i, '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);

/** The stand-in for a just-sent draft (`draft.body` is the final HTML). */
export function buildOptimisticSentMessage(
  draft: MonoDraft,
  threadId: string,
  now: number = Date.now()
): MonoMessage {
  const html = draft.body ?? '';
  const sender = { name: draft.author?.name ?? '', email: draft.from };
  const recipients = (emails: string[] = []) => emails.map((email) => ({ name: '', email }));
  return new MonoMessage({
    id: optimisticSentId(draft.id),
    threadId,
    timestamp: now,
    author: sender,
    from: sender,
    to: recipients(draft.to),
    cc: recipients(draft.cc),
    bcc: recipients(draft.bcc),
    subject: draft.subject ?? '',
    labelIds: ['SENT'],
    snippet: snippetFromHtml(html),
    payload: {
      partId: '0',
      mimeType: 'text/html',
      fileName: '',
      body: { attachmentId: null, size: html.length, data: toBase64Url(html) }
    },
    bodyHtml: html
  });
}

/**
 * The conversation's items once the real sent message is known, or null while
 * it isn't yet. The real one is a message from the sender that wasn't in the
 * conversation before the send — already in `current` (another sync brought
 * it) or among `fetched`. Messages new in `fetched` are added (oldest first);
 * the stand-in is removed.
 */
export function reconcileSentItems(
  current: ThreadItemBase[],
  fetched: ThreadItemBase[],
  options: { optimisticId: string; preSendIds: ReadonlySet<string>; senderEmail: string }
): ThreadItemBase[] | null {
  const sender = options.senderEmail.trim().toLowerCase();
  const isMessage = (item: ThreadItemBase): item is MonoMessage => item?.type === 'message';
  const isTheSentCopy = (item: ThreadItemBase) =>
    isMessage(item) &&
    item.id !== options.optimisticId &&
    !options.preSendIds.has(item.id) &&
    (item.from?.email ?? '').trim().toLowerCase() === sender;

  const currentIds = new Set(current.map((item) => item.id));
  const additions = fetched
    .filter((item) => isMessage(item) && !currentIds.has(item.id))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  if (!current.some(isTheSentCopy) && !additions.some(isTheSentCopy)) return null;
  return [...current.filter((item) => item.id !== options.optimisticId), ...additions];
}
