import Storage from 'expo-sqlite/kv-store';

/**
 * The app's key-value store (string keys and values), used by the Parse SDK's
 * storage adapter and by the app's own bookkeeping (outbox, cursors, settings).
 *
 * Phones: expo-sqlite's kv-store (SQLite, no AsyncStorage size limit).
 * Web: IndexedDB — see kv.web.ts. Both expose this same promise API.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  mergeItem(key: string, value: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys(): Promise<string[]>;
  multiGet(keys: string[]): Promise<[string, string | null][]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
}

export const kv: KeyValueStore = {
  getItem: (key) => Storage.getItem(key),
  setItem: (key, value) => Storage.setItem(key, value),
  removeItem: async (key) => {
    await Storage.removeItem(key);
  },
  mergeItem: (key, value) => Storage.mergeItem(key, value),
  clear: async () => {
    await Storage.clear();
  },
  getAllKeys: () => Storage.getAllKeys(),
  multiGet: (keys) => Storage.multiGet(keys),
  multiSet: (pairs) => Storage.multiSet(pairs),
  multiRemove: (keys) => Storage.multiRemove(keys),
};

export default kv;
