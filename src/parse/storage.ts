import Storage from '@/lib/kv';

/**
 * Adapts the app's promise-based key-value store (SQLite kv-store on phones,
 * IndexedDB on web — see lib/kv) to the callback-style AsyncStorage API that
 * the Parse React Native SDK calls (`getItem(key, cb)` etc.).
 *
 * Parse's StorageController only listens to the callback, so passing the store
 * directly would leave every Local Datastore call pending forever.
 */

type Callback<T> = (error: Error | null, result?: T) => void;

function bridge<T>(promise: Promise<T>, callback?: Callback<T>): Promise<T> {
  if (!callback) return promise;
  // When a callback is given the caller ignores the returned promise, so it must
  // not reject (that would surface as an unhandled rejection).
  return promise.then(
    (result) => {
      callback(null, result);
      return result;
    },
    (error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)));
      return undefined as T;
    },
  );
}

export const parseAsyncStorage = {
  getItem(key: string, callback?: Callback<string | null>) {
    return bridge(Storage.getItem(key), callback);
  },
  setItem(key: string, value: string, callback?: Callback<void>) {
    return bridge(Storage.setItem(key, value), callback);
  },
  removeItem(key: string, callback?: Callback<void>) {
    return bridge(
      Storage.removeItem(key).then(() => undefined),
      callback,
    );
  },
  mergeItem(key: string, value: string, callback?: Callback<void>) {
    return bridge(Storage.mergeItem(key, value), callback);
  },
  clear(callback?: Callback<void>) {
    return bridge(
      Storage.clear().then(() => undefined),
      callback,
    );
  },
  getAllKeys(callback?: Callback<readonly string[]>) {
    return bridge<readonly string[]>(Storage.getAllKeys(), callback);
  },
  multiGet(keys: readonly string[], callback?: Callback<readonly [string, string | null][]>) {
    return bridge<readonly [string, string | null][]>(Storage.multiGet([...keys]), callback);
  },
  multiSet(keyValuePairs: readonly (readonly [string, string])[], callback?: Callback<void>) {
    return bridge(
      Storage.multiSet(keyValuePairs.map(([k, v]) => [k, v] as [string, string])),
      callback,
    );
  },
  multiRemove(keys: readonly string[], callback?: Callback<void>) {
    return bridge(Storage.multiRemove([...keys]), callback);
  },
};
