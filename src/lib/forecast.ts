import { addDays, differenceInCalendarDays, isAfter, startOfDay, subDays } from 'date-fns';

import type { AccountRecord, DebtPaymentRecord, DebtRecord, InstallmentRecord, RecurringRuleRecord, TransactionRecord } from '@shared/index';

import { add, subtract, sum } from './money';
import { debtStatus, installmentCharges, occurrencesBetween } from './schedules';

/**
 * Cashflow forecast, computed on the device.
 *
 * Starts from today's spendable money (cash, bank and e-wallet accounts in the
 * base currency) and walks forward day by day:
 *   - recurring bills, subscriptions and income on their dates
 *   - installment charges (counted when charged, even on a card: a cautious view)
 *   - debts you owe, on their due date (overdue ones today); money owed to you
 *     is not counted, since it may not arrive
 *   - everyday spending: the average daily spending of the last 90 days that
 *     wasn't a recurring or installment charge
 */

export const LIQUID_TYPES: readonly AccountRecord['type'][] = ['cash', 'bank', 'ewallet'];
const HISTORY_DAYS = 90;
/** Use at least this many days of history, so a new user's first big purchase isn't "daily". */
const MIN_HISTORY_DAYS = 30;

export interface ForecastEvent {
  date: Date;
  title: string;
  /** Signed: + money in, − money out. */
  amountMinor: number;
  kind: 'recurring' | 'installment' | 'debt';
}

export interface ForecastPoint {
  date: Date;
  balanceMinor: number;
}

export interface Forecast {
  startMinor: number;
  dailySpendMinor: number;
  events: ForecastEvent[];
  /** One point per day, today first (after today's known items). */
  points: ForecastPoint[];
  lowest: ForecastPoint;
  endMinor: number;
}

export interface ForecastInput {
  accounts: Pick<AccountRecord, 'uuid' | 'type' | 'currency' | 'archived'>[];
  balances: Map<string, number>;
  transactions: Pick<TransactionRecord, 'type' | 'amountMinor' | 'accountUuid' | 'occurredAt' | 'source' | 'deletedAt'>[];
  rules: RecurringRuleRecord[];
  installments: InstallmentRecord[];
  debts: DebtRecord[];
  payments: DebtPaymentRecord[];
  baseCurrency: string;
  days: number;
  now?: Date;
}

/** Average daily everyday spending from liquid accounts over the last 90 days. */
export function averageDailySpend(
  transactions: ForecastInput['transactions'],
  liquid: Set<string>,
  now = new Date(),
): number {
  const today = startOfDay(now);
  const since = subDays(today, HISTORY_DAYS);
  const spent = transactions.filter(
    (t) =>
      !t.deletedAt &&
      t.type === 'expense' &&
      t.source !== 'recurring' &&
      !!t.accountUuid &&
      liquid.has(t.accountUuid) &&
      new Date(t.occurredAt) >= since &&
      new Date(t.occurredAt) < today,
  );
  if (!spent.length) return 0;
  const first = spent.reduce((min, t) => (new Date(t.occurredAt) < min ? new Date(t.occurredAt) : min), today);
  const days = Math.max(MIN_HISTORY_DAYS, Math.min(HISTORY_DAYS, differenceInCalendarDays(today, first)));
  return Math.round(sum(spent.map((t) => t.amountMinor)) / days);
}

