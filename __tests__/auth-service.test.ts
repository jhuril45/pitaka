/**
 * Auth service against the real Parse RN SDK, with the server URL pointing at a
 * closed port so every request fails like it does offline.
 */
jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  const api = {
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
  return { __esModule: true, default: api };
});

process.env.EXPO_PUBLIC_PARSE_APP_ID = 'test-app';
process.env.EXPO_PUBLIC_PARSE_JS_KEY = 'test-key';
process.env.EXPO_PUBLIC_PARSE_SERVER_URL = 'http://127.0.0.1:9/parse';

import { initParse } from '@/parse/init';

const Parse = initParse();
// Fail fast instead of retrying the unreachable server.
Parse.CoreManager.set('REQUEST_ATTEMPT_LIMIT', 1);

import * as auth from '@/features/auth/auth-service';

describe('register validation (before any network call)', () => {
  const valid = { name: 'Juan', email: 'juan@example.com', password: 'longenough' };

  it.each([
    [{ ...valid, name: '  ' }, /your name/],
    [{ ...valid, email: 'not-an-email' }, /valid email/],
    [{ ...valid, password: 'short' }, /at least 8 characters/],
  ])('rejects %o', async (input, message) => {
    await expect(auth.register(input)).rejects.toThrow(message);
  });

  it('rejects a bad email for password reset', async () => {
    await expect(auth.requestPasswordReset('nope')).rejects.toThrow(/valid email/);
  });
});

describe('offline behaviour', () => {
  it('starts signed out', async () => {
    await expect(auth.restore()).resolves.toEqual({ status: 'signed-out' });
  });

  it('shows a friendly message when login cannot reach the server', async () => {
    await expect(auth.login({ email: 'Juan@Example.com', password: 'whatever1' })).rejects.toThrow(
      /No internet connection/,
    );
  });

  it('shows a friendly message when register cannot reach the server', async () => {
    await expect(auth.register({ name: 'Juan', email: 'juan@example.com', password: 'longenough' })).rejects.toThrow(
      /No internet connection/,
    );
  });

  it('logout stays signed out and clears the local datastore', async () => {
    const probe = new Parse.Object('Note');
    probe.set('uuid', 'x');
    await probe.pinWithName('profile:test');
    await auth.logout();
    await expect(auth.restore()).resolves.toEqual({ status: 'signed-out' });
    const query = new Parse.Query('Note');
    query.fromPinWithName('profile:test');
    await expect(query.find()).resolves.toHaveLength(0);
  });
});
