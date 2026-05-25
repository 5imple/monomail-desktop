import { MonoCacheDB } from '@/renderer/app/lib/db/db';
import { IDBPDatabase } from 'idb';

export function upgradeToVersion3(db: IDBPDatabase<MonoCacheDB>, transaction: IDBTransaction) {
  // Local store for draft attachment / inline-image bytes (standalone send).
  if (!db.objectStoreNames.contains('draftAttachments')) {
    const store = db.createObjectStore('draftAttachments', { keyPath: 'attachmentId' });
    store.createIndex('byDraftId', 'draftId');
  }
}
