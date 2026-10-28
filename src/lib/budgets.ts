import { addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths, startOfDay } from 'date-fns';

import type { BudgetRecord, CategoryRecord, GoalContributionRecord, GoalRecord, TransactionRecord } from '@shared/index';

import { add, ratioBps, subtract, sum } from './money';

/**
 * Budget and goal math, computed on the device (works offline). Money is
 * integer minor units; percentages are basis points (10000 = 100%).
 */

export interface Period {
  start: Date;
  /** Exclusive. */
  end: Date;
}

type BudgetShape = Pick<BudgetRecord, 'period' | 'startDate' | 'customDays'>;

/** Monthly periods keep the start date's day of month (clamped in short months). */
function monthStart(anchor: Date, months: number): Date {
  const shifted = addMonths(startOfDay(anchor), months);
  return shifted;
}

/** The budget period containing `at` (or the first period, if `at` is before the start). */
export function periodAt(budget: BudgetShape, at: Date): Period {
  const anchor = startOfDay(new Date(budget.startDate));
  const day = startOfDay(at);
  if (budget.period === 'monthly') {
    let index = Math.max(0, differenceInCalendarMonths(day, anchor));
    if (monthStart(anchor, index) > day && index > 0) index -= 1;
    return { start: monthStart(anchor, index), end: monthStart(anchor, index + 1) };
  }
  const length = budget.period === 'weekly' ? 7 : Math.max(1, budget.customDays ?? 30);
  const index = Math.max(0, Math.floor(differenceInCalendarDays(day, anchor) / length));
  const start = addDays(anchor, index * length);
  return { start, end: addDays(start, length) };
}

/** The period before `period`, or null when it would start before the budget did. */
export function previousPeriod(budget: BudgetShape, period: Period): Period | null {
  const anchor = startOfDay(new Date(budget.startDate));
  if (period.start <= anchor) return null;
  return periodAt(budget, addDays(period.start, -1));
}

/** Category uuids a budget covers: the category and its subcategories. Null = every expense. */
export function coveredCategories(categoryUuid: string | null, categories: Pick<CategoryRecord, 'uuid' | 'parentUuid'>[]): Set<string> | null {
  if (!categoryUuid) return null;
  const set = new Set([categoryUuid]);
  for (const c of categories) if (c.parentUuid === categoryUuid) set.add(c.uuid);
  return set;
}

type TxShape = Pick<TransactionRecord, 'type' | 'amountMinor' | 'categoryUuid' | 'occurredAt' | 'deletedAt'>;

export function spentIn(period: Period, covered: Set<string> | null, transactions: TxShape[]): number {
  const from = period.start.getTime();
  const to = period.end.getTime();
  let total = 0;
  for (const tx of transactions) {
    // Cheap checks first; the date parse is the costly one.
    if (tx.deletedAt || tx.type !== 'expense') continue;
    if (covered && (tx.categoryUuid === null || !covered.has(tx.categoryUuid))) continue;
    const t = Date.parse(tx.occurredAt);
    if (t >= from && t < to) total = add(total, tx.amountMinor);
  }
  return total;
}

export type BudgetState = 'on-track' | 'warning' | 'over';

export interface BudgetStatus {
  period: Period;
  spentMinor: number;
  /** Leftover (or overspend, negative) carried in from earlier periods when rollover is on. */
  carryMinor: number;
  /** amount + carry: what can be spent this period. */
  limitMinor: number;
  remainingMinor: number;
  /** spent / limit in basis points. */
  usedBps: number;
  state: BudgetState;
  daysLeft: number;
  /** How far through the period we are, in basis points (for "on pace" hints). */
  elapsedBps: number;
}

export const WARNING_BPS = 8000;

/**
 * Status of a budget now. With rollover, each earlier period's leftover (or
 * overspend) is carried forward, going back at most `maxPeriods` periods (the
 * device only holds about a year of transactions).
 */
