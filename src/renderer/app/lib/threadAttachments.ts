import type { MonoMessage } from '@/main/models/message/MonoMessage';
import type { MonoThread } from '@/main/models/thread/MonoThread';

/**
 * Whether a thread carries file attachments. `thread.attachments` only fills
 * once message details are fetched; Microsoft list items know just Graph's
 * `hasAttachments` flag, so a row (and the "With attachments" filter) would
 * otherwise miss them until the thread happened to be opened or prefetched.
 */
export function threadHasFileAttachments(thread: Pick<MonoThread, 'attachments' | 'items'>) {
  return (
    Object.keys(thread.attachments).length > 0 ||
    thread.items.some(
      (item) => item.type === 'message' && (item as MonoMessage).hasAttachments === true
    )
  );
}
