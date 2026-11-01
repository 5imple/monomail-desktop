import { atom, type WritableAtom } from 'jotai';
import { unwrap } from 'jotai/utils';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';

type Transform<T> = {
  toPlainObject?: (item: T) => Record<string, any>;
  fromPlainObject?: (obj: Record<string, any>) => T;
};

type StorageConfig<T> = {
  defaultValue: T;
  transform?: Transform<T>;
  channelName?: string;
};

type SubscriptionCallback<T> = (newValue: T) => void;

type GeneralizedStorage<T> = {
  getItem: (key: string) => Promise<T>;
  setItem: (key: string, value: T) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  subscribe: (key: string, callback: SubscriptionCallback<T>, initialValue: T) => () => void;
};

export const createIndexedDBStorage = <T>(config: StorageConfig<T>): GeneralizedStorage<T> => {
  const { defaultValue, transform = {}, channelName: channelNameProp } = config;
  const channelName = channelNameProp ?? 'indexeddb-sync';

  return {
    async getItem(key: string): Promise<T> {
      const rawData = await monoLocalStorageDb.getItem<Record<string, any>>(
        key,
        transform.toPlainObject
          ? transform.toPlainObject(defaultValue)
          : (defaultValue as Record<string, any>)
      );
      // Ensure rawData is cast appropriately for the transform
      const result = transform.fromPlainObject
        ? transform.fromPlainObject(rawData as Record<string, any>)
        : (rawData as T);

      return result;
    },

    async setItem(key: string, value: T): Promise<void> {
      const transformedValue = transform.toPlainObject ? transform.toPlainObject(value) : value;
      await monoLocalStorageDb.setItem(key, transformedValue);

      const channel = new BroadcastChannel(channelName);
      channel.postMessage({ type: 'SET', key, value: transformedValue });
      channel.close();
    },

    async removeItem(key: string): Promise<void> {
      await monoLocalStorageDb.removeItem(key);

      const channel = new BroadcastChannel(channelName);
      channel.postMessage({ type: 'REMOVE', key });
      channel.close();
    },

    subscribe(key: string, callback: SubscriptionCallback<T>, initialValue: T): () => void {
      const channel = new BroadcastChannel(channelName);

      const handler = (event: MessageEvent) => {
        const { type, key: eventKey, value } = event.data || {};
        if (eventKey === key) {
          if (type === 'SET') {
            callback(transform.fromPlainObject ? transform.fromPlainObject(value) : (value as T));
          } else if (type === 'REMOVE') {
            callback(initialValue);
          }
        }
      };

      channel.addEventListener('message', handler);

      return () => {
        channel.removeEventListener('message', handler);
        channel.close();
      };
    }
  };
};

/**
 * Wraps an `atomWithStorage` atom backed by {@link createIndexedDBStorage} so
 * that reading it never suspends.
 *
 * jotai loads an async-storage atom when its first subscriber mounts, by
 * setting it to the pending `getItem` promise; every reader then suspends.
 * When that first subscriber mounts in response to a keypress (R opens the
 * compose card, a key opens the calendar), the suspension lands on a
 * synchronous update with no Suspense boundary and React replaces the whole
 * app with "A component suspended while responding to synchronous input".
 *
 * Reads return the last known value (or `fallback` before the first load);
 * writes go straight through to the storage atom.
 */
export function nonSuspendingStorageAtom<Value, Args extends unknown[], Result>(
  storageAtom: WritableAtom<Value | Promise<Value>, Args, Result>,
  fallback: Value
): WritableAtom<Value, Args, Result> {
  const readable = unwrap(storageAtom, (prev) => prev ?? fallback);
  return atom(
    (get) => get(readable) as Value,
    (_get, set, ...args: Args) => set(storageAtom, ...args)
  );
}
