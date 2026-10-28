import { addDays, addMonths, addWeeks, addYears, format, getDaysInMonth, isAfter, setDate, startOfDay } from 'date-fns';

import type { DebtPaymentRecord, DebtRecord, InstallmentRecord, RecurringRuleRecord } from '@shared/index';

import { allocate, subtract, sum } from './money';

/**
 * Schedules for recurring bills, installments and debts, computed on the
 * device. Generated transactions get stable ids from (rule, date) or
 * (installment, month), so the phone and the server job can both create them
 * without duplicates.
 */

type RuleShape = Pick<RecurringRuleRecord, 'frequency' | 'interval' | 'byMonthDay' | 'nextRunAt' | 'endAt'>;

/** Day key used in generated ids: local calendar date. */
export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

/** Monthly rules on day 29–31 fall on the last day of shorter months. */
function onMonthDay(date: Date, day: number): Date {
  return setDate(date, Math.min(day, getDaysInMonth(date)));
}

/** The n-th occurrence (0 = the rule's first date). */
export function occurrence(rule: RuleShape, n: number): Date {
  const first = startOfDay(new Date(rule.nextRunAt));
  const step = Math.max(1, rule.interval) * n;
  switch (rule.frequency) {
    case 'daily':
      return addDays(first, step);
    case 'weekly':
      return addWeeks(first, step);
    case 'yearly':
      return addYears(first, step);
    case 'monthly': {
      const month = addMonths(setDate(first, 1), step);
      return onMonthDay(month, rule.byMonthDay ?? first.getDate());
    }
  }
}

/** Occurrences with from <= date <= to (inclusive), stopping at endAt. At most `limit`. */
export function occurrencesBetween(rule: RuleShape, from: Date, to: Date, limit = 400): Date[] {
  const out: Date[] = [];
  const end = rule.endAt ? startOfDay(new Date(rule.endAt)) : null;
  const lo = startOfDay(from).getTime();
  const hi = startOfDay(to).getTime();
  for (let n = 0; n < 5000 && out.length < limit; n += 1) {
    const date = occurrence(rule, n);
    if (end && isAfter(date, end)) break;
    if (date.getTime() > hi) break;
    if (date.getTime() >= lo) out.push(date);
  }
  return out;
}

/** The next occurrence on or after `from`, or null when the rule has ended. */
export function nextOccurrence(rule: RuleShape, from = new Date()): Date | null {
  return occurrencesBetween(rule, from, addYears(from, 5), 1)[0] ?? null;
}

export interface InstallmentCharge {
  index: number;
  date: Date;
  amountMinor: number;
}

/** Monthly charges; the total is split exactly (the first months absorb any extra centavo). */
export function installmentCharges(installment: Pick<InstallmentRecord, 'totalMinor' | 'months' | 'startDate'>): InstallmentCharge[] {
  const start = startOfDay(new Date(installment.startDate));
  const amounts = allocate(installment.totalMinor, installment.months);
  return amounts.map((amountMinor, index) => ({ index, date: onMonthDay(addMonths(setDate(start, 1), index), start.getDate()), amountMinor }));
}

export interface InstallmentStatus {
  paidMonths: number;
  paidMinor: number;
  remainingMinor: number;
  next: InstallmentCharge | null;
  done: boolean;
}

export function installmentStatus(installment: Pick<InstallmentRecord, 'totalMinor' | 'months' | 'startDate'>, now = new Date()): InstallmentStatus {
  const charges = installmentCharges(installment);
  const today = startOfDay(now).getTime();
  const paid = charges.filter((c) => c.date.getTime() <= today);
  const paidMinor = sum(paid.map((c) => c.amountMinor));
  return {
    paidMonths: paid.length,
    paidMinor,
    remainingMinor: subtract(installment.totalMinor, paidMinor),
    next: charges.find((c) => c.date.getTime() > today) ?? null,
    done: paid.length === charges.length,
  };
}

export interface DebtStatus {
  paidMinor: number;
  remainingMinor: number;
  settled: boolean;
  overdue: boolean;
}

export function debtStatus(
  debt: Pick<DebtRecord, 'uuid' | 'principalMinor' | 'dueDate' | 'settledAt'>,
  payments: Pick<DebtPaymentRecord, 'debtUuid' | 'amountMinor' | 'deletedAt'>[],
  now = new Date(),
): DebtStatus {
  const paidMinor = sum(payments.filter((p) => p.debtUuid === debt.uuid && !p.deletedAt).map((p) => p.amountMinor));
  const remainingMinor = Math.max(0, subtract(debt.principalMinor, paidMinor));
  const settled = !!debt.settledAt || remainingMinor === 0;
  return {
    paidMinor,
    remainingMinor,
    settled,
    overdue: !settled && !!debt.dueDate && startOfDay(new Date(debt.dueDate)).getTime() < startOfDay(now).getTime(),
  };
}
