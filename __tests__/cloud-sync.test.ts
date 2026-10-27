/**
 * @jest-environment node
 *
 * Pure parts of syncPush / syncPull in cloud/main.js: record conversion, type
 * checks and cursor ordering (no database needed).
 */
import { COMMON_DATE_FIELDS, DATE_FIELDS, USER_DATA_CLASSES } from '@shared/index';

import { loadCloud } from './helpers/load-cloud';

const { Parse, internals, functions } = loadCloud();

const UUID = '3b241101-e2bb-4255-8caf-4136c566a962';
const PROFILE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ACCOUNT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const NOW = '2026-10-27T08:00:00.000Z';

const txRecord = {
  uuid: UUID,
  profileUuid: PROFILE,
  clientUpdatedAt: NOW,
  deletedAt: null,
  serverUpdatedAt: null,
  type: 'expense',
  amountMinor: 25000,
  accountUuid: ACCOUNT,
  toAccountUuid: null,
  categoryUuid: null,
  occurredAt: '2026-10-26T04:30:00.000Z',
  note: 'kape',
  merchant: 'Starbucks',
  source: 'manual',
  recurringRuleUuid: null,
  installmentUuid: null,
};

describe('applyRecord / toRecord', () => {
  it('round-trips a transaction, turning ISO strings into Dates', () => {
    const object = new Parse.Object('Transaction');
    internals.applyRecord('Transaction', object, txRecord);
    expect(object.get('occurredAt')).toBeInstanceOf(Date);
    expect(object.get('clientUpdatedAt')).toBeInstanceOf(Date);
    object.set('serverUpdatedAt', new Date('2026-10-27T08:00:01.000Z'));
    const back = internals.toRecord('Transaction', object);
    expect(back).toEqual({ ...txRecord, serverUpdatedAt: '2026-10-27T08:00:01.000Z' });
    expect(back.owner).toBeUndefined();
  });

  it('never takes owner or serverUpdatedAt from the client', () => {
    const object = new Parse.Object('Transaction');
    internals.applyRecord('Transaction', object, { ...txRecord, owner: 'someone-else', serverUpdatedAt: '2030-01-01T00:00:00.000Z' });
    expect(object.get('owner')).toBeUndefined();
    expect(object.get('serverUpdatedAt')).toBeUndefined();
  });

  it('stores Setting values as JSON and gives them back', () => {
    const object = new Parse.Object('Setting');
    const record = { uuid: UUID, profileUuid: null, clientUpdatedAt: NOW, deletedAt: null, key: 'window', value: { months: 12 } };
    internals.applyRecord('Setting', object, record);
    expect(object.get('valueJson')).toBe('{"months":12}');
    expect(internals.toRecord('Setting', object).value).toEqual({ months: 12 });
  });

  it.each([
    ['amountMinor', 'abc', /amountMinor must be Number/],
    ['amountMinor', Number.POSITIVE_INFINITY, /amountMinor must be Number/],
    ['occurredAt', 'yesterday', /occurredAt must be Date/],
    ['note', 42, /note must be String/],
  ])('rejects a bad %s (%p)', (field, value, message) => {
    const object = new Parse.Object('Transaction');
    expect(() => internals.applyRecord('Transaction', object, { ...txRecord, [field]: value })).toThrow(message);
  });

  it('refuses file references until uploads are supported', () => {
    const object = new Parse.Object('Attachment');
    expect(() =>
      internals.applyRecord('Attachment', object, {
        uuid: UUID,
        profileUuid: PROFILE,
        clientUpdatedAt: NOW,
        transactionUuid: UUID,
        file: { name: 'x.jpg', url: 'https://x/x.jpg' },
        mime: 'image/jpeg',
      }),
    ).toThrow(/uploads are not supported yet/);
  });
});

describe('checkRecordShape', () => {
  it('requires a known class, a uuid and clientUpdatedAt', () => {
    expect(() => internals.checkRecordShape('_User', txRecord)).toThrow(/Unknown class/);
    expect(() => internals.checkRecordShape('Transaction', { ...txRecord, uuid: 'nope' })).toThrow(/uuid/);
    expect(() => internals.checkRecordShape('Transaction', { ...txRecord, clientUpdatedAt: 'later' })).toThrow(/clientUpdatedAt/);
    expect(internals.checkRecordShape('Transaction', txRecord)).toEqual(new Date(NOW));
  });
});

describe('pull cursor', () => {
  it('orders by time, then class index, then objectId', () => {
    const keys = [
      { t: '2026-10-27T08:00:01.000Z', c: 0, id: 'a' },
      { t: '2026-10-27T08:00:00.000Z', c: 3, id: 'b' },
      { t: '2026-10-27T08:00:00.000Z', c: 3, id: 'a' },
      { t: '2026-10-27T08:00:00.000Z', c: 1, id: 'z' },
    ];
    const sorted = [...keys].sort(internals.compareKeys);
    expect(sorted.map((k) => `${k.c}${k.id}`)).toEqual(['1z', '3a', '3b', '0a']);
  });

  it('validates cursors', () => {
    expect(internals.isCursor({ t: NOW, c: 2, id: 'abc' })).toBe(true);
    expect(internals.isCursor({ t: 'nope', c: 2, id: 'abc' })).toBe(false);
    expect(internals.isCursor({ t: NOW, c: '2', id: 'abc' })).toBe(false);
  });

  it('walks every user-data class plus the server-owned ones', () => {
    expect(internals.PULL_CLASSES).toEqual([...USER_DATA_CLASSES, 'MonthlySummary', 'Insight']);
  });
});

describe('Date columns match /shared DATE_FIELDS', () => {
  it.each(USER_DATA_CLASSES)('%s', (className) => {
    const def = internals.classDefinitions().find((d: { className: string }) => d.className === className);
    const dateColumns = Object.entries(def.fields)
      .filter(([, spec]) => (typeof spec === 'string' ? spec : (spec as { type: string }).type) === 'Date')
      .map(([name]) => name)
      .sort();
    expect(dateColumns).toEqual([...COMMON_DATE_FIELDS, ...DATE_FIELDS[className]].sort());
  });
});

describe('function input checks', () => {
  const user = new Parse.User();
  user.id = 'u1';

  it('syncPush requires a user and at most 200 rows', async () => {
    await expect(functions.syncPush!({ params: { changes: [] } })).rejects.toThrow(/sign in/i);
    await expect(functions.syncPush!({ user, params: { changes: new Array(201).fill({}) } })).rejects.toThrow(/at most 200/);
  });

  it('syncPull validates cursor and limit', async () => {
    await expect(functions.syncPull!({ user, params: { cursor: { t: 'x' } } })).rejects.toThrow(/Invalid cursor/);
    await expect(functions.syncPull!({ user, params: { limit: 0 } })).rejects.toThrow(/limit/);
  });
});
