import { budgetStatus, coveredCategories, goalStatus, periodAt, previousPeriod } from '@/lib/budgets';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);
const iso = (date: Date) => date.toISOString();
const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

const categories = [
  { uuid: 'food', parentUuid: null },
  { uuid: 'coffee', parentUuid: 'food' },
  { uuid: 'dining', parentUuid: 'food' },
  { uuid: 'rent', parentUuid: null },
];
const spend = (amountMinor: number, when: Date, categoryUuid: string | null = 'coffee', extra = {}) => ({
  type: 'expense' as const,
  amountMinor,
  categoryUuid,
  occurredAt: iso(when),
  deletedAt: null as string | null,
  ...extra,
});

describe('periods', () => {
  it('monthly periods follow the start day', () => {
    const b = { period: 'monthly' as const, startDate: iso(d(2026, 1, 15)), customDays: null };
    const p = periodAt(b, d(2026, 10, 28));
    expect([ymd(p.start), ymd(p.end)]).toEqual([
      [2026, 10, 15],
      [2026, 11, 15],
    ]);
    const before = periodAt(b, d(2026, 10, 10));
    expect(ymd(before.start)).toEqual([2026, 9, 15]);
    expect(ymd(previousPeriod(b, p)!.start)).toEqual([2026, 9, 15]);
  });

  it('weekly and custom periods step from the start date', () => {
    const weekly = { period: 'weekly' as const, startDate: iso(d(2026, 10, 5)), customDays: null };
    expect(ymd(periodAt(weekly, d(2026, 10, 28)).start)).toEqual([2026, 10, 26]);
    const custom = { period: 'custom' as const, startDate: iso(d(2026, 10, 1)), customDays: 10 };
    expect(ymd(periodAt(custom, d(2026, 10, 28)).start)).toEqual([2026, 10, 21]);
    expect(previousPeriod(custom, periodAt(custom, d(2026, 10, 3)))).toBeNull();
  });
});

describe('budgetStatus', () => {
  const NOW = d(2026, 10, 19);
  const food = { period: 'monthly' as const, startDate: iso(d(2026, 10, 1)), customDays: null, amountMinor: 1000000, rollover: false, categoryUuid: 'food' };

  it('rolls subcategories up into the parent budget and ignores other spending', () => {
    const s = budgetStatus(
      food,
      [spend(300000, d(2026, 10, 3)), spend(420000, d(2026, 10, 10), 'dining'), spend(900000, d(2026, 10, 2), 'rent'), spend(50000, d(2026, 9, 30))],
      categories,
      NOW,
    );
    expect(s).toMatchObject({ spentMinor: 720000, limitMinor: 1000000, remainingMinor: 280000, usedBps: 7200, state: 'on-track', daysLeft: 13 });
  });

  it('flags ≥80% as a warning and >100% as over', () => {
    expect(budgetStatus(food, [spend(800000, d(2026, 10, 3))], categories, NOW).state).toBe('warning');
    expect(budgetStatus(food, [spend(1000001, d(2026, 10, 3))], categories, NOW).state).toBe('over');
  });

  it('ignores deleted transactions, income and transfers', () => {
    const s = budgetStatus(
      food,
      [spend(500000, d(2026, 10, 3), 'coffee', { deletedAt: iso(NOW) }), spend(500000, d(2026, 10, 3), 'coffee', { type: 'income' })],
      categories,
      NOW,
    );
    expect(s.spentMinor).toBe(0);
  });

  it('an overall budget counts every expense', () => {
    const overall = { ...food, categoryUuid: null };
    expect(budgetStatus(overall, [spend(100, d(2026, 10, 3), 'rent'), spend(200, d(2026, 10, 4), null)], categories, NOW).spentMinor).toBe(300);
  });

  it('rollover carries leftovers and overspend forward', () => {
    const rolling = { ...food, startDate: iso(d(2026, 8, 1)), rollover: true };
    const s = budgetStatus(
      rolling,
      [
        spend(600000, d(2026, 8, 10)), // Aug: 4,000 left
        spend(1200000, d(2026, 9, 10)), // Sep: 2,000 over
        spend(500000, d(2026, 10, 5)),
      ],
      categories,
      NOW,
    );
    expect(s.carryMinor).toBe(400000 - 200000);
    expect(s.limitMinor).toBe(1200000);
    expect(s.remainingMinor).toBe(700000);
  });

  it('reports pace through the period', () => {
    expect(budgetStatus(food, [], categories, d(2026, 10, 16)).elapsedBps).toBe(Math.round((16 * 10000) / 31));
  });
});

describe('goalStatus', () => {
  const NOW = d(2026, 10, 28);
  const goal = { uuid: 'g1', targetMinor: 6000000, targetDate: iso(d(2027, 4, 28)), linkedAccountUuid: null };

  it('sums contributions minus withdrawals and plans the monthly amount', () => {
    const s = goalStatus(
      goal,
      [
        { goalUuid: 'g1', amountMinor: 2000000, deletedAt: null },
        { goalUuid: 'g1', amountMinor: -500000, deletedAt: null },
        { goalUuid: 'g1', amountMinor: 999999, deletedAt: iso(NOW) },
        { goalUuid: 'other', amountMinor: 999999, deletedAt: null },
      ],
      undefined,
      NOW,
    );
    expect(s).toMatchObject({ savedMinor: 1500000, remainingMinor: 4500000, progressBps: 2500, reached: false, monthsLeft: 6, perMonthMinor: 750000 });
  });

  it('rounds the monthly amount up so the target is always reached', () => {
    const s = goalStatus({ ...goal, targetMinor: 1000000 }, [], undefined, NOW);
    expect(s.perMonthMinor).toBe(166667);
  });

  it('follows a linked account balance and caps progress at 100%', () => {
    const s = goalStatus({ ...goal, linkedAccountUuid: 'savings' }, [], new Map([['savings', 7000000]]), NOW);
    expect(s).toMatchObject({ savedMinor: 7000000, remainingMinor: 0, progressBps: 10000, reached: true, perMonthMinor: 0 });
  });

  it('handles goals without a date and overdue goals', () => {
    expect(goalStatus({ ...goal, targetDate: null }, [], undefined, NOW)).toMatchObject({ monthsLeft: null, perMonthMinor: null });
    expect(goalStatus({ ...goal, targetDate: iso(d(2026, 1, 1)) }, [], undefined, NOW)).toMatchObject({ monthsLeft: 0, perMonthMinor: 6000000 });
  });
});

describe('coveredCategories', () => {
  it('includes children; null means everything', () => {
    expect([...coveredCategories('food', categories)!].sort()).toEqual(['coffee', 'dining', 'food']);
    expect(coveredCategories(null, categories)).toBeNull();
  });
});
