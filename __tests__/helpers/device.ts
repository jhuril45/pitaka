/**
 * A simulated phone: its own Parse SDK instance, its own key-value store
 * (standing in for SQLite) and its own online/offline switch, talking to a
 * shared FakeServer as a given user. Several devices can exist in one test.
 */
import { createHash, randomUUID } from 'node:crypto';

import type { FakeServer } from './fake-server';

type Modules = {
  Parse: typeof import('@/parse/init').Parse;
  repo: typeof import('@/data/repo');
  store: typeof import('@/data/local-store');
  pins: typeof import('@/data/pins');
  engine: typeof import('@/sync/engine');
  outbox: typeof import('@/sync/outbox');
  issues: typeof import('@/sync/issues');
  profiles: typeof import('@/data/repos/profiles');
  accounts: typeof import('@/data/repos/accounts');
  categories: typeof import('@/data/repos/categories');
  transactions: typeof import('@/data/repos/transactions');
  merchantMappings: typeof import('@/data/repos/merchant-mappings');
  sharedCache: typeof import('@/data/shared-cache');
  attachments: typeof import('@/features/attachments/attachments');
  retry: typeof import('@/sync/retry');
};

export interface Device extends Modules {
  online: boolean;
  kv: Map<string, string>;
}

function kvApi(store: Map<string, string>) {
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => store.delete(key),
    mergeItem: async () => {},
    clear: async () => store.clear(),
    getAllKeys: async () => [...store.keys()],
    multiGet: async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null]),
    multiSet: async (pairs: [string, string][]) => {
      for (const [key, value] of pairs) store.set(key, value);
    },
    multiRemove: async (keys: string[]) => {
      for (const key of keys) store.delete(key);
    },
  };
}

export function createDevice(server: FakeServer, userId: string): Device {
  const kv = new Map<string, string>();
  const device = { online: true, kv } as Device;

  process.env.EXPO_PUBLIC_PARSE_APP_ID = 'test-app';
  process.env.EXPO_PUBLIC_PARSE_JS_KEY = 'test-key';
  process.env.EXPO_PUBLIC_PARSE_SERVER_URL = 'http://127.0.0.1:9/parse';

  jest.isolateModules(() => {
    jest.doMock('expo-sqlite/kv-store', () => ({ __esModule: true, default: kvApi(kv) }));
    jest.doMock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
    jest.doMock('expo-crypto', () => ({
      randomUUID,
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      digestStringAsync: async (_algorithm: string, data: string) => createHash('sha256').update(data).digest('hex'),
    }));
    jest.doMock('expo-network', () => ({
      getNetworkStateAsync: async () => ({ isConnected: device.online, isInternetReachable: device.online }),
      addNetworkStateListener: () => ({ remove() {} }),
    }));

    const { initParse } = require('@/parse/init') as typeof import('@/parse/init');
    const Parse = initParse();
    const offline = () => new Parse.Error(Parse.Error.CONNECTION_FAILED, 'offline');
    const call = <T>(fn: () => T): Promise<T> =>
      device.online ? Promise.resolve(JSON.parse(JSON.stringify(fn()))) : Promise.reject(offline());

    jest.doMock('@/parse/cloud', () => ({
      syncPush: (changes: never) => call(() => server.push(userId, changes)),
      syncPull: (cursor: never, limit: number) => call(() => server.pull(userId, cursor, limit)),
      bootstrap: () => call(() => server.bootstrap(userId)),
    }));
    jest.doMock('@/sync/session', () => ({
      ...jest.requireActual('@/sync/session'),
      currentUserId: async () => userId,
    }));

    Object.assign(device, {
      Parse,
      repo: require('@/data/repo'),
      store: require('@/data/local-store'),
      pins: require('@/data/pins'),
      engine: require('@/sync/engine'),
      outbox: require('@/sync/outbox'),
      issues: require('@/sync/issues'),
      profiles: require('@/data/repos/profiles'),
      accounts: require('@/data/repos/accounts'),
      categories: require('@/data/repos/categories'),
      transactions: require('@/data/repos/transactions'),
      merchantMappings: require('@/data/repos/merchant-mappings'),
      sharedCache: require('@/data/shared-cache'),
      attachments: require('@/features/attachments/attachments'),
      retry: require('@/sync/retry'),
    });
  });

  return device;
}

/** Let the clock move so successive edits get distinct clientUpdatedAt values. */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
