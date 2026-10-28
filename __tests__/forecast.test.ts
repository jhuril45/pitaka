import { averageDailySpend, canAfford, defaultBufferMinor, forecastCashflow, type ForecastInput } from '@/lib/forecast';

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h);
const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];
const NOW = d(2026, 11, 4, 10);
const meta = { profileUuid: 'p', clientUpdatedAt: '', deletedAt: null, serverUpdatedAt: null } as const;

const accounts: ForecastInput['accounts'] = [
  { uuid: 'cash', type: 'cash', currency: 'PHP', archived: false },
  { uuid: 'bank', type: 'bank', currency: 'PHP', archived: false },
  { uuid: 'card', type: 'credit_card', currency: 'PHP', archived: false },
  { uuid: 'usd', type: 'bank', currency: 'USD', archived: false },
];
const balances = new Map([
  ['cash', 500000],
  ['bank', 1500000],
  ['card', -300000],
  ['usd', 99999],
]);

const rule = (over: Record<string, unknown>) =>
  ({
    ...meta,
    uuid: 'r',
    name: 'Rent',
    kind: 'bill',
    template: { type: 'expense', amountMinor: 1200000, accountUuid: 'bank', toAccountUuid: null, categoryUuid: null, note: '', merchant: '' },
    frequency: 'monthly',
    interval: 1,
    byMonthDay: 10,
    nextRunAt: d(2026, 10, 10).toISOString(),
    endAt: null,
    remindDaysBefore: 1,
    autoPost: true,
    ...over,
  }) as never;

const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  accounts,
  balances,
  transactions: [],
  rules: [],
  installments: [],
  debts: [],
  payments: [],
  baseCurrency: 'PHP',
  days: 30,
  now: NOW,
  ...over,
});

describe('averageDailySpend', () => {
  const liquid = new Set(['cash', 'bank']);
  const tx = (amountMinor: number, daysAgo: number, over: Record<string, unknown> = {}) => ({
    type: 'expense' as const,
    amountMinor,
    accountUuid: 'cash',
    occurredAt: d(2026, 11, 4 - daysAgo, 12).toISOString(),
    source: 'manual' as const,
    deletedAt: null,
    ...over,
  });

  it('averages everyday spending over at least 30 days, skipping recurring, card and deleted rows', () => {
    const rows = [
      tx(30000, 1),
      tx(30000, 2),
      tx(999999, 3, { source: 'recurring' }),
      tx(999999, 3, { accountUuid: 'card' }),
      tx(999999, 3, { deletedAt: 'x' }),
      tx(999999, 0), // today: already in the balance
    ];
    expect(averageDailySpend(rows, liquid, NOW)).toBe(2000); // ₱600 over 30 days
    expect(averageDailySpend([tx(90000, 60)], liquid, NOW)).toBe(1500); // 60 days of history
    expect(averageDailySpend([], liquid, NOW)).toBe(0);
  });
});

