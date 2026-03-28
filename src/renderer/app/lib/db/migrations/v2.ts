import { MonoCacheDB } from '@/renderer/app/lib/db/db';
import { IDBPDatabase } from 'idb';

export function upgradeToVersion2(db: IDBPDatabase<MonoCacheDB>, transaction: IDBTransaction) {
  // Add syncHistoryMeta store for sync metadata
  if (!db.objectStoreNames.contains('syncHistoryMeta')) {
    const syncHistoryMetaStore = db.createObjectStore('syncHistoryMeta');
    // We don't need indexes as we'll use direct key access
  }
}
