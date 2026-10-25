import { IMonoMessage, MonoMessage, MonoMessagePaylod } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';

/**
 * Message bodies, and keeping hold of them.
 *
 * A listing (the inbox, a label, a search) carries metadata only; a message's
 * body arrives with the first full fetch of its thread. Both are written to
 * the same places, the threads map in memory and the `messages` store in
 * IndexedDB, so a listing saved after a full fetch used to overwrite the body
 * with its metadata-only copy, and the next open of that email fetched the
 * body again. A body never changes once sent, so a copy that has one always
 * wins over a copy that hasn't; labels and the rest stay with the newer copy.
 */

// A body was fetched when a part carries data, even empty data: `data: null`
// (or no data) means "not fetched", `data: ''` means "fetched, and empty" (a
// meeting reply, a blank email). Every producer follows this: listings and
// metadata-only copies write null (graphTransforms.buildSyntheticPayload, the
// Gmail transforms), a full fetch writes the body or ''. Counting '' as "not
// fetched" made every conversation holding one empty message (each Outlook
// Accepted / Declined reply) fetch again on every open, and wasted prefetch.
// Caches written before 2026-10-27 hold metadata-only Graph copies with
// `data: ''`; the IndexedDB v5 migration resets those to null once
// (withLegacyEmptyBodyCleared below), so they are fetched one more time.
export const payloadHasBodyData = (payload: MonoMessagePaylod | null | undefined): boolean => {
  if (payload?.body && payload.body.data != null) return true;
  return payload?.parts?.some(payloadHasBodyData) ?? false;
};

export const messageHasBody = (message: Pick<IMonoMessage, 'payload'>): boolean =>
  payloadHasBodyData(message.payload);

/** Whether no part carries body text (`empty`), and whether some carry '' (`hasBlank`). */
const scanBodyData = (payload: MonoMessagePaylod): { empty: boolean; hasBlank: boolean } => {
  const data = payload.body?.data;
  let empty = !data;
  let hasBlank = data === '';
  for (const part of payload.parts ?? []) {
    const child = scanBodyData(part);
    empty = empty && child.empty;
    hasBlank = hasBlank || child.hasBlank;
  }
  return { empty, hasBlank };
};

const withBlankDataCleared = (payload: MonoMessagePaylod): MonoMessagePaylod => ({
  ...payload,
  body: payload.body && payload.body.data === '' ? { ...payload.body, data: null } : payload.body,
  ...(payload.parts ? { parts: payload.parts.map(withBlankDataCleared) } : {})
});

/**
 * One-time cache repair (IndexedDB v5): a stored message whose parts carry no
 * body text at all, only `data: ''`, may be a metadata-only copy from before
 * 2026-10-27. Reset that data to null so it reads as "not fetched" and the
 * next open fetches it; a message that really is empty comes back with '' and
 * stays fetched from then on. Returns null when the record needs no change.
 */
export function withLegacyEmptyBodyCleared<T extends Pick<IMonoMessage, 'payload'>>(
  record: T
): T | null {
  if (!record?.payload) return null;
  const { empty, hasBlank } = scanBodyData(record.payload);
  if (!empty || !hasBlank) return null;
  return { ...record, payload: withBlankDataCleared(record.payload) };
}

/** What a message has to read: something, nothing, or unknown until its body is here. */
export type MessageContent = 'content' | 'empty' | 'unknown';

/**
 * Whether a message has something to read: text, files, or a meeting to act
 * on. An Outlook meeting reply ("Accepted: Standup") usually has none, and the
 * reader opens on the newest message that has (readerExpansion). Cheap: the
 * snippet, the attachment maps and the part data, no decoding. A message with
 * no snippet whose body hasn't been fetched is 'unknown' (an image-only email
 * has no snippet text either).
 */
export function messageContent(
  message: Pick<IMonoMessage, 'payload' | 'snippet' | 'attachments' | 'meeting' | 'hasAttachments'>
): MessageContent {
  if (message.snippet && message.snippet.trim()) return 'content';
  if (message.hasAttachments || Object.keys(message.attachments ?? {}).length > 0) {
    return 'content';
  }
  if (message.meeting) {
    // An invitation or a cancellation is something to act on, text or not.
    return message.meeting.kind === 'request' || message.meeting.kind === 'cancelled'
      ? 'content'
      : 'empty';
  }
  if (!payloadHasBodyData(message.payload)) return 'unknown';
  return scanBodyData(message.payload).empty ? 'empty' : 'content';
}

export const messageHasContent = (message: Parameters<typeof messageContent>[0]): boolean =>
  messageContent(message) !== 'empty';

/**
 * `incoming` with the body `stored` holds for the same message, when `incoming`
 * has none. Everything else (labels, snippet, history id…) stays `incoming`'s,
 * the fresher copy. Returns `incoming` itself when there is nothing to carry.
 */
export function withStoredBody<T extends IMonoMessage>(
  incoming: T,
  stored: IMonoMessage | null | undefined
): T {
  if (!stored || messageHasBody(incoming) || !messageHasBody(stored)) return incoming;
  return {
    ...incoming,
    payload: stored.payload,
    attachments: stored.attachments,
    inlineImages: stored.inlineImages,
    inlineImageSize: stored.inlineImageSize,
    bodyPlain: stored.bodyPlain,
    bodyHtml: stored.bodyHtml,
    ...(incoming.hasAttachments === undefined && stored.hasAttachments !== undefined
      ? { hasAttachments: stored.hasAttachments }
      : {}),
    // Meeting details come with the full fetch too.
    ...(!incoming.meeting && stored.meeting ? { meeting: stored.meeting } : {})
  };
}

/**
 * `thread` with the bodies `cached` already holds for its messages. Returns
 * `thread` itself when nothing carries over, so a caller keeps the same object.
 */
export function withCachedBodies(
  thread: MonoThread,
  cached: MonoThread | null | undefined
): MonoThread {
  if (!cached || cached === thread) return thread;

  const cachedWithBody = new Map<string, MonoMessage>();
  for (const item of cached.items) {
    if (item.type === 'message' && messageHasBody(item as MonoMessage)) {
      cachedWithBody.set(item.id, item as MonoMessage);
    }
  }
  if (cachedWithBody.size === 0) return thread;

  let changed = false;
  const items = thread.items.map((item) => {
    if (item.type !== 'message') return item;
    const message = item as MonoMessage;
    const stored = cachedWithBody.get(message.id);
    if (!stored || messageHasBody(message)) return item;
    changed = true;
    return new MonoMessage(withStoredBody(message.toPlainObject(), stored.toPlainObject()));
  });
  if (!changed) return thread;

  return new MonoThread({ ...thread.toPlainObject(), items });
}
