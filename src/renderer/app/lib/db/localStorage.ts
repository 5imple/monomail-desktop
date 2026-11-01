import { IDBPDatabase, openDB } from 'idb';

const DB_NAME = 'monoLocalStorageDb';
const STORE_NAME = 'dataStore';

// One connection for the app: every read and write used to open the database
// again, and startup reads a dozen keys (preferences, spaces, layout) in a row.
// It is dropped when the database is deleted or upgraded elsewhere (Reset
// cache), or closes unexpectedly, and the next call opens a new one.
let dbPromise: Promise<IDBPDatabase> | null = null;

const initDB = (): Promise<IDBPDatabase> => {
  if (!dbPromise) {
    const opening = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      }
    });
    dbPromise = opening;
    opening.catch(() => {
      if (dbPromise === opening) dbPromise = null;
    });
  }
  return dbPromise;
};

export const monoLocalStorageDb = {
  async getItem<T>(key: string, defaultValue?: T): Promise<T> {
    const db = await initDB();
    const value = await db.get(STORE_NAME, key);
    // If the value doesn't exist, return default and save it
    if (value === undefined && defaultValue !== undefined) {
      await this.setItem(key, defaultValue);
      return defaultValue;
    }

    return value ?? null;
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    const db = await initDB();
    await db.put(STORE_NAME, value, key);
  },

  async removeItem(key: string): Promise<void> {
    const db = await initDB();
    await db.delete(STORE_NAME, key);
  }
};
