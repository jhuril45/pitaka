/**
 * Milestone 3 against the live dev Back4App app: syncPush / syncPull /
 * bootstrap over REST, as two throwaway anonymous users.
 *
 *   npm run test:integration
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

async function rest(method: string, path: string, body?: unknown, sessionToken?: string): Promise<any> {
  const headers: Record<string, string> = {
    'X-Parse-Application-Id': env.EXPO_PUBLIC_PARSE_APP_ID!,
    'X-Parse-Javascript-Key': env.EXPO_PUBLIC_PARSE_JS_KEY!,
    'Content-Type': 'application/json',
  };
  if (sessionToken) headers['X-Parse-Session-Token'] = sessionToken;
  const response = await fetch(`${SERVER}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}

async function fn(name: string, params: unknown, token: string): Promise<any> {
  const reply = await rest('POST', `functions/${name}`, params, token);
  if (reply.error) throw Object.assign(new Error(reply.error), { code: reply.code });
  return reply.result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** syncPull only returns rows older than 3 s. */
const settle = () => sleep(3500);

async function anonymousUser() {
  const reply = await rest('POST', 'users', { authData: { anonymous: { id: randomUUID() } } });
  return { id: reply.objectId as string, token: reply.sessionToken as string };
}

const PROFILE = randomUUID();
const ACCOUNT = randomUUID();
const stamp = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

const note = (body: string, uuid = randomUUID(), clientUpdatedAt = stamp()) => ({
  className: 'Note',
  record: { uuid, profileUuid: PROFILE, clientUpdatedAt, deletedAt: null, body, dueAt: null, done: false },
});

const expense = (amountMinor: unknown, uuid = randomUUID()) => ({
  className: 'Transaction',
  record: {
    uuid,
    profileUuid: PROFILE,
    clientUpdatedAt: stamp(),
    deletedAt: null,
    type: 'expense',
    amountMinor,
    accountUuid: ACCOUNT,
    toAccountUuid: null,
    categoryUuid: null,
    occurredAt: stamp(-60_000),
    note: '',
    merchant: 'Jollibee',
    source: 'manual',
    recurringRuleUuid: null,
    installmentUuid: null,
  },
});

async function pullAll(token: string, limit = 300) {
  const rows: { className: string; record: any }[] = [];
  let cursor = null;
  for (let i = 0; i < 50; i += 1) {
    const page = await fn('syncPull', { cursor, limit }, token);
    rows.push(...page.changes);
    cursor = page.cursor;
    if (!page.hasMore) break;
  }
  return { rows, cursor };
}

let a: { id: string; token: string };
let b: { id: string; token: string };

beforeAll(async () => {
  const probe = await rest('POST', 'functions/syncPull', {});
  if (probe.code === 141) {
    throw new Error('syncPull is not deployed: paste the latest cloud/main.js into Back4App Cloud Code and Deploy. No data was written.');
  }
  a = await anonymousUser();
  b = await anonymousUser();
}, 30000);

afterAll(async () => {
  for (const user of [a, b]) {
    if (!user) continue;
    for (let i = 0; i < 20; i += 1) {
      const reply = await rest('POST', 'functions/deleteAccount', {}, user.token);
      if (reply.result?.done || reply.code === 209) break;
    }
  }
}, 60000);

describe('syncPush', () => {
  it('accepts new rows, stamps serverUpdatedAt and is idempotent', async () => {
    const row = note('hello');
    const first = await fn('syncPush', { changes: [row], deviceId: 'it' }, a.token);
    expect(first.accepted).toEqual([expect.objectContaining({ className: 'Note', uuid: row.record.uuid, serverUpdatedAt: expect.any(String) })]);
    const again = await fn('syncPush', { changes: [row], deviceId: 'it' }, a.token);
    expect(again.accepted).toHaveLength(1);
    expect(again.conflicts).toHaveLength(0);
  });

  it('returns the server copy when the pushed change is older', async () => {
    const uuid = randomUUID();
    await fn('syncPush', { changes: [note('newer', uuid, stamp())] }, a.token);
    const stale = await fn('syncPush', { changes: [note('older', uuid, stamp(-60_000))] }, a.token);
    expect(stale.accepted).toHaveLength(0);
    expect(stale.conflicts).toEqual([expect.objectContaining({ uuid, server: expect.objectContaining({ body: 'newer' }) })]);
  });

  it('rejects bad rows one by one and keeps the good ones', async () => {
    const good = expense(25000);
    const floatMoney = expense(250.5);
    const wrongType = expense('lots');
    const result = await fn('syncPush', { changes: [good, floatMoney, wrongType] }, a.token);
    expect(result.accepted.map((r: any) => r.uuid)).toEqual([good.record.uuid]);
    const rejected = Object.fromEntries(result.rejected.map((r: any) => [r.uuid, r.error]));
    expect(rejected[floatMoney.record.uuid]).toMatch(/whole number of centavos/);
    expect(rejected[wrongType.record.uuid]).toMatch(/amountMinor must be Number/);
  });

  it('refuses unknown classes and more than 200 rows', async () => {
    const result = await fn('syncPush', { changes: [{ className: '_User', record: note('x').record }] }, a.token);
    expect(result.rejected[0].error).toMatch(/Unknown class/);
    await expect(fn('syncPush', { changes: new Array(201).fill(note('x')) }, a.token)).rejects.toThrow(/at most 200/);
  });
});

