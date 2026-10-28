/**
 * @jest-environment node
 *
 * MonthlySummary and Insight logic in cloud/main.js (Parse queries stubbed).
 */
import { loadCloud } from './helpers/load-cloud';

const { Parse, functions, internals } = loadCloud();

const PROFILE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const FOOD = '11111111-1111-4111-8111-111111111111';
const FUN = '22222222-2222-4222-8222-222222222222';
const manila = (iso: string) => new Date(`${iso}+08:00`).toISOString();

const tx = (over: Record<string, unknown>) => ({
  uuid: 'tx',
  type: 'expense',
  amountMinor: 10000,
  accountUuid: 'cash',
  categoryUuid: FOOD,
  occurredAt: manila('2026-11-03T12:00:00'),
  deletedAt: null,
  merchant: '',
  ...over,
});

describe('summaries', () => {
  it('uses Manila month boundaries', () => {
    const { start, end } = internals.monthRange('2026-12');
    expect(start.toISOString()).toBe('2026-11-30T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T16:00:00.000Z');
  });

  it('buckets by account and category; transfers only count', () => {
    const buckets = internals.summarize([
      tx({}),
      tx({ amountMinor: 5000 }),
      tx({ type: 'income', amountMinor: 300000, categoryUuid: null }),
      tx({ type: 'transfer', amountMinor: 99999, categoryUuid: FOOD }),
      tx({ deletedAt: 'x', amountMinor: 77777 }),
      tx({ accountUuid: 'bank', amountMinor: 2500 }),
    ]);
    expect(buckets).toEqual([
      { accountUuid: 'cash', categoryUuid: FOOD, incomeMinor: 0, expenseMinor: 15000, txCount: 2 },
      { accountUuid: 'cash', categoryUuid: null, incomeMinor: 300000, expenseMinor: 0, txCount: 2 },
      { accountUuid: 'bank', categoryUuid: FOOD, incomeMinor: 0, expenseMinor: 2500, txCount: 1 },
    ]);
  });

  it('gives each bucket a stable uuid', () => {
    const a = internals.seededUuid('summary:u:p:2026-11:cash:-');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(internals.seededUuid('summary:u:p:2026-11:cash:-')).toBe(a);
    expect(internals.seededUuid('summary:u:p:2026-12:cash:-')).not.toBe(a);
  });
});

describe('getStatistics', () => {
  const user = new Parse.User();
  user.id = 'userA000001';
  afterEach(() => jest.restoreAllMocks());

  it('validates its input', async () => {
    await expect(functions.getStatistics!({ user, params: { profileUuid: 'x', fromMonth: '2026-01', toMonth: '2026-02' } })).rejects.toThrow(/uuid/);
    await expect(functions.getStatistics!({ user, params: { profileUuid: PROFILE, fromMonth: '2026-13', toMonth: '2026-02' } })).rejects.toThrow(/YYYY-MM/);
    await expect(functions.getStatistics!({ user, params: { profileUuid: PROFILE, fromMonth: '2026-03', toMonth: '2026-02' } })).rejects.toThrow(/after/);
  });

  it('adds up summaries per month and category', async () => {
    const row = (month: string, categoryUuid: string | null, expenseMinor: number, incomeMinor = 0) => {
      const o = new Parse.Object('MonthlySummary');
      o.set({ month, categoryUuid, expenseMinor, incomeMinor, txCount: 1 });
      return o;
    };
    jest.spyOn(Parse.Query.prototype, 'find').mockResolvedValue([row('2026-10', FOOD, 1000), row('2026-11', FOOD, 500), row('2026-11', FUN, 2000), row('2026-11', null, 0, 9000)] as never);
    const stats = await functions.getStatistics!({ user, params: { profileUuid: PROFILE, fromMonth: '2026-10', toMonth: '2026-11' } });
    expect(stats).toEqual({
      months: [
        { month: '2026-10', incomeMinor: 0, expenseMinor: 1000, txCount: 1 },
        { month: '2026-11', incomeMinor: 9000, expenseMinor: 2500, txCount: 3 },
      ],
      categories: [
        { categoryUuid: FUN, incomeMinor: 0, expenseMinor: 2000, txCount: 1 },
        { categoryUuid: FOOD, incomeMinor: 0, expenseMinor: 1500, txCount: 2 },
        { categoryUuid: null, incomeMinor: 9000, expenseMinor: 0, txCount: 1 },
      ],
      totals: { incomeMinor: 9000, expenseMinor: 3500, txCount: 4 },
    });
  });
});

