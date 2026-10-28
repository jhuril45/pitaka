import type { CategoryRecord, MonthlySummaryRecord, TransactionRecord } from '@shared/index';

import { add, ratioBps, sum } from './money';

/**
 * Statistics, computed on the device: from local transactions for the months
 * the phone keeps (12), and from synced MonthlySummary rows for older months.
 */

type TxShape = Pick<TransactionRecord, 'type' | 'amountMinor' | 'categoryUuid' | 'occurredAt' | 'deletedAt'>;

export interface CategorySlice {
  /** Top-level category, or null for "Uncategorized". */
  categoryUuid: string | null;
  name: string;
  color: string;
  amountMinor: number;
  shareBps: number;
  count: number;
}

const UNCATEGORIZED_COLOR = '#94A3B8';

/** Amounts rolled up to top-level categories, biggest first, with shares of the total. */
function rollUp(
  items: { categoryUuid: string | null; amountMinor: number; count: number }[],
  categories: Pick<CategoryRecord, 'uuid' | 'parentUuid' | 'name' | 'color'>[],
): CategorySlice[] {
  const byUuid = new Map(categories.map((c) => [c.uuid, c]));
  const topOf = (uuid: string | null) => {
    let current = uuid ? byUuid.get(uuid) : undefined;
    while (current?.parentUuid && byUuid.has(current.parentUuid)) current = byUuid.get(current.parentUuid);
    return current ?? null;
  };
  const slices = new Map<string, CategorySlice>();
  for (const item of items) {
    if (!item.amountMinor) continue;
    const top = topOf(item.categoryUuid);
    const key = top?.uuid ?? '';
    const slice = slices.get(key) ?? { categoryUuid: top?.uuid ?? null, name: top?.name ?? 'Uncategorized', color: top?.color ?? UNCATEGORIZED_COLOR, amountMinor: 0, shareBps: 0, count: 0 };
    slice.amountMinor = add(slice.amountMinor, item.amountMinor);
    slice.count += item.count;
    slices.set(key, slice);
  }
  const list = [...slices.values()].sort((a, b) => b.amountMinor - a.amountMinor);
  const total = sum(list.map((s) => s.amountMinor));
  return list.map((s) => ({ ...s, shareBps: ratioBps(s.amountMinor, total) }));
}

/** Spending (or income) in [from, to), rolled up to top-level categories, biggest first. */
export function categoryBreakdown(
  transactions: TxShape[],
  categories: Pick<CategoryRecord, 'uuid' | 'parentUuid' | 'name' | 'color'>[],
  from: Date,
  to: Date,
  type: 'expense' | 'income' = 'expense',
): CategorySlice[] {
  const items = transactions
    .filter((tx) => !tx.deletedAt && tx.type === type && new Date(tx.occurredAt) >= from && new Date(tx.occurredAt) < to)
    .map((tx) => ({ categoryUuid: tx.categoryUuid, amountMinor: tx.amountMinor, count: 1 }));
  return rollUp(items, categories);
}

/** The same breakdown from synced monthly summaries (months older than the phone keeps). */
export function summaryBreakdown(
  summaries: Pick<MonthlySummaryRecord, 'month' | 'categoryUuid' | 'incomeMinor' | 'expenseMinor' | 'txCount'>[],
  categories: Pick<CategoryRecord, 'uuid' | 'parentUuid' | 'name' | 'color'>[],
  months: Set<string>,
  type: 'expense' | 'income' = 'expense',
): CategorySlice[] {
  const items = summaries
    .filter((s) => months.has(s.month))
    .map((s) => ({ categoryUuid: s.categoryUuid, amountMinor: type === 'expense' ? s.expenseMinor : s.incomeMinor, count: s.txCount }));
  return rollUp(items, categories);
}

export interface MonthTotals {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
}

/** "YYYY-MM" in local time. */
export const monthKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** Months from `count - 1` months before `end` through `end`, oldest first. */
export function lastMonths(end: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => monthKeyOf(new Date(end.getFullYear(), end.getMonth() - (count - 1 - i), 1)));
}

/**
 * Income and spending per month. Months covered by the phone's transactions
 * (`localMonths`) are counted from them; older ones come from summaries.
 */
export function monthlyTotals(
  months: string[],
  transactions: Pick<TransactionRecord, 'type' | 'amountMinor' | 'occurredAt' | 'deletedAt'>[],
  summaries: Pick<MonthlySummaryRecord, 'month' | 'incomeMinor' | 'expenseMinor'>[],
  localMonths: Set<string>,
): MonthTotals[] {
  const totals = new Map(months.map((month) => [month, { month, incomeMinor: 0, expenseMinor: 0 }]));
  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    const t = totals.get(monthKeyOf(new Date(tx.occurredAt)));
    if (!t || !localMonths.has(t.month)) continue;
    if (tx.type === 'income') t.incomeMinor = add(t.incomeMinor, tx.amountMinor);
    if (tx.type === 'expense') t.expenseMinor = add(t.expenseMinor, tx.amountMinor);
  }
  for (const s of summaries) {
    const t = totals.get(s.month);
    if (!t || localMonths.has(t.month)) continue;
    t.incomeMinor = add(t.incomeMinor, s.incomeMinor);
    t.expenseMinor = add(t.expenseMinor, s.expenseMinor);
  }
  return [...totals.values()];
}
