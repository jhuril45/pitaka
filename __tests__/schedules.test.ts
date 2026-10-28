import { debtStatus, installmentCharges, installmentStatus, nextOccurrence, occurrence, occurrencesBetween } from '@/lib/schedules';

import { createDevice, tick, type Device } from './helpers/device';
import { createFakeServer, type FakeServer } from './helpers/fake-server';

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h);
const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];
const rule = (over: Record<string, unknown> = {}) => ({
  frequency: 'monthly' as const,
  interval: 1,
  byMonthDay: null as number | null,
  nextRunAt: d(2026, 1, 31).toISOString(),
  endAt: null as string | null,
  ...over,
});

describe('recurring occurrences', () => {
  it('monthly on the 31st falls on the last day of short months', () => {
    const r = rule({ byMonthDay: 31 });
    expect([0, 1, 2, 3].map((n) => ymd(occurrence(r, n)))).toEqual([
      [2026, 1, 31],
      [2026, 2, 28],
      [2026, 3, 31],
      [2026, 4, 30],
    ]);
  });

  it('weekly every 2 weeks, daily, yearly', () => {
    expect(ymd(occurrence(rule({ frequency: 'weekly', interval: 2, nextRunAt: d(2026, 10, 1).toISOString() }), 2))).toEqual([2026, 10, 29]);
    expect(ymd(occurrence(rule({ frequency: 'daily', interval: 3, nextRunAt: d(2026, 10, 1).toISOString() }), 4))).toEqual([2026, 10, 13]);
    expect(ymd(occurrence(rule({ frequency: 'yearly', nextRunAt: d(2024, 2, 29).toISOString() }), 1))).toEqual([2025, 2, 28]);
  });

  it('lists occurrences in a window and stops at endAt', () => {
    const r = rule({ nextRunAt: d(2026, 1, 15).toISOString(), endAt: d(2026, 4, 1).toISOString() });
    expect(occurrencesBetween(r, d(2026, 2, 1), d(2026, 12, 31)).map(ymd)).toEqual([
      [2026, 2, 15],
      [2026, 3, 15],
    ]);
    expect(ymd(nextOccurrence(rule({ nextRunAt: d(2026, 1, 15).toISOString() }), d(2026, 10, 20))!)).toEqual([2026, 11, 15]);
    expect(nextOccurrence(r, d(2026, 10, 20))).toBeNull();
  });
});

describe('installments', () => {
  const plan = { totalMinor: 1000000, months: 3, startDate: d(2026, 8, 31).toISOString() };

  it('splits the total exactly and keeps the day of month', () => {
    const charges = installmentCharges(plan);
    expect(charges.map((c) => c.amountMinor)).toEqual([333334, 333333, 333333]);
    expect(charges.map((c) => ymd(c.date))).toEqual([
      [2026, 8, 31],
      [2026, 9, 30],
      [2026, 10, 31],
    ]);
  });

  it('reports progress', () => {
    expect(installmentStatus(plan, d(2026, 10, 1))).toMatchObject({ paidMonths: 2, paidMinor: 666667, remainingMinor: 333333, done: false });
    expect(installmentStatus(plan, d(2026, 11, 1))).toMatchObject({ paidMonths: 3, remainingMinor: 0, done: true, next: null });
  });
});

describe('debtStatus', () => {
  const debt = { uuid: 'd', principalMinor: 500000, dueDate: d(2026, 10, 1).toISOString(), settledAt: null as string | null };
  it('subtracts payments, settles at zero and flags overdue', () => {
    const pay = (amountMinor: number, deletedAt: string | null = null) => ({ debtUuid: 'd', amountMinor, deletedAt });
    expect(debtStatus(debt, [pay(200000), pay(999999, 'x')], d(2026, 10, 28))).toEqual({ paidMinor: 200000, remainingMinor: 300000, settled: false, overdue: true });
    expect(debtStatus(debt, [pay(500000)], d(2026, 10, 28))).toMatchObject({ remainingMinor: 0, settled: true, overdue: false });
  });
});

