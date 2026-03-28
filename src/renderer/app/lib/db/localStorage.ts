import { openDB } from 'idb';

const DB_NAME = 'monoLocalStorageDb';
const STORE_NAME = 'dataStore';
const SENT_EMAILS_COUNT_KEY = 'sent_emails_count';

const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    }
  });
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
  },

  async incrementSentEmailsCount(): Promise<number> {
    const currentCount = await this.getItem<number>(SENT_EMAILS_COUNT_KEY, 0);
    const newCount = currentCount + 1;
    await this.setItem(SENT_EMAILS_COUNT_KEY, newCount);
    return newCount;
  },

  async decrementSentEmailsCount(): Promise<number> {
    const currentCount = await this.getItem<number>(SENT_EMAILS_COUNT_KEY, 0);
    const newCount = currentCount - 1;
    await this.setItem(SENT_EMAILS_COUNT_KEY, newCount);
    return newCount;
  },

  async getSentEmailsCount(): Promise<number> {
    return this.getItem<number>(SENT_EMAILS_COUNT_KEY, 0);
  }
};