export function forecastCashflow(input: ForecastInput): Forecast {
  const now = input.now ?? new Date();
  const today = startOfDay(now);
  const end = addDays(today, input.days);
  const liquidAccounts = input.accounts.filter((a) => !a.archived && a.currency === input.baseCurrency && LIQUID_TYPES.includes(a.type));
  const liquid = new Set(liquidAccounts.map((a) => a.uuid));
  const startMinor = sum(liquidAccounts.map((a) => input.balances.get(a.uuid) ?? 0));
  const dailySpendMinor = averageDailySpend(input.transactions, liquid, now);

  const events: ForecastEvent[] = [];
  for (const rule of input.rules) {
    const t = rule.template;
    const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : t.type === 'transfer' ? transferSign(t.accountUuid, t.toAccountUuid, liquid) : 0;
    if (sign === 0) continue;
    // Auto-posted items due today are already recorded (and in today's balance).
    const from = rule.autoPost ? addDays(today, 1) : today;
    for (const date of occurrencesBetween(rule, from, end)) {
      events.push({ date, title: rule.name, amountMinor: sign * t.amountMinor, kind: 'recurring' });
    }
  }
  for (const inst of input.installments) {
    for (const charge of installmentCharges(inst)) {
      // Charges up to today are posted automatically.
      if (!isAfter(charge.date, today) || isAfter(charge.date, end)) continue;
      events.push({ date: charge.date, title: `${inst.name} (${charge.index + 1}/${inst.months})`, amountMinor: -charge.amountMinor, kind: 'installment' });
    }
  }
  for (const debt of input.debts) {
    if (debt.direction !== 'i_owe' || !debt.dueDate) continue;
    const status = debtStatus(debt, input.payments, now);
    if (status.settled) continue;
    const due = startOfDay(new Date(debt.dueDate));
    if (isAfter(due, end)) continue;
    events.push({ date: due < today ? today : due, title: `Pay ${debt.counterparty}`, amountMinor: -status.remainingMinor, kind: 'debt' });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const points: ForecastPoint[] = [];
  let balance = startMinor;
  let e = 0;
  for (let i = 0; i <= input.days; i += 1) {
    const date = addDays(today, i);
    // Today's everyday spending is already partly in the balance; count from tomorrow.
    if (i > 0) balance = subtract(balance, dailySpendMinor);
    while (e < events.length && events[e]!.date.getTime() <= date.getTime()) {
      balance = add(balance, events[e]!.amountMinor);
      e += 1;
    }
    points.push({ date, balanceMinor: balance });
  }
  const lowest = points.reduce((low, p) => (p.balanceMinor < low.balanceMinor ? p : low), points[0]!);
  return { startMinor, dailySpendMinor, events, points, lowest, endMinor: balance };
}

function transferSign(from: string, to: string | null, liquid: Set<string>): number {
  const out = liquid.has(from);
  const into = !!to && liquid.has(to);
  return out && !into ? -1 : !out && into ? 1 : 0;
}

export type Affordability = 'yes' | 'tight' | 'no';

export interface AffordResult {
  verdict: Affordability;
  /** Lowest projected balance from the purchase date on, after paying. */
  lowestAfter: ForecastPoint;
  bufferMinor: number;
}

/** Default safety buffer: two weeks of everyday spending, at least ₱1,000. */
export function defaultBufferMinor(forecast: Pick<Forecast, 'dailySpendMinor'>): number {
  return Math.max(100000, forecast.dailySpendMinor * 14);
}

/**
 * "Can I afford it?": pay `amountMinor` on `on` (default today) and check the
 * lowest projected balance from then on. Yes if it stays above the buffer,
 * tight if it stays above zero, no if it goes below zero.
 */
export function canAfford(forecast: Forecast, amountMinor: number, bufferMinor: number, on?: Date): AffordResult {
  const day = startOfDay(on ?? forecast.points[0]!.date).getTime();
  const after = forecast.points.filter((p) => p.date.getTime() >= day).map((p) => ({ date: p.date, balanceMinor: subtract(p.balanceMinor, amountMinor) }));
  const lowestAfter = after.reduce((low, p) => (p.balanceMinor < low.balanceMinor ? p : low), after[0] ?? { date: new Date(day), balanceMinor: -amountMinor });
  const verdict: Affordability = lowestAfter.balanceMinor >= bufferMinor ? 'yes' : lowestAfter.balanceMinor >= 0 ? 'tight' : 'no';
  return { verdict, lowestAfter, bufferMinor };
}
