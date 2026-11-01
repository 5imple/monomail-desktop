import { withLegacyEmptyBodyCleared } from '@/main/models/message/bodyData';
import { MonoMessageRecord } from '@/renderer/app/lib/db/types/index';

/** The slice of an IndexedDB cursor (idb's IDBPCursorWithValue) this migration uses. */
export interface MessageCursor {
  value: MonoMessageRecord;
  update(value: MonoMessageRecord): unknown;
  continue(): Promise<MessageCursor | null>;
}

/** The slice of the upgrade transaction (idb's IDBPTransaction) this migration uses. */
export interface MessagesUpgradeTransaction {
  objectStore(name: 'messages'): { openCursor(): Promise<MessageCursor | null> };
}

/**
 * v5: an empty message body now counts as fetched (`data: ''`, see
 * bodyData.payloadHasBodyData), so a stored copy that only looks empty must
 * not. Caches written before 2026-10-27 hold metadata-only Microsoft copies
 * whose body data is '' instead of null: reset those to null, so each is
 * fetched once more on its next open. Messages with any body text are left
 * alone. Runs inside the version-change transaction; returns how many records
 * it reset.
 */
export async function upgradeToVersion5(transaction: MessagesUpgradeTransaction): Promise<number> {
  let reset = 0;
  let cursor = await transaction.objectStore('messages').openCursor();
  while (cursor) {
    const cleared = withLegacyEmptyBodyCleared(cursor.value);
    if (cleared) {
      cursor.update(cleared);
      reset += 1;
    }
    cursor = await cursor.continue();
  }
  return reset;
}
