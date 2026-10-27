import { clear, createStore, del, delMany, get, getMany, keys, set, setMany } from 'idb-keyval';

import type { KeyValueStore } from './kv';

/**
 * Web version of the key-value store: IndexedDB (via idb-keyval) in its own
 * database, so the Local Datastore isn't capped by localStorage's ~5 MB.
 * expo-sqlite's web build needs WASM and cross-origin-isolation headers, so it
 * isn't used here.
 */
const store = createStore('pitaka', 'kv');

export type { KeyValueStore };

export const kv: KeyValueStore = {
  getItem: async (key) => (await get<string>(key, store)) ?? null,
  setItem: (key, value) => set(key, value, store),
  removeItem: (key) => del(key, store),
  mergeItem: async (key, value) => {
    const current = await get<string>(key, store);
    const merged = current ? { ...(JSON.parse(current) as object), ...(JSON.parse(value) as object) } : JSON.parse(value);
    await set(key, JSON.stringify(merged), store);
  },
  clear: () => clear(store),
  getAllKeys: async () => (await keys<string>(store)).map(String),
  multiGet: async (list) => {
    const values = await getMany<string>(list, store);
    return list.map((key, i) => [key, values[i] ?? null] as [string, string | null]);
  },
  multiSet: (pairs) => setMany(pairs, store),
  multiRemove: (list) => delMany(list, store),
};

export default kv;
