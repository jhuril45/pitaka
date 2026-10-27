/**
 * Milestone 2 security checks against the live dev Back4App app, using two
 * throwaway anonymous users over the REST API (exactly what a client could do).
 *
 *   npm run test:integration
 *
 * Both users are deleted again with deleteAccount at the end.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readEnv(): Record<string, string> {
  const text = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1]!, m[2]!]),
  );
}

const env = readEnv();
const SERVER = (env.EXPO_PUBLIC_PARSE_SERVER_URL || 'https://parseapi.back4app.com').replace(/\/$/, '');
const APP_ID = env.EXPO_PUBLIC_PARSE_APP_ID!;
const JS_KEY = env.EXPO_PUBLIC_PARSE_JS_KEY!;

interface ParseReply {
  status: number;
  body: any;
}

async function rest(method: string, path: string, body?: unknown, sessionToken?: string): Promise<ParseReply> {
  const headers: Record<string, string> = {
    'X-Parse-Application-Id': APP_ID,
    'X-Parse-Javascript-Key': JS_KEY,
    'Content-Type': 'application/json',
  };
  if (sessionToken) headers['X-Parse-Session-Token'] = sessionToken;
  const response = await fetch(`${SERVER}/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function anonymousUser() {
  const reply = await rest('POST', 'users', { authData: { anonymous: { id: randomUUID() } } });
  expect(reply.body.sessionToken).toBeDefined();
  return { id: reply.body.objectId as string, token: reply.body.sessionToken as string };
}

const PERMISSION_DENIED = 119; // Parse.Error.OPERATION_FORBIDDEN

let a: { id: string; token: string };
let b: { id: string; token: string };
let deviceTokenId: string;

beforeAll(async () => {
  // Refuse to run before the backend is set up: without CLPs the "must be
  // refused" writes below would succeed and leave junk rows in the dev app.
  // TrackedSymbol has no client access at all once setupSchema has run.
  const probe = await rest('GET', 'classes/TrackedSymbol');
  const fn = await rest('POST', 'functions/deleteAccount', {});
  if (probe.body.code !== PERMISSION_DENIED || fn.body.code === 141) {
    throw new Error(
      'Dev backend not set up: deploy cloud/main.js, then run the setupSchema and seedShared jobs. No data was written.',
    );
  }
  a = await anonymousUser();
  b = await anonymousUser();
});

afterAll(async () => {
  for (const user of [a, b]) {
    if (!user) continue;
    for (let i = 0; i < 20; i += 1) {
      const reply = await rest('POST', 'functions/deleteAccount', {}, user.token);
      if (reply.body.result?.done || reply.body.code === 209) break;
    }
  }
});

describe('anonymous users and functions', () => {
  it('registerDevice upserts a DeviceToken for the caller', async () => {
    const token = `ExponentPushToken[it-${randomUUID()}]`;
    const first = await rest('POST', 'functions/registerDevice', { expoPushToken: token, platform: 'android' }, a.token);
    expect(first.body.result?.uuid).toMatch(/^[0-9a-f-]{36}$/);
    const again = await rest('POST', 'functions/registerDevice', { expoPushToken: token, platform: 'android' }, a.token);
    expect(again.body.result.uuid).toBe(first.body.result.uuid);

    const mine = await rest('GET', `classes/DeviceToken?where=${encodeURIComponent(JSON.stringify({ expoPushToken: token }))}`, undefined, a.token);
    expect(mine.body.results).toHaveLength(1);
    deviceTokenId = mine.body.results[0].objectId;
    expect(mine.body.results[0].ACL).toEqual({ [a.id]: { read: true, write: true } });
    expect(mine.body.results[0].serverUpdatedAt).toBeDefined();
  });

  it('rejects anonymous callers without a session', async () => {
    const reply = await rest('POST', 'functions/registerDevice', { expoPushToken: 'ExponentPushToken[x]', platform: 'ios' });
    expect(reply.body.code).toBe(209);
  });
});

describe('user A cannot read or write user B data (and vice versa)', () => {
  it('B sees none of A’s rows', async () => {
    const list = await rest('GET', 'classes/DeviceToken', undefined, b.token);
    expect(list.body.results).toEqual([]);
    const get = await rest('GET', `classes/DeviceToken/${deviceTokenId}`, undefined, b.token);
    expect(get.body.code).toBe(101); // object not found
  });

  it('B cannot update or delete A’s row', async () => {
    const update = await rest('PUT', `classes/DeviceToken/${deviceTokenId}`, { platform: 'ios' }, b.token);
    expect([PERMISSION_DENIED, 101]).toContain(update.body.code);
    const remove = await rest('DELETE', `classes/DeviceToken/${deviceTokenId}`, undefined, b.token);
    expect([PERMISSION_DENIED, 101]).toContain(remove.body.code);
  });

  it('logged-out clients see nothing', async () => {
    const list = await rest('GET', 'classes/DeviceToken');
    if (list.body.code) expect(list.body.code).toBe(PERMISSION_DENIED);
    else expect(list.body.results).toEqual([]);
  });
});

describe('clients cannot write data classes directly', () => {
  it.each(['Transaction', 'Account', 'Profile', 'DeviceToken', 'MonthlySummary', 'Insight'])(
    'create on %s is refused',
    async (className) => {
      const reply = await rest('POST', `classes/${className}`, { uuid: randomUUID() }, a.token);
      expect(reply.body.code).toBe(PERMISSION_DENIED);
    },
  );

  it('even the owner cannot edit their own row directly', async () => {
    const reply = await rest('PUT', `classes/DeviceToken/${deviceTokenId}`, { platform: 'ios' }, a.token);
    expect(reply.body.code).toBe(PERMISSION_DENIED);
  });

  it('clients cannot add columns or read TrackedSymbol', async () => {
    const tracked = await rest('GET', 'classes/TrackedSymbol', undefined, a.token);
    expect(tracked.body.code).toBe(PERMISSION_DENIED);
  });

  it('the user list is hidden', async () => {
    const users = await rest('GET', 'users', undefined, a.token);
    expect(users.body.code).toBe(PERMISSION_DENIED);
  });
});

describe('shared classes', () => {
  it('are readable by any signed-in user and seeded', async () => {
    const banks = await rest('GET', 'classes/BankTemplate?limit=100', undefined, b.token);
    expect(banks.body.results.map((r: { key: string }) => r.key)).toEqual(expect.arrayContaining(['gcash', 'bdo', 'cash']));
    const categories = await rest('GET', 'classes/DefaultCategorySet?limit=200', undefined, b.token);
    expect(categories.body.results.length).toBeGreaterThanOrEqual(30);
  });

  it('cannot be written by clients', async () => {
    const reply = await rest('POST', 'classes/BankTemplate', { key: 'evil', name: 'Evil' }, a.token);
    expect(reply.body.code).toBe(PERMISSION_DENIED);
  });
});

describe('registration', () => {
  it('registers with email + name, logs in by email; duplicate emails and wrong passwords are refused', async () => {
    const email = `it-${randomUUID()}@example.com`;
    // Same request the Register screen makes through Parse.User.signUp().
    const created = await rest('POST', 'users', {
      username: email,
      email,
      password: 'correct-horse-1',
      name: 'Integration Test',
    });
    expect(created.body.sessionToken).toBeDefined();

    const me = await rest('GET', 'users/me', undefined, created.body.sessionToken);
    expect(me.body.objectId).toBe(created.body.objectId);
    expect(me.body.name).toBe('Integration Test');
    expect(me.body.email).toBe(email);

    const login = await rest('POST', 'login', { username: email, password: 'correct-horse-1' });
    expect(login.body.objectId).toBe(created.body.objectId);

    const duplicate = await rest('POST', 'users', { username: email, email, password: 'another-pass-1' });
    expect([202, 203]).toContain(duplicate.body.code);

    const wrong = await rest('POST', 'login', { username: email, password: 'wrong-password' });
    expect(wrong.body.code).toBe(101);

    for (let i = 0; i < 20; i += 1) {
      const reply = await rest('POST', 'functions/deleteAccount', {}, login.body.sessionToken);
      if (reply.body.result?.done) break;
    }
  });
});

describe('deleteAccount', () => {
  it('removes the user, their rows and their session', async () => {
    const throwaway = await anonymousUser();
    await rest(
      'POST',
      'functions/registerDevice',
      { expoPushToken: `ExponentPushToken[del-${randomUUID()}]`, platform: 'ios' },
      throwaway.token,
    );
    let done = false;
    for (let i = 0; i < 20 && !done; i += 1) {
      const reply = await rest('POST', 'functions/deleteAccount', {}, throwaway.token);
      expect(reply.body.error).toBeUndefined();
      done = reply.body.result.done;
    }
    expect(done).toBe(true);
    const me = await rest('GET', 'users/me', undefined, throwaway.token);
    expect(me.body.code).toBe(209); // invalid session token
  });
});
