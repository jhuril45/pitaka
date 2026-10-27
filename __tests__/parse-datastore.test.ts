/**
 * Runs the real Parse React Native SDK against the kv-store adapter, with the
 * SQLite kv-store replaced by an in-memory map. Proves the callback bridge works
 * for pin / query / unpin — the calls the Local Datastore makes on device.
 */

jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
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
    },
  };
});

const originalEnv = { ...process.env };

beforeAll(() => {
  process.env.EXPO_PUBLIC_PARSE_APP_ID = 'test-app-id';
  process.env.EXPO_PUBLIC_PARSE_JS_KEY = 'test-js-key';
  process.env.EXPO_PUBLIC_PARSE_SERVER_URL = 'http://localhost:1337/parse';
});

afterAll(() => {
  process.env = originalEnv;
});

type InitModule = typeof import('@/parse/init');

function loadInit(): InitModule {
  let mod: InitModule | undefined;
  jest.isolateModules(() => {
    mod = require('@/parse/init');
  });
  return mod!;
}

describe('Parse Local Datastore over expo kv-store', () => {
  it('pins, queries by named pin, and unpins without network', async () => {
    const Parse = loadInit().initParse();
    expect(Parse.isLocalDatastoreEnabled()).toBe(true);

    const make = (uuid: string, month: string, amountMinor: number) => {
      const tx = new Parse.Object('Transaction');
      tx.set({ uuid, month, amountMinor });
      return tx;
    };

    await Parse.Object.pinAllWithName('tx:p1:2026-10', [make('a', '2026-10', 25000), make('b', '2026-10', 9900)]);
    await Parse.Object.pinAllWithName('tx:p1:2026-09', [make('c', '2026-09', 100)]);

    const october = new Parse.Query('Transaction');
    october.fromPinWithName('tx:p1:2026-10');
    october.ascending('uuid');
    const rows = await october.find();
    expect(rows.map((r) => r.get('uuid'))).toEqual(['a', 'b']);

    const byUuid = new Parse.Query('Transaction');
    byUuid.fromPinWithName('tx:p1:2026-09');
    byUuid.equalTo('uuid', 'c');
    expect((await byUuid.first())?.get('amountMinor')).toBe(100);

    await Parse.Object.unPinAllObjectsWithName('tx:p1:2026-10');
    expect(await october.find()).toHaveLength(0);
    expect(await byUuid.first()).toBeDefined();
  });

  it('reports missing keys clearly', () => {
    delete process.env.EXPO_PUBLIC_PARSE_APP_ID;
    const { initParse } = loadInit();
    expect(() => initParse()).toThrow(/EXPO_PUBLIC_PARSE_APP_ID/);
  });
});
