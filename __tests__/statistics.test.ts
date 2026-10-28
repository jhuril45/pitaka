import { saveFeedback } from '@/lib/feedback';
import { categoryBreakdown, lastMonths, monthlyTotals, summaryBreakdown } from '@/lib/statistics';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);
const meta = { profileUuid: 'p', clientUpdatedAt: '', deletedAt: null, serverUpdatedAt: null } as const;

const categories = [
  { ...meta, uuid: 'food', parentUuid: null, name: 'Food', kind: 'expense', icon: 'x', color: '#f00', sortOrder: 0 },
  { ...meta, uuid: 'coffee', parentUuid: 'food', name: 'Coffee', kind: 'expense', icon: 'x', color: '#a00', sortOrder: 1 },
  { ...meta, uuid: 'fun', parentUuid: null, name: 'Fun', kind: 'expense', icon: 'x', color: '#00f', sortOrder: 2 },
] as never[];

let n = 0;
const tx = (amountMinor: number, at: Date, over: Record<string, unknown> = {}) =>
  ({
    ...meta,
    uuid: `t${(n += 1)}`,
    type: 'expense',
    amountMinor,
    accountUuid: 'cash',
    toAccountUuid: null,
    categoryUuid: 'food',
    occurredAt: at.toISOString(),
    note: '',
    merchant: '',
    source: 'manual',
    recurringRuleUuid: null,
    installmentUuid: null,
    ...over,
  }) as never;

describe('categoryBreakdown', () => {
  it('rolls subcategories up to their parent and sorts by amount with shares', () => {
    const rows = [
      tx(10000, d(2026, 11, 2)),
      tx(5000, d(2026, 11, 3), { categoryUuid: 'coffee' }),
      tx(30000, d(2026, 11, 4), { categoryUuid: 'fun' }),
      tx(5000, d(2026, 11, 5), { categoryUuid: null }),
      tx(99999, d(2026, 10, 31)), // outside
      tx(99999, d(2026, 11, 6), { type: 'income' }),
    ];
    const slices = categoryBreakdown(rows, categories, d(2026, 11, 1, 0), d(2026, 12, 1, 0));
    expect(slices.map((s) => [s.name, s.amountMinor, s.shareBps, s.count])).toEqual([
      ['Fun', 30000, 6000, 1],
      ['Food', 15000, 3000, 2],
      ['Uncategorized', 5000, 1000, 1],
    ]);
  });
});

describe('monthlyTotals', () => {
  it('uses transactions for months on the phone and summaries for older ones', () => {
    const months = lastMonths(d(2026, 11, 15), 3);
    expect(months).toEqual(['2026-09', '2026-10', '2026-11']);
    const totals = monthlyTotals(
      months,
      [tx(1000, d(2026, 11, 2)), tx(5000, d(2026, 10, 2), { type: 'income' }), tx(777, d(2026, 9, 2))],
      [
        { month: '2026-09', incomeMinor: 100, expenseMinor: 200 },
        { month: '2026-09', incomeMinor: 0, expenseMinor: 300 },
        { month: '2026-11', incomeMinor: 0, expenseMinor: 999999 },
      ],
      new Set(['2026-10', '2026-11']),
    );
    expect(totals).toEqual([
      { month: '2026-09', incomeMinor: 100, expenseMinor: 500 },
      { month: '2026-10', incomeMinor: 5000, expenseMinor: 0 },
      { month: '2026-11', incomeMinor: 0, expenseMinor: 1000 },
    ]);
  });
});

describe('saveFeedback', () => {
  const NOW = d(2026, 11, 19);
  const budget = (over: Record<string, unknown> = {}) =>
    ({ ...meta, uuid: 'b', categoryUuid: 'food', period: 'monthly', amountMinor: 100000, rollover: false, startDate: d(2026, 1, 1, 0).toISOString(), customDays: null, ...over }) as never;

  it('reports the tightest matching budget, including subcategories', () => {
    const saved = tx(22000, d(2026, 11, 19), { categoryUuid: 'coffee' });
    const transactions = [tx(50000, d(2026, 11, 3)), saved];
    const message = saveFeedback(saved, { budgets: [budget(), budget({ uuid: 'all', categoryUuid: null, amountMinor: 1000000 })], transactions, categories, currency: 'PHP', now: NOW });
    expect(message).toBe("That's 72% of your Food budget, with 12 days left.");
  });

  it('says how far over when over', () => {
    const saved = tx(120000, d(2026, 11, 19));
    expect(saveFeedback(saved, { budgets: [budget()], transactions: [saved], categories, currency: 'PHP', now: NOW })).toBe("You're ₱200.00 over your Food budget.");
  });

  it('otherwise notes the biggest expense of the month, or says nothing', () => {
    const others = [1, 2, 3, 4, 5].map((day) => tx(1000, d(2026, 11, day), { categoryUuid: 'fun' }));
    const big = tx(5000, d(2026, 11, 19), { categoryUuid: 'fun' });
    expect(saveFeedback(big, { budgets: [budget()], transactions: [...others, big], categories, currency: 'PHP', now: NOW })).toBe('Your biggest expense this month.');
    const small = tx(500, d(2026, 11, 19), { categoryUuid: 'fun' });
    expect(saveFeedback(small, { budgets: [], transactions: [...others, small], categories, currency: 'PHP', now: NOW })).toBeNull();
    expect(saveFeedback(tx(500, NOW, { type: 'income' }), { budgets: [budget()], transactions: [], categories, currency: 'PHP', now: NOW })).toBeNull();
  });
});

describe('summaryBreakdown', () => {
  it('rolls synced summaries up the same way', () => {
    const slices = summaryBreakdown(
      [
        { month: '2025-01', categoryUuid: 'coffee', incomeMinor: 0, expenseMinor: 3000, txCount: 3 },
        { month: '2025-01', categoryUuid: 'food', incomeMinor: 0, expenseMinor: 1000, txCount: 1 },
        { month: '2025-01', categoryUuid: null, incomeMinor: 5000, expenseMinor: 0, txCount: 1 },
        { month: '2025-02', categoryUuid: 'fun', incomeMinor: 0, expenseMinor: 9000, txCount: 1 },
      ],
      categories,
      new Set(['2025-01']),
    );
    expect(slices.map((s) => [s.name, s.amountMinor, s.count, s.shareBps])).toEqual([['Food', 4000, 4, 10000]]);
  });
});
