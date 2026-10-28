/**
 * @jest-environment node
 *
 * processRecurring: Manila-day reminder math and the job's de-duplication,
 * with Parse queries and the Expo push call stubbed (no server needed).
 */
import { loadCloud } from './helpers/load-cloud';

const { Parse, jobs, internals } = loadCloud();

/** Midnight of a Manila calendar day, as the phone stores it (UTC+8). */
const manila = (day: string) => new Date(`${day}T00:00:00+08:00`).toISOString();
/** 09:00 Manila on a day — when the daily job runs. */
const runAt = (day: string) => new Date(`${day}T09:00:00+08:00`);

const RULE = {
  uuid: 'rule-1',
  name: 'Meralco',
  kind: 'bill',
  template: { amountMinor: 250000 },
  frequency: 'monthly',
  interval: 1,
  byMonthDay: 5,
  nextRunAt: manila('2026-10-05'),
  endAt: null,
  remindDaysBefore: 1,
};

const empty = { rules: [], installments: [], debts: [], payments: [] };

describe('manilaDay', () => {
  it('uses the Philippine calendar day', () => {
    expect(internals.manilaDay('2026-11-04T15:59:00Z').toISOString().slice(0, 10)).toBe('2026-11-04');
    expect(internals.manilaDay('2026-11-04T16:00:00Z').toISOString().slice(0, 10)).toBe('2026-11-05');
  });
});

describe('remindersFor', () => {
  it('reminds about a monthly bill remindDaysBefore days ahead', () => {
    const out = internals.remindersFor({ ...empty, rules: [RULE] }, runAt('2026-11-04'));
    expect(out).toEqual([{ key: 'rule-1:2026-11-05', title: 'Bill reminder', body: 'Meralco (₱2,500.00) is due tomorrow.' }]);
    expect(internals.remindersFor({ ...empty, rules: [RULE] }, runAt('2026-11-05'))).toEqual([]);
  });

  it('puts day-31 bills on the last day of short months and respects endAt', () => {
    const rule = { ...RULE, byMonthDay: 31, nextRunAt: manila('2026-01-31'), remindDaysBefore: 0 };
    expect(internals.remindersFor({ ...empty, rules: [rule] }, runAt('2026-02-28'))).toHaveLength(1);
    const ended = { ...rule, endAt: manila('2026-02-01') };
    expect(internals.remindersFor({ ...empty, rules: [ended] }, runAt('2026-02-28'))).toEqual([]);
  });

  it('reminds about installments and unpaid debts the day before', () => {
    const data = {
      ...empty,
      installments: [{ uuid: 'inst-1', name: 'Laptop', totalMinor: 1000001, months: 12, startDate: manila('2026-09-05') }],
      debts: [
        { uuid: 'debt-1', direction: 'i_owe', counterparty: 'Mark', principalMinor: 500000, dueDate: manila('2026-11-05'), settledAt: null },
        { uuid: 'debt-2', direction: 'owed_to_me', counterparty: 'Ana', principalMinor: 100000, dueDate: manila('2026-11-05'), settledAt: null },
      ],
      payments: [
        { debtUuid: 'debt-1', amountMinor: 200000 },
        { debtUuid: 'debt-2', amountMinor: 100000 },
      ],
    };
    const out = internals.remindersFor(data, runAt('2026-11-04'));
    expect(out).toEqual([
      { key: 'inst-1:2026-11-05', title: 'Installment tomorrow', body: 'Laptop: ₱833.34 (3 of 12).' },
      { key: 'debt-1:2026-11-05', title: 'Debt due', body: 'You owe Mark ₱3,000.00, due tomorrow.' },
    ]);
  });
});

describe('processRecurring job', () => {
  const owner = new Parse.User();
  owner.id = 'userA000001';
  const token = new Parse.Object('DeviceToken');
  token.set({ owner, expoPushToken: 'ExponentPushToken[abc]' });
  const rule = new Parse.Object('RecurringRule');
  rule.set({ ...RULE, nextRunAt: new Date(RULE.nextRunAt) });

  let logged: string[] = [];
  let pushed: unknown[] = [];

  beforeEach(() => {
    logged = [];
    pushed = [];
    jest.spyOn(Parse.Query.prototype, 'find').mockImplementation(async function (this: any) {
      switch (this.className) {
        case 'DeviceToken':
          return [token];
        case 'RecurringRule':
          return [rule];
        case 'ReminderLog':
          return logged.map((key) => {
            const row = new Parse.Object('ReminderLog');
            row.set('key', key);
            return row;
          });
        default:
          return [];
      }
    } as any);
    jest.spyOn(Parse.Object, 'saveAll').mockImplementation((async (rows: any[]) => {
      rows.filter((r) => r.className === 'ReminderLog').forEach((r) => logged.push(r.get('key')));
      return rows;
    }) as any);
    (Parse.Cloud as any).httpRequest = jest.fn(async (req: { body: unknown[] }) => {
      pushed.push(...req.body);
      return { data: { data: req.body.map(() => ({ status: 'ok' })) } };
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('pushes once per reminder, even when run twice the same day', async () => {
    const now = runAt('2026-11-04').toISOString();
    const first = await jobs.processRecurring!({ params: { now } });
    expect(first).toBe('processRecurring done: 1 users with push, 1 notifications sent');
    expect(pushed).toEqual([
      { to: 'ExponentPushToken[abc]', title: 'Bill reminder', body: 'Meralco (₱2,500.00) is due tomorrow.', sound: 'default', channelId: 'reminders' },
    ]);
    expect(logged).toEqual(['userA000001:rule-1:2026-11-05']);

    await jobs.processRecurring!({ params: { now } });
    expect(pushed).toHaveLength(1);
  });
});