describe('forecastCashflow', () => {
  it('starts from spendable base-currency money only', () => {
    const f = forecastCashflow(base());
    expect(f.startMinor).toBe(2000000);
    expect(f.points).toHaveLength(31);
    expect(f.endMinor).toBe(2000000);
  });

  it('applies bills, income, installments and debts on their dates, and finds the lowest point', () => {
    const f = forecastCashflow(
      base({
        rules: [
          rule({}),
          rule({ uuid: 's', name: 'Salary', kind: 'income', byMonthDay: 15, nextRunAt: d(2026, 10, 15).toISOString(), template: { type: 'income', amountMinor: 3000000, accountUuid: 'bank', toAccountUuid: null, categoryUuid: null, note: '', merchant: '' } }),
          // Paying the card from the bank is money leaving spendable accounts.
          rule({ uuid: 'c', name: 'Card bill', byMonthDay: 20, nextRunAt: d(2026, 10, 20).toISOString(), template: { type: 'transfer', amountMinor: 300000, accountUuid: 'bank', toAccountUuid: 'card', categoryUuid: null, note: '', merchant: '' } }),
        ],
        installments: [{ ...meta, uuid: 'i', name: 'Phone', accountUuid: 'card', totalMinor: 1200000, months: 12, startDate: d(2026, 10, 7).toISOString(), monthlyMinor: 100000, categoryUuid: null }],
        debts: [
          { ...meta, uuid: 'late', direction: 'i_owe', counterparty: 'Mark', principalMinor: 50000, dueDate: d(2026, 11, 1).toISOString(), settledAt: null, note: '' },
          { ...meta, uuid: 'them', direction: 'owed_to_me', counterparty: 'Ana', principalMinor: 999999, dueDate: d(2026, 11, 8).toISOString(), settledAt: null, note: '' },
        ],
      }) as never,
    );
    expect(f.events.map((e) => [e.title, ymd(e.date), e.amountMinor])).toEqual([
      ['Pay Mark', [2026, 11, 4], -50000],
      ['Phone (2/12)', [2026, 11, 7], -100000],
      ['Rent', [2026, 11, 10], -1200000],
      ['Salary', [2026, 11, 15], 3000000],
      ['Card bill', [2026, 11, 20], -300000],
    ]);
    expect(f.points[0]!.balanceMinor).toBe(1950000);
    expect(f.lowest.balanceMinor).toBe(650000);
    expect(ymd(f.lowest.date)).toEqual([2026, 11, 10]);
    expect(f.endMinor).toBe(3350000);
  });

  it('does not double count an auto-posted item due today, but does count a reminder-only one', () => {
    const today = d(2026, 11, 4).toISOString();
    expect(forecastCashflow(base({ rules: [rule({ nextRunAt: today, byMonthDay: 4 })], days: 20 })).events).toHaveLength(0);
    expect(forecastCashflow(base({ rules: [rule({ nextRunAt: today, byMonthDay: 4, autoPost: false })], days: 20 })).events).toHaveLength(1);
  });

  it('subtracts everyday spending each day after today', () => {
    const transactions = [{ type: 'expense' as const, amountMinor: 300000, accountUuid: 'cash', occurredAt: d(2026, 11, 1).toISOString(), source: 'manual' as const, deletedAt: null }];
    const f = forecastCashflow(base({ transactions, days: 10 }));
    expect(f.dailySpendMinor).toBe(10000);
    expect(f.points[0]!.balanceMinor).toBe(2000000);
    expect(f.endMinor).toBe(2000000 - 10 * 10000);
  });
});

describe('canAfford', () => {
  const f = forecastCashflow(base({ rules: [rule({})] }) as never); // 20,000 → 8,000 on Nov 10
  const buffer = defaultBufferMinor(f);

  it('uses a buffer of two weeks of spending, at least ₱1,000', () => {
    expect(buffer).toBe(100000);
    expect(defaultBufferMinor({ dailySpendMinor: 50000 })).toBe(700000);
  });

  it('checks the lowest balance after paying', () => {
    expect(canAfford(f, 500000, buffer).verdict).toBe('yes'); // lowest 3,000 ≥ 1,000
    expect(canAfford(f, 750000, buffer).verdict).toBe('tight'); // lowest 500
    const no = canAfford(f, 900000, buffer);
    expect(no.verdict).toBe('no');
    expect(no.lowestAfter.balanceMinor).toBe(-100000);
    expect(ymd(no.lowestAfter.date)).toEqual([2026, 11, 10]);
  });

  it('only looks from the purchase date on', () => {
    expect(canAfford(f, 900000, buffer, d(2026, 11, 11)).verdict).toBe('no');
    const later = forecastCashflow(base({ rules: [rule({ byMonthDay: 5, nextRunAt: d(2026, 10, 5).toISOString(), kind: 'income', template: { type: 'income', amountMinor: 1000000, accountUuid: 'bank', toAccountUuid: null, categoryUuid: null, note: '', merchant: '' } })] }) as never);
    // ₱25,000 today is too much, but after the ₱10,000 income tomorrow it's fine.
    expect(canAfford(later, 2500000, 100000).verdict).toBe('no');
    expect(canAfford(later, 2500000, 100000, d(2026, 11, 5)).verdict).toBe('yes');
  });
});
