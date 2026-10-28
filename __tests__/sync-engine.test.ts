/**
 * Milestone 3: offline-first writes, outbox, push/pull, conflicts and pins,
 * with several simulated devices sharing one (fake) server.
 */
import { randomUUID } from 'node:crypto';

import { createDevice, tick, type Device } from './helpers/device';
import { createFakeServer, type FakeServer } from './helpers/fake-server';

const USER = 'user-1';
const PROFILE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ACCOUNT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const note = (body: string) => ({ profileUuid: PROFILE, body, dueAt: null, done: false });
const expense = (amountMinor: number, occurredAt: string, uuid?: string) => ({
  ...(uuid ? { uuid } : {}),
  profileUuid: PROFILE,
  type: 'expense' as const,
  amountMinor,
  accountUuid: ACCOUNT,
  toAccountUuid: null,
  categoryUuid: null,
  occurredAt,
  note: '',
  merchant: 'Jollibee',
  source: 'manual' as const,
  recurringRuleUuid: null,
  installmentUuid: null,
});

const thisMonth = new Date();
thisMonth.setDate(10);
const iso = (d: Date) => d.toISOString();
const monthsAgo = (n: number) => {
  const d = new Date(thisMonth);
  d.setMonth(d.getMonth() - n);
  return iso(d);
};

let server: FakeServer;
let devices: Device[];

function device(): Device {
  const d = createDevice(server, USER);
  devices.push(d);
  return d;
}

async function notes(d: Device) {
  return d.store.listLive('Note', [d.pins.profilePin(PROFILE)]);
}

beforeEach(() => {
  server = createFakeServer();
  devices = [];
});

afterEach(() => {
  for (const d of devices) d.engine.stopSync();
});

describe('offline-first writes', () => {
  it('saves locally and queues while offline, then pushes once online', async () => {
    const phone = device();
    phone.online = false;

    const saved = await phone.repo.saveRecord('Note', note('Pay Meralco'));
    expect(await notes(phone)).toEqual([expect.objectContaining({ uuid: saved.uuid, body: 'Pay Meralco' })]);
    expect(await phone.outbox.listOutbox()).toHaveLength(1);
    expect(await phone.engine.syncNow()).toBe('offline');
    expect(server.rows(USER)).toHaveLength(0);

    phone.online = true;
    expect(await phone.engine.syncNow()).toBe('synced');
    expect(server.rows(USER).map((r) => r.record.body)).toEqual(['Pay Meralco']);
    expect(await phone.outbox.listOutbox()).toHaveLength(0);
    // The local copy now carries the server's serverUpdatedAt.
    expect((await notes(phone))[0]!.serverUpdatedAt).toBe(server.rows(USER)[0]!.t);
  });

  it('works on a first launch with no network at all', async () => {
    const phone = device();
    phone.online = false;
    await phone.repo.saveRecord('Note', note('first'));
    await phone.repo.saveRecord('Note', note('second'));
    expect((await notes(phone)).map((n) => n.body).sort()).toEqual(['first', 'second']);
    phone.online = true;
    await phone.engine.syncNow();
    expect(server.rows(USER)).toHaveLength(2);
  });

  it('de-duplicates the outbox: editing a row twice queues it once', async () => {
    const phone = device();
    phone.online = false;
    const first = await phone.repo.saveRecord('Note', note('v1'));
    await tick();
    await phone.repo.saveRecord('Note', { ...note('v2'), uuid: first.uuid });
    expect(await phone.outbox.listOutbox()).toHaveLength(1);
    phone.online = true;
    await phone.engine.syncNow();
    expect(server.rows(USER).map((r) => r.record.body)).toEqual(['v2']);
  });

  it('rejects invalid drafts before they reach the outbox', async () => {
    const phone = device();
    await expect(phone.repo.saveRecord('Transaction', expense(12.5, iso(thisMonth)))).rejects.toThrow();
    expect(await phone.outbox.listOutbox()).toHaveLength(0);
  });
});

