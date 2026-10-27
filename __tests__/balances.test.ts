import { computeBalances, netWorth, periodTotals, spendingByCategory } from '@/lib/balances';

const tx = (type: 'expense' | 'income' | 'transfer' | 'adjustment', amountMinor: number, accountUuid: string, extra = {}) => ({
  type,
  amountMinor,
  accountUuid,
  toAccountUuid: null as string | null,
  categoryUuid: null as string | null,
  deletedAt: null as string | null,
  ...extra,
});

describe('computeBalances', () => {
  const accounts = [
    { uuid: 'cash', openingBalanceMinor: 100000 },
    { uuid: 'gcash', openingBalanceMinor: 0 },
    { uuid: 'card', openingBalanceMinor: 0 },
  ];

  it('applies every transaction type to the right accounts', () => {
    const balances = computeBalances(accounts, [
      tx('expense', 25000, 'cash'),
      tx('income', 3000000, 'gcash'),
      tx('transfer', 50000, 'gcash', { toAccountUuid: 'cash' }),
      tx('expense', 120000, 'card'),
      tx('adjustment', -500, 'cash'),
      tx('adjustment', 1000, 'gcash'),
    ]);
    expect(balances.get('cash')).toBe(100000 - 25000 + 50000 - 500);
    expect(balances.get('gcash')).toBe(3000000 - 50000 + 1000);
    expect(balances.get('card')).toBe(-120000);
  });

  it('ignores deleted transactions and unknown accounts', () => {
    const balances = computeBalances(accounts, [
      tx('expense', 25000, 'cash', { deletedAt: '2026-10-01T00:00:00Z' }),
      tx('expense', 999, 'archived-or-other-profile'),
    ]);
    expect(balances.get('cash')).toBe(100000);
    expect(balances.has('archived-or-other-profile')).toBe(false);
  });
});

describe('netWorth', () => {
  it('sums base-currency accounts and reports other currencies separately', () => {
    const accounts = [
      { uuid: 'a', currency: 'PHP', archived: false },
      { uuid: 'b', currency: 'PHP', archived: false },
      { uuid: 'c', currency: 'USD', archived: false },
      { uuid: 'd', currency: 'PHP', archived: true },
    ];
    const balances = new Map([
      ['a', 150000],
      ['b', -40000],
      ['c', 2500],
      ['d', 999999],
    ]);
    expect(netWorth(accounts, balances, 'PHP')).toEqual({
      totalMinor: 110000,
      baseCurrency: 'PHP',
      other: [{ currency: 'USD', totalMinor: 2500 }],
    });
  });
});

describe('periodTotals / spendingByCategory', () => {
  const rows = [
    tx('income', 3000000, 'x'),
    tx('expense', 25000, 'x', { categoryUuid: 'coffee' }),
    tx('expense', 15000, 'x', { categoryUuid: 'coffee' }),
    tx('expense', 90000, 'x', { categoryUuid: 'rent' }),
    tx('expense', 500, 'x'),
    tx('transfer', 100000, 'x', { toAccountUuid: 'y' }),
    tx('expense', 77777, 'x', { categoryUuid: 'rent', deletedAt: '2026-01-01T00:00:00Z' }),
  ];

  it('counts income and expense only', () => {
    expect(periodTotals(rows)).toEqual({ incomeMinor: 3000000, expenseMinor: 130500, netMinor: 2869500 });
  });

  it('groups spending by category, biggest first', () => {
    expect(spendingByCategory(rows)).toEqual([
      { categoryUuid: 'rent', totalMinor: 90000 },
      { categoryUuid: 'coffee', totalMinor: 40000 },
      { categoryUuid: null, totalMinor: 500 },
    ]);
  });
});
