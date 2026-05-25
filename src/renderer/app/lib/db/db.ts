import { Contact } from '@/renderer/app/lib/db/contact';
import { upgradeToVersion1 } from '@/renderer/app/lib/db/migrations/v1';
import { upgradeToVersion2 } from '@/renderer/app/lib/db/migrations/v2';
import { upgradeToVersion3 } from '@/renderer/app/lib/db/migrations/v3';
import {
  DraftAttachmentRecord,
  MonoDraftRecord,
  MonoMessageRecord,
  MonoThreadRecord
} from '@/renderer/app/lib/db/types/index';
import { IDBPDatabase, openDB } from 'idb';

export interface MonoCacheDB {
  contacts: {
    key: string;
    value: Contact;
    indexes: {
      byPinned: number;
      byEmailAddress: string;
      byLastReceivedMessageTimestamp: number;
      byLastSentMessageTimestamp: number;
    };
  };
  threads: {
    key: string;
    value: MonoThreadRecord;
    indexes: {
      byThreadId: string;
      byTimestamp: number;
    };
  };
  messages: {
    key: string;
    value: MonoMessageRecord;
    indexes: {
      byThreadId: string;
      byMessageId: string;
      byTimestamp: number;
    };
  };
  drafts: {
    key: string;
    value: MonoDraftRecord;
    indexes: {
      byMessageId: string;
      byDraftId: string;
      byThreadId: string;
    };
  };
  draftAttachments: {
    key: string;
    value: DraftAttachmentRecord;
    indexes: {
      byDraftId: string;
    };
  };
}

const db: Map<string, IDBPDatabase<MonoCacheDB>> = new Map();

const migrations = [
  (db, transaction) => {
    upgradeToVersion1(db, transaction);
  },
  (db, transaction) => {
    upgradeToVersion2(db, transaction);
  },
  (db, transaction) => {
    upgradeToVersion3(db, transaction);
  }
];

export async function initDB(uid: string): Promise<IDBPDatabase<MonoCacheDB>> {
  // Return the existing database if it's already initialized
  const existingDB = db.get(uid);
  if (existingDB) {
    return existingDB;
  }

  // Initialize the new database if it doesn't exist
  const newDb = await openDB<MonoCacheDB>(`mono-db-${uid}`, 3, {
    upgrade(db, oldVersion, newVersion, transaction) {
      for (let version = oldVersion + 1; version <= newVersion!; version++) {
        const migration = migrations[version - 1];
        if (migration) {
          migration(db, transaction);
        }
      }
    }
  });

  // Cache the initialized database
  db.set(uid, newDb);

  // Return the newly initialized database
  return newDb;
}

export async function closeDB(uid: string): Promise<void> {
  const existingDB = db.get(uid);
  if (existingDB) {
    existingDB.close();
    db.delete(uid);
  }
}