describe('computeInsights', () => {
  // Job runs Monday Nov 9; "last week" is Mon Nov 2 – Sun Nov 8 (Manila).
  const NOW = new Date(manila('2026-11-09T08:30:00'));
  const names = { [FOOD]: 'Food', [FUN]: 'Fun' };
  const usualWeeks = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'].flatMap((day, i) => [
    tx({ uuid: `f${i}a`, occurredAt: manila(`${day}T12:00:00`), amountMinor: 100000 }),
    tx({ uuid: `f${i}b`, occurredAt: manila(`${day}T13:00:00`), amountMinor: 100000 }),
    tx({ uuid: `g${i}`, categoryUuid: FUN, occurredAt: manila(`${day}T14:00:00`), amountMinor: 50000 }),
  ]);

  it('summarises the week against the usual and flags a jump and an unusual expense', () => {
    const lastWeek = [
      tx({ uuid: 'w1', occurredAt: manila('2026-11-02T12:00:00'), amountMinor: 200000 }),
      tx({ uuid: 'big', categoryUuid: FUN, merchant: 'Concert', occurredAt: manila('2026-11-08T23:30:00'), amountMinor: 300000 }),
      // Monday 00:10 belongs to this week, not last week.
      tx({ uuid: 'next', occurredAt: manila('2026-11-09T00:10:00'), amountMinor: 999999 }),
    ];
    const out = internals.computeInsights([...usualWeeks, ...lastWeek], names, NOW);
    expect(out.map((i: { kind: string; message: string }) => [i.kind, i.message])).toEqual([
      ['weekly_summary', 'Last week you spent ₱5,000.00, 100% more than your usual ₱2,500.00.'],
      ['category_change', 'Fun spending was up 500% last week (₱3,000.00 vs. your usual ₱500.00).'],
      ['unusual_transaction', '₱3,000.00 at Concert was much more than your usual Fun expense (₱500.00).'],
    ]);
    expect(out[0].periodStart).toBe(manila('2026-11-02T00:00:00'));
  });

  it('says "about your usual" for small changes and stays quiet without history', () => {
    const lastWeek = [tx({ occurredAt: manila('2026-11-03T12:00:00'), amountMinor: 250000 })];
    expect(internals.computeInsights([...usualWeeks, ...lastWeek], names, NOW).map((i: { message: string }) => i.message)).toEqual([
      'Last week you spent ₱2,500.00, about your usual.',
    ]);
    expect(internals.computeInsights(lastWeek, names, NOW)).toEqual([]);
  });
});

describe('dictionaryFromVotes (opt-in merchant dictionary)', () => {
  it('needs three users per merchant and reports the majority with its share', () => {
    const rows = internals.dictionaryFromVotes({
      jollibee: { a: 'food.dining', b: 'food.dining', c: 'food.groceries' },
      meralco: { a: 'bills.electricity', b: 'bills.electricity' },
    });
    expect(rows).toEqual([{ merchantNormalized: 'jollibee', suggestedCategoryKey: 'food.dining', confidenceBps: 6666 }]);
  });
});

describe('getTransactionsPage', () => {
  const user = new Parse.User();
  user.id = 'userA000001';
  afterEach(() => jest.restoreAllMocks());

  it('validates input', async () => {
    await expect(functions.getTransactionsPage!({ user, params: { profileUuid: 'nope' } })).rejects.toThrow(/uuid/);
    await expect(functions.getTransactionsPage!({ user, params: { profileUuid: PROFILE, before: 'yesterday' } })).rejects.toThrow(/ISO/);
  });

  it('returns a page and a cursor when there is more', async () => {
    const row = (uuid: string, iso: string) => {
      const o = new Parse.Object('Transaction');
      o.set({ uuid, occurredAt: new Date(iso), amountMinor: 100, type: 'expense', profileUuid: PROFILE });
      return o;
    };
    jest.spyOn(Parse.Query.prototype, 'find').mockResolvedValue([row(FOOD, '2025-01-03T00:00:00Z'), row(FUN, '2025-01-02T00:00:00Z')] as never);
    const page = (await functions.getTransactionsPage!({ user, params: { profileUuid: PROFILE, limit: 1 } })) as { transactions: { uuid: string }[]; next: unknown };
    expect(page.transactions.map((t: { uuid: string }) => t.uuid)).toEqual([FOOD]);
    expect(page.next).toEqual({ before: '2025-01-03T00:00:00.000Z', beforeUuid: FOOD });
  });
});
