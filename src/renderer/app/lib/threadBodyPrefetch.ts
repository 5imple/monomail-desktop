import mailApi from '@/main/api/mail/mailApi';
import { payloadHasBodyData, withCachedBodies } from '@/main/models/message/bodyData';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { parsePayloadPartWithHighlight } from '@/main/models/message/parsePayloadPartWithHighlight';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { pickOpenMessages } from '@/renderer/app/lib/readerExpansion';

/**
 * Full-body thread fetches shared between the reader and the list's prefetch.
 *
 * The inbox list only carries metadata, so opening a thread for the first time
 * waits on a network round trip before any body text renders. Starting that
 * fetch before the open (pointer or highlight resting on a row, the first rows
 * of a settled list) hides most of it; sharing the in-flight promise means the
 * reader awaits the prefetch instead of issuing a duplicate. Once loaded, a
 * body is kept (bodyData.withCachedBodies / DBSaveThread), so this costs once
 * per thread, not once per refresh of the list. A fetched thread's opening
 * messages are also parsed in idle time, so the open finds them parsed.
 *
 * Long threads load progressively: the newest message (the only one the
 * reader expands) arrives first via onPartial, the rest in the background.
 */

export { payloadHasBodyData };

const inflight = new Map<string, Promise<MonoThread>>();

const messagesOf = (thread: MonoThread): MonoMessage[] =>
  thread.items.filter((item): item is MonoMessage => item.type === 'message');

/**
 * True when any message in the (cached) thread is still metadata-only. A
 * fetched message whose body is empty (data '') counts as loaded.
 */
export function threadNeedsFullBody(thread: MonoThread): boolean {
  const messages = messagesOf(thread);
  return messages.length === 0 || messages.some((message) => !payloadHasBodyData(message.payload));
}

const whenIdle = (task: () => void) => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(task, { timeout: 2000 });
  } else {
    setTimeout(task, 50);
  }
};

/**
 * Parse, in idle time, the messages `thread` will open on (pickOpenMessages),
 * so opening it renders from the parse cache. Plain light-mode parse with no
 * search highlight: what the reader asks for in the common case.
 */
export function warmThreadBodies(thread: MonoThread): void {
  whenIdle(() => {
    const messages = messagesOf(thread);
    const { expanded } = pickOpenMessages(messages);
    for (const message of messages) {
      if (!expanded.has(message.id) || !payloadHasBodyData(message.payload)) continue;
      try {
        parsePayloadPartWithHighlight(message, '', false);
      } catch {
        // Best effort: the reader parses (and reports) it on open.
      }
    }
  });
}

/**
 * Fetch a thread with full message bodies, de-duplicating concurrent calls.
 * For long conversations the provider first hands `onPartial` a thread whose
 * newest message is complete, merged with any bodies already in `cached` so a
 * new reply on an already-read thread doesn't blank the older messages while
 * the rest loads. The provider decides by the real conversation size: a
 * folder's cached copy can hold just one message of a 36-message conversation.
 *
 * `onPartial` runs synchronously and is NOT awaited: a caller that persists
 * the partial (updateThread → IndexedDB) must not hold back the full thread.
 * The order that matters still holds in memory: the partial's store update
 * has run before the provider hands back the full thread.
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
    const onPartial = options?.onPartial;
    request = mailApi
      .getThread(
        accountId,
        threadId,
        undefined,
        onPartial
          ? (partial) => {
              try {
                const pending = onPartial(
                  withCachedBodies(MonoThread.fromPlainObject(partial), cached)
                );
                if (pending instanceof Promise) {
                  pending.catch((error) =>
                    console.error('Applying a partial thread failed', error)
                  );
                }
              } catch (error) {
                console.error('Applying a partial thread failed', error);
              }
            }
          : undefined
      )
      .then((response) => {
        const thread = MonoThread.fromPlainObject(response);
        warmThreadBodies(thread);
        return thread;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, request);
  }
  return request;
}