export function budgetStatus(
  budget: Pick<BudgetRecord, 'period' | 'startDate' | 'customDays' | 'amountMinor' | 'rollover' | 'categoryUuid'>,
  transactions: TxShape[],
  categories: Pick<CategoryRecord, 'uuid' | 'parentUuid'>[],
  now = new Date(),
  maxPeriods = 60,
): BudgetStatus {
  const covered = coveredCategories(budget.categoryUuid, categories);
  const period = periodAt(budget, now);
  // Rollover walks many periods: narrow to this budget's expenses once.
  const relevant = transactions.filter(
    (tx) => !tx.deletedAt && tx.type === 'expense' && (!covered || (tx.categoryUuid !== null && covered.has(tx.categoryUuid))),
  );

  let carryMinor = 0;
  if (budget.rollover) {
    const earlier: Period[] = [];
    let p = previousPeriod(budget, period);
    while (p && earlier.length < maxPeriods) {
      earlier.unshift(p);
      p = previousPeriod(budget, p);
    }
    for (const past of earlier) {
      carryMinor = add(carryMinor, subtract(budget.amountMinor, spentIn(past, covered, relevant)));
    }
  }

  const spentMinor = spentIn(period, covered, relevant);
  const limitMinor = add(budget.amountMinor, carryMinor);
  const usedBps = limitMinor > 0 ? ratioBps(spentMinor, limitMinor) : spentMinor > 0 ? 10001 : 0;
  const totalDays = Math.max(1, differenceInCalendarDays(period.end, period.start));
  const elapsedDays = Math.min(totalDays, Math.max(0, differenceInCalendarDays(startOfDay(now), period.start) + 1));

  return {
    period,
    spentMinor,
    carryMinor,
    limitMinor,
    remainingMinor: subtract(limitMinor, spentMinor),
    usedBps,
    // "Over" compares exact centavos: a percentage rounds 100.0001% down to 100%.
    state: spentMinor > limitMinor ? 'over' : usedBps >= WARNING_BPS ? 'warning' : 'on-track',
    daysLeft: Math.max(0, differenceInCalendarDays(period.end, startOfDay(now))),
    elapsedBps: Math.round((elapsedDays * 10000) / totalDays),
  };
}

export interface GoalStatus {
  savedMinor: number;
  remainingMinor: number;
  progressBps: number;
  reached: boolean;
  /** Months until the target date (null without one); 0 once it has passed. */
  monthsLeft: number | null;
  /** What to set aside each month to reach the target on time (null without a date). */
  perMonthMinor: number | null;
}

/**
 * Goal progress: contributions (withdrawals are negative), or the linked
 * account's balance when the goal follows an account.
 */
export function goalStatus(
  goal: Pick<GoalRecord, 'uuid' | 'targetMinor' | 'targetDate' | 'linkedAccountUuid'>,
  contributions: Pick<GoalContributionRecord, 'goalUuid' | 'amountMinor' | 'deletedAt'>[],
  accountBalances?: Map<string, number>,
  now = new Date(),
): GoalStatus {
  const linked = goal.linkedAccountUuid ? accountBalances?.get(goal.linkedAccountUuid) : undefined;
  const savedMinor =
    linked !== undefined
      ? Math.max(0, linked)
      : sum(contributions.filter((c) => c.goalUuid === goal.uuid && !c.deletedAt).map((c) => c.amountMinor));
  const remainingMinor = Math.max(0, subtract(goal.targetMinor, savedMinor));
  let monthsLeft: number | null = null;
  let perMonthMinor: number | null = null;
  if (goal.targetDate) {
    monthsLeft = Math.max(0, differenceInCalendarMonths(new Date(goal.targetDate), now));
    // Round up to whole centavos so the plan always reaches the target.
    perMonthMinor = remainingMinor === 0 ? 0 : monthsLeft === 0 ? remainingMinor : Math.ceil(remainingMinor / monthsLeft);
  }
  return {
    savedMinor,
    remainingMinor,
    progressBps: Math.min(10000, Math.max(0, ratioBps(savedMinor, goal.targetMinor))),
    reached: savedMinor >= goal.targetMinor,
    monthsLeft,
    perMonthMinor,
  };
}
