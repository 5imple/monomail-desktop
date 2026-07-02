import { MonoCacheDB } from '@/renderer/app/lib/db/db';
import { IDBPDatabase } from 'idb';

export function upgradeToVersion4(db: IDBPDatabase<MonoCacheDB>, transaction: IDBTransaction) {
  // Messages lacked the byLabelIds index that threads already had, so
  // DBGetMessagesByLabel had to getAll() + filter() every message in the store.
  const messagesStore = transaction.objectStore('messages');
  if (!messagesStore.indexNames.contains('byLabelIds')) {
    messagesStore.createIndex('byLabelIds', 'labelIds', { multiEntry: true });
  }
}
