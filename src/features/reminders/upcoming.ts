import { addDays, format, isSameDay, setHours, startOfDay, subDays } from 'date-fns';

import { loadObligations } from '@/data/repos/obligations';
import { formatMoney } from '@/lib/money';
import { debtStatus, installmentCharges, occurrencesBetween } from '@/lib/schedules';

/** Reminder ids are "pitaka:<item uuid>:<due day>" (one per item per due date). */
export const REMINDER_ID_PREFIX = 'pitaka:';
const ID_PREFIX = REMINDER_ID_PREFIX;
const HORIZON_DAYS = 30;
/** iOS keeps at most 64 pending local notifications. */
const MAX_SCHEDULED = 60;
const REMIND_HOUR = 9;

export interface Reminder {
  id: string;
  at: Date;
  title: string;
  body: string;
}

const dueLabel = (due: Date, now: Date) =>
  isSameDay(due, now) ? 'today' : isSameDay(due, addDays(now, 1)) ? 'tomorrow' : `on ${format(due, 'EEE, MMM d')}`;

/** Reminders to show in the next 30 days (pure: no scheduling). */
export async function upcomingReminders(profileUuid: string, now = new Date()): Promise<Reminder[]> {
  const { rules, installments, debts, payments } = await loadObligations(profileUuid);
  const until = addDays(now, HORIZON_DAYS);
  const out: Reminder[] = [];
  const add = (key: string, due: Date, daysBefore: number, title: string, body: string) => {
    const at = setHours(startOfDay(subDays(due, daysBefore)), REMIND_HOUR);
    if (at.getTime() > now.getTime()) out.push({ id: `${ID_PREFIX}${key}:${format(due, 'yyyy-MM-dd')}`, at, title, body });
  };

  for (const rule of rules) {
    for (const due of occurrencesBetween(rule, now, addDays(until, rule.remindDaysBefore))) {
      const amount = formatMoney(rule.template.amountMinor);
      const what = rule.kind === 'income' ? `${rule.name} (${amount}) expected` : `${rule.name} (${amount}) is due`;
      add(rule.uuid, due, rule.remindDaysBefore, rule.kind === 'income' ? 'Money coming in' : 'Bill reminder', `${what} ${dueLabel(due, subDays(due, rule.remindDaysBefore))}.`);
    }
  }
  for (const installment of installments) {
    for (const charge of installmentCharges(installment)) {
      if (charge.date.getTime() < now.getTime() || charge.date.getTime() > until.getTime()) continue;
      add(installment.uuid, charge.date, 1, 'Installment tomorrow', `${installment.name}: ${formatMoney(charge.amountMinor)} (${charge.index + 1} of ${installment.months}).`);
    }
  }
  for (const debt of debts) {
    if (!debt.dueDate) continue;
    const status = debtStatus(debt, payments, now);
    const due = new Date(debt.dueDate);
    if (status.settled || due.getTime() > until.getTime()) continue;
    const body =
      debt.direction === 'i_owe'
        ? `You owe ${debt.counterparty} ${formatMoney(status.remainingMinor)}, due tomorrow.`
        : `${debt.counterparty} owes you ${formatMoney(status.remainingMinor)}, due tomorrow.`;
    add(debt.uuid, due, 1, 'Debt due', body);
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

export interface DueItem {
  key: string;
  date: Date;
  title: string;
  amountMinor: number;
  /** Money coming in rather than going out. */
  incoming: boolean;
  pathname: '/recurring/[id]' | '/installments/[id]' | '/debts/[id]';
  id: string;
}

/** What falls due from today through the next `days` days (for Home), soonest first. */
export function dueSoon(data: Awaited<ReturnType<typeof loadObligations>>, now = new Date(), days = 7): DueItem[] {
  const from = startOfDay(now);
  const to = addDays(from, days);
  const out: DueItem[] = [];
  for (const rule of data.rules) {
    for (const date of occurrencesBetween(rule, from, to, 10)) {
      out.push({ key: `${rule.uuid}:${date.getTime()}`, date, title: rule.name, amountMinor: rule.template.amountMinor, incoming: rule.kind === 'income', pathname: '/recurring/[id]', id: rule.uuid });
    }
  }
  for (const inst of data.installments) {
    for (const charge of installmentCharges(inst)) {
      if (charge.date < from || charge.date > to) continue;
      out.push({ key: `${inst.uuid}:${charge.index}`, date: charge.date, title: `${inst.name} (${charge.index + 1}/${inst.months})`, amountMinor: charge.amountMinor, incoming: false, pathname: '/installments/[id]', id: inst.uuid });
    }
  }
  for (const debt of data.debts) {
    if (!debt.dueDate) continue;
    const status = debtStatus(debt, data.payments, now);
    const date = startOfDay(new Date(debt.dueDate));
    // Overdue debts stay listed until settled.
    if (status.settled || date > to) continue;
    out.push({
      key: debt.uuid,
      date,
      title: debt.direction === 'i_owe' ? `Pay ${debt.counterparty}` : `${debt.counterparty} pays you`,
      amountMinor: status.remainingMinor,
      incoming: debt.direction === 'owed_to_me',
      pathname: '/debts/[id]',
      id: debt.uuid,
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