describe('two devices converge', () => {
  it('a second device receives rows, edits and soft deletes', async () => {
    const a = device();
    const b = device();
    const kept = await a.repo.saveRecord('Note', note('keep'));
    const gone = await a.repo.saveRecord('Note', note('delete me'));
    await a.engine.syncNow();

    await b.engine.syncNow();
    expect((await notes(b)).map((n) => n.body).sort()).toEqual(['delete me', 'keep']);

    await tick();
    await b.repo.saveRecord('Note', { ...note('kept, edited on B'), uuid: kept.uuid });
    await b.repo.deleteRecord('Note', gone.uuid);
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect((await notes(a)).map((n) => n.body)).toEqual(['kept, edited on B']);
    expect((await notes(b)).map((n) => n.body)).toEqual(['kept, edited on B']);
    // The delete is a tombstone, not a hard delete.
    expect(server.rows(USER).find((r) => r.record.uuid === gone.uuid)?.record.deletedAt).toBeTruthy();
  });

  it('offline edits on both devices: the newer edit wins everywhere and the loser is logged', async () => {
    const a = device();
    const b = device();
    const shared = await a.repo.saveRecord('Note', note('original'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    a.online = false;
    b.online = false;
    await a.repo.saveRecord('Note', { ...note('A (older)'), uuid: shared.uuid });
    await tick();
    await b.repo.saveRecord('Note', { ...note('B (newer)'), uuid: shared.uuid });

    // The newer edit reaches the server first; the older one then conflicts.
    b.online = true;
    await b.engine.syncNow();
    a.online = true;
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect((await notes(a)).map((n) => n.body)).toEqual(['B (newer)']);
    expect((await notes(b)).map((n) => n.body)).toEqual(['B (newer)']);
    expect(server.rows(USER)[0]!.record.body).toBe('B (newer)');
    const issues = await a.issues.listIssues();
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'conflict', className: 'Note', uuid: shared.uuid, discarded: expect.objectContaining({ body: 'A (older)' }) }),
    ]);
    expect(await b.issues.listIssues()).toEqual([]);
  });

  it('the newer edit also wins when it is pushed second', async () => {
    const a = device();
    const b = device();
    const shared = await a.repo.saveRecord('Note', note('original'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    a.online = false;
    b.online = false;
    await a.repo.saveRecord('Note', { ...note('A (older)'), uuid: shared.uuid });
    await tick();
    await b.repo.saveRecord('Note', { ...note('B (newer)'), uuid: shared.uuid });

    a.online = true;
    await a.engine.syncNow();
    b.online = true;
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect((await notes(a)).map((n) => n.body)).toEqual(['B (newer)']);
    expect((await notes(b)).map((n) => n.body)).toEqual(['B (newer)']);
  });

  it('a pulled server copy does not overwrite a newer queued local edit', async () => {
    const a = device();
    const b = device();
    const shared = await a.repo.saveRecord('Note', note('original'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    await tick();
    await a.repo.saveRecord('Note', { ...note('server copy'), uuid: shared.uuid });
    await a.engine.syncNow();
    await tick();
    b.online = false;
    await b.repo.saveRecord('Note', { ...note('newer local'), uuid: shared.uuid });
    b.online = true;
    await b.engine.syncNow();

    expect((await notes(b)).map((n) => n.body)).toEqual(['newer local']);
    await a.engine.syncNow();
    expect((await notes(a)).map((n) => n.body)).toEqual(['newer local']);
  });
});

describe('server responses', () => {
  it('logs rejected rows as sync issues and stops retrying them', async () => {
    const phone = device();
    const bad = await phone.repo.saveRecord('Note', note('bad'));
    server.rejectUuids.add(bad.uuid);
    await phone.engine.syncNow();
    expect(await phone.outbox.listOutbox()).toHaveLength(0);
    expect(await phone.issues.listIssues()).toEqual([expect.objectContaining({ kind: 'rejected', uuid: bad.uuid })]);
  });

  it('Retry re-sends a refused row once the server accepts it', async () => {
    const phone = device();
    const row = await phone.repo.saveRecord('Note', note('needs newer server'));
    server.rejectUuids.add(row.uuid);
    await phone.engine.syncNow();
    const [issue] = await phone.issues.listIssues();
    expect(issue).toMatchObject({ kind: 'rejected', uuid: row.uuid });

    server.rejectUuids.delete(row.uuid); // e.g. the user redeployed Cloud Code
    expect(await phone.retry.retryIssue(issue!)).toBe(true);
    await phone.engine.syncNow();
    expect(server.rows(USER).map((r) => r.record.uuid)).toEqual([row.uuid]);
    expect(await phone.issues.listIssues()).toEqual([]);
  });

  it('pages through many rows, including rows that share a timestamp', async () => {
    const a = device();
    a.online = false;
    for (let i = 0; i < 350; i += 1) await a.repo.saveRecord('Note', note(`n${i}`));
    a.online = true;
    await a.engine.syncNow();
    // 350 rows → two pushes (200 + 150); each push stamps one shared serverUpdatedAt.
    expect(server.rows(USER)).toHaveLength(350);

    const b = device();
    await b.engine.syncNow();
    expect(await notes(b)).toHaveLength(350);
  });

  it('pulls only what changed since the last sync', async () => {
    const a = device();
    for (let i = 0; i < 3; i += 1) await a.repo.saveRecord('Note', note(`n${i}`));
    await a.engine.syncNow();
    const b = device();
    await b.engine.syncNow();
    await a.repo.saveRecord('Note', note('new'));
    await a.engine.syncNow();
    const before = server.pullCalls;
    await b.engine.syncNow();
    expect(server.pullCalls - before).toBe(1);
    expect(await notes(b)).toHaveLength(4);
  });
});

describe('transactions and pins', () => {
  it('pins transactions by month and moves them when the date changes', async () => {
    const phone = device();
    const tx = await phone.repo.saveRecord('Transaction', expense(25000, monthsAgo(0)));
    const thisPin = phone.pins.txPin(PROFILE, phone.pins.monthOf(monthsAgo(0)));
    const lastPin = phone.pins.txPin(PROFILE, phone.pins.monthOf(monthsAgo(1)));
    expect(await phone.store.listLive('Transaction', [thisPin])).toHaveLength(1);

    await phone.repo.saveRecord('Transaction', expense(25000, monthsAgo(1), tx.uuid));
    expect(await phone.store.listLive('Transaction', [thisPin])).toHaveLength(0);
    expect(await phone.store.listLive('Transaction', [lastPin])).toEqual([expect.objectContaining({ uuid: tx.uuid })]);
  });

  it('keeps transactions older than the 12-month window off the device', async () => {
    const old = randomUUID();
    server.seed(USER, 'Transaction', {
      ...expense(9900, monthsAgo(24), old),
      uuid: old,
      clientUpdatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    const recent = randomUUID();
    server.seed(USER, 'Transaction', {
      ...expense(9900, monthsAgo(2), recent),
      uuid: recent,
      clientUpdatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    const phone = device();
    await phone.engine.syncNow();
    expect(await phone.store.getLocal('Transaction', recent)).not.toBeNull();
    expect(await phone.store.getLocal('Transaction', old)).toBeNull();
  });

  it('keeps profiles separate by pin', async () => {
    const phone = device();
    const other = '16fd2706-8baf-433b-82eb-8c7fada847da';
    await phone.repo.saveRecord('Note', note('mine'));
    await phone.repo.saveRecord('Note', { ...note('business'), profileUuid: other });
    expect((await phone.store.listLive('Note', [phone.pins.profilePin(PROFILE)])).map((n) => n.body)).toEqual(['mine']);
    expect((await phone.store.listLive('Note', [phone.pins.profilePin(other)])).map((n) => n.body)).toEqual(['business']);
  });
});
