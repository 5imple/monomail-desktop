import mailApi from '@/main/api/mail/mailApi';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';

/**
 * Full-body thread fetches shared between the reader and hover prefetch.
 *
 * The inbox list only carries metadata, so opening a thread for the first time
 * waits on a network round trip before any body text renders. Starting that
 * fetch when the pointer rests on a row hides most of it; sharing the in-flight
 * promise means the reader awaits the prefetch instead of issuing a duplicate.
 *
 * Long threads load progressively: the newest message (the only one the
 * reader expands) arrives first via onPartial, the rest in the background.
 */

const inflight = new Map<string, Promise<MonoThread>>();

const payloadHasBodyData = (payload: MonoMessage['payload']): boolean => {
  if (payload?.body?.data) return true;
  return payload?.parts?.some(payloadHasBodyData) ?? false;
};

const messagesOf = (thread: MonoThread): MonoMessage[] =>
  thread.items.filter((item): item is MonoMessage => item.type === 'message');

/** True when any message in the (cached) thread is still metadata-only. */
export function threadNeedsFullBody(thread: MonoThread): boolean {
  const messages = messagesOf(thread);
  return messages.length === 0 || messages.some((message) => !payloadHasBodyData(message.payload));
}

/**
 * Keep bodies the cache already has for messages the partial thread carries
 * metadata-only, so a new reply on an already-read thread doesn't blank the
 * older messages while the rest loads.
 */
export function mergeCachedBodies(partial: MonoThread, cached?: MonoThread | null): MonoThread {
  if (!cached) return partial;
  const cachedWithBody = new Map(
    messagesOf(cached)
      .filter((message) => payloadHasBodyData(message.payload))
      .map((message) => [message.id, message])
  );
  if (cachedWithBody.size === 0) return partial;
  return new MonoThread({
    ...partial.toPlainObject(),
    items: partial.items.map((item) =>
      item.type === 'message' &&
      !payloadHasBodyData((item as MonoMessage).payload) &&
      cachedWithBody.has(item.id)
        ? cachedWithBody.get(item.id)!
        : item
    )
  });
}

/**
 * Fetch a thread with full message bodies, de-duplicating concurrent calls.
 * For long conversations the provider first hands `onPartial` a thread whose
 * newest message is complete (merged with any bodies already in `cached`).
 * The provider decides by the real conversation size: a folder's cached copy
 * can hold just one message of a 36-message conversation.
 */
export function fetchFullThread(
  accountId: string,
  threadId: string,
  options?: { cached?: MonoThread | null; onPartial?: (partial: MonoThread) => unknown }
): Promise<MonoThread> {
  const key = `${accountId}:${threadId}`;
  let request = inflight.get(key);
  if (!request) {
    const cached = options?.cached;
    request = mailApi
      .getThread(
        accountId,
        threadId,
        undefined,
        options?.onPartial
          ? async (partial) => {
              await options!.onPartial!(
                mergeCachedBodies(MonoThread.fromPlainObject(partial), cached)
              );
            }
          : undefined
      )
      .then((response) => MonoThread.fromPlainObject(response))
      .finally(() => inflight.delete(key));
    inflight.set(key, request);
  }
  return request;
}