describe('owner isolation', () => {
  it('the same uuid pushed by two users stays two separate rows', async () => {
    const uuid = randomUUID();
    await fn('syncPush', { changes: [note('A owns this', uuid)] }, a.token);
    await fn('syncPush', { changes: [note('B owns this', uuid)] }, b.token);
    await settle();
    const fromA = (await pullAll(a.token)).rows.find((r) => r.record.uuid === uuid);
    const fromB = (await pullAll(b.token)).rows.filter((r) => r.className === 'Note');
    expect(fromA?.record.body).toBe('A owns this');
    expect(fromB.map((r) => r.record.body)).toEqual(['B owns this']);
  });
});

describe('syncPull', () => {
  it('pages through everything (including ties) and then returns nothing new', async () => {
    const user = await anonymousUser();
    const uuids = new Set<string>();
    for (let batch = 0; batch < 2; batch += 1) {
      const changes = Array.from({ length: 125 }, (_, i) => note(`row ${batch}-${i}`));
      changes.forEach((c) => uuids.add(c.record.uuid));
      const result = await fn('syncPush', { changes }, user.token);
      expect(result.accepted).toHaveLength(125);
    }
    await settle();
    const { rows, cursor } = await pullAll(user.token, 100);
    expect(new Set(rows.map((r) => r.record.uuid))).toEqual(uuids);
    expect(rows).toHaveLength(250);
    const after = await fn('syncPull', { cursor, limit: 100 }, user.token);
    expect(after.changes).toEqual([]);
    expect(after.hasMore).toBe(false);

    for (let i = 0; i < 20; i += 1) {
      const reply = await rest('POST', 'functions/deleteAccount', {}, user.token);
      if (reply.result?.done) break;
    }
  }, 120000);

  it('delivers edits and soft deletes after the cursor', async () => {
    const row = note('to delete');
    await fn('syncPush', { changes: [row] }, a.token);
    await settle();
    const { cursor } = await pullAll(a.token);

    await fn('syncPush', { changes: [{ ...row, record: { ...row.record, deletedAt: stamp(), clientUpdatedAt: stamp(1000) } }] }, a.token);
    const tooSoon = await fn('syncPull', { cursor }, a.token);
    expect(tooSoon.changes.find((c: any) => c.record.uuid === row.record.uuid)).toBeUndefined();
    await settle();
    const later = await fn('syncPull', { cursor }, a.token);
    const deleted = later.changes.find((c: any) => c.record.uuid === row.record.uuid);
    expect(deleted.record.deletedAt).toEqual(expect.any(String));
  });
});

describe('bootstrap', () => {
  it('returns reference data, recent transactions and the shared templates', async () => {
    const result = await fn('bootstrap', {}, a.token);
    const classes = new Set(result.changes.map((c: any) => c.className));
    expect(classes.has('Note')).toBe(true);
    expect(classes.has('Transaction')).toBe(true);
    expect(result.shared.bankTemplates.map((t: any) => t.key)).toEqual(expect.arrayContaining(['gcash', 'bdo']));
    expect(result.shared.categories.length).toBeGreaterThanOrEqual(30);
  });
});

describe('suggestCategory', () => {
  it('returns null for an unknown merchant and validates input', async () => {
    expect(await fn('suggestCategory', { merchant: `Unknown ${randomUUID()}` }, a.token)).toBeNull();
    await expect(fn('suggestCategory', { merchant: 42 }, a.token)).rejects.toThrow(/merchant must be text/);
  });
});

// Milestones 8–12 (need the redeployed cloud/main.js).

describe('monthly summaries and statistics', () => {
  it('keeps MonthlySummary in step with pushed transactions', async () => {
    const tx = expense(12345);
    await fn('syncPush', { changes: [tx] }, a.token);
    const month = new Date(new Date(tx.record.occurredAt).getTime() + 8 * 3600_000).toISOString().slice(0, 7);
    const stats = await fn('getStatistics', { profileUuid: PROFILE, fromMonth: month, toMonth: month }, a.token);
    expect(stats.totals.expenseMinor).toBeGreaterThanOrEqual(12345);
    // Another user sees nothing of it.
    const theirs = await fn('getStatistics', { profileUuid: PROFILE, fromMonth: month, toMonth: month }, b.token);
    expect(theirs.totals.txCount).toBe(0);
  });

  it('validates statistics, insight and history input', async () => {
    await expect(fn('getStatistics', { profileUuid: PROFILE, fromMonth: '2026-13', toMonth: '2026-01' }, a.token)).rejects.toThrow(/YYYY-MM/);
    await expect(fn('markInsightRead', { uuid: randomUUID() }, a.token)).rejects.toThrow(/not found/i);
    await expect(fn('getTransactionsPage', { profileUuid: 'x' }, a.token)).rejects.toThrow(/uuid/);
  });
});

describe('getTransactionsPage', () => {
  it('pages the caller’s transactions newest first', async () => {
    const page = await fn('getTransactionsPage', { profileUuid: PROFILE, limit: 2 }, a.token);
    expect(page.transactions.length).toBeGreaterThan(0);
    const times = page.transactions.map((t: any) => t.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    const none = await fn('getTransactionsPage', { profileUuid: PROFILE }, b.token);
    expect(none.transactions).toEqual([]);
  });
});

describe('getPrices', () => {
  it('validates symbols and returns only known snapshots', async () => {
    await expect(fn('getPrices', { symbols: [{ symbol: 'bad symbol', assetClass: 'crypto' }] }, a.token)).rejects.toThrow(/valid symbol/);
    const result = await fn('getPrices', { symbols: [{ symbol: 'ZZZNOTHELD', assetClass: 'ph_stock' }] }, a.token);
    expect(result.prices).toEqual([]);
  });
});