describe('postDueItems (auto-posting on the device)', () => {
  const USER = 'auto';
  let server: FakeServer;
  let devices: Device[];
  const device = () => {
    const x = createDevice(server, USER);
    devices.push(x);
    return x;
  };
  beforeEach(() => {
    server = createFakeServer();
    devices = [];
  });
  afterEach(() => devices.forEach((x) => x.engine.stopSync()));

  async function setup(phone: Device) {
    const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
    const [cash] = await phone.accounts.listAccounts(profileUuid);
    const now = new Date();
    const firstDue = new Date(now.getFullYear(), now.getMonth() - 1, 5);
    return { profileUuid, cash: cash!, now, firstDue };
  }

  it('posts due bills and installment months once, identically on two phones', async () => {
    const a = device();
    const { profileUuid, cash, now, firstDue } = await setup(a);
    await a.obligations.saveRecurringRule({
      profileUuid,
      name: 'Netflix',
      template: { type: 'expense', amountMinor: 54900, accountUuid: cash.uuid, toAccountUuid: null, categoryUuid: null, note: '', merchant: 'Netflix' },
      frequency: 'monthly',
      interval: 1,
      byMonthDay: 5,
      nextRunAt: firstDue.toISOString(),
      endAt: null,
      kind: 'subscription',
      remindDaysBefore: 2,
      autoPost: true,
    });
    await a.obligations.saveInstallment({
      profileUuid,
      name: 'Phone',
      accountUuid: cash.uuid,
      totalMinor: 1200000,
      months: 12,
      startDate: firstDue.toISOString(),
      monthlyMinor: 100000,
      categoryUuid: null,
    });

    const expected = now.getDate() >= 5 ? 2 : 1; // last month's 5th, and this month's if it has passed
    expect(await a.obligations.postDueItems(profileUuid, now)).toBe(expected * 2);
    expect(await a.obligations.postDueItems(profileUuid, now)).toBe(0); // idempotent

    await a.engine.syncNow();
    const b = device();
    await b.engine.syncNow();
    expect(await b.obligations.postDueItems(profileUuid, now)).toBe(0); // b already has them
    await b.engine.syncNow();
    expect(server.rows(USER).filter((r) => r.className === 'Transaction')).toHaveLength(expected * 2);
  });

  it('never overwrites an edit and never recreates a deleted item', async () => {
    const a = device();
    const { profileUuid, cash, now } = await setup(a);
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    await a.obligations.saveRecurringRule({
      profileUuid,
      name: 'Rent',
      template: { type: 'expense', amountMinor: 1500000, accountUuid: cash.uuid, toAccountUuid: null, categoryUuid: null, note: '', merchant: 'Landlord' },
      frequency: 'monthly',
      interval: 1,
      byMonthDay: null,
      nextRunAt: due.toISOString(),
      endAt: null,
      kind: 'bill',
      remindDaysBefore: 0,
      autoPost: true,
    });
    await a.obligations.postDueItems(profileUuid, now);
    const [posted] = await a.transactions.listTransactions(profileUuid);
    await tick();
    await a.transactions.saveTransaction({ ...posted!, amountMinor: 1400000 }); // user corrects it
    await a.engine.syncNow();

    // Another phone that hasn't synced yet posts the same bill offline…
    const b = device();
    b.online = false;
    await b.profiles.ensureDefaultProfile(USER);
    await b.repo.saveRecord('RecurringRule', (await a.obligations.loadObligations(profileUuid)).rules[0]!);
    await b.obligations.postDueItems(profileUuid, now);
    b.online = true;
    await b.engine.syncNow();
    // …but the correction wins everywhere.
    expect((await b.transactions.getTransaction(posted!.uuid))?.amountMinor).toBe(1400000);

    await a.transactions.removeTransaction(posted!.uuid);
    expect(await a.obligations.postDueItems(profileUuid, now)).toBe(0);
  });
});

describe('dueSoon (Home: next 7 days)', () => {
  // Imported lazily: the module pulls in the data layer.
  const { dueSoon } = require('@/features/reminders/upcoming') as typeof import('@/features/reminders/upcoming');
  const now = d(2026, 11, 4, 10);
  const base = { profileUuid: 'p', clientUpdatedAt: '', deletedAt: null, serverUpdatedAt: null } as const;

  it('lists bills, installment charges and open debts (overdue ones too), soonest first', () => {
    const items = dueSoon(
      {
        rules: [{ ...base, uuid: 'r', name: 'Netflix', kind: 'subscription', template: { amountMinor: 54900 }, ...rule({ byMonthDay: 6, nextRunAt: d(2026, 10, 6).toISOString() }) }],
        installments: [{ ...base, uuid: 'i', name: 'Phone', totalMinor: 120000, months: 12, startDate: d(2026, 9, 9).toISOString() }],
        debts: [
          { ...base, uuid: 'late', direction: 'i_owe', counterparty: 'Mark', principalMinor: 5000, dueDate: d(2026, 11, 1).toISOString(), settledAt: null },
          { ...base, uuid: 'far', direction: 'i_owe', counterparty: 'Ana', principalMinor: 5000, dueDate: d(2026, 12, 1).toISOString(), settledAt: null },
        ],
        payments: [],
      } as never,
      now,
    );
    expect(items.map((i) => [i.title, ymd(i.date)])).toEqual([
      ['Pay Mark', [2026, 11, 1]],
      ['Netflix', [2026, 11, 6]],
      ['Phone (3/12)', [2026, 11, 9]],
    ]);
  });
});
