import { setHours, subDays } from 'date-fns';

import type { DebtPaymentRecord, DebtRecord, InstallmentRecord, RecurringRuleRecord } from '@shared/index';

import { stableUuid } from '@/lib/ids';
import { dayKey, installmentCharges, occurrencesBetween } from '@/lib/schedules';

import { getLocal, listLive } from '../local-store';
import { profilePin, windowStart } from '../pins';
import { deleteRecord, saveRecord, type Draft } from '../repo';
import { useLocalQuery } from '../use-local-query';

/** Debts (with payments), installments and recurring rules of a profile. */

const live = <T extends { uuid: string }>(className: 'Debt' | 'DebtPayment' | 'Installment' | 'RecurringRule', profileUuid: string) =>
  listLive<T & Record<string, unknown>>(className, [profilePin(profileUuid)]) as unknown as Promise<T[]>;

export async function loadObligations(profileUuid: string) {
  const [debts, payments, installments, rules] = await Promise.all([
    live<DebtRecord>('Debt', profileUuid),
    live<DebtPaymentRecord>('DebtPayment', profileUuid),
    live<InstallmentRecord>('Installment', profileUuid),
    live<RecurringRuleRecord>('RecurringRule', profileUuid),
  ]);
  return {
    debts: debts.sort((a, b) => a.counterparty.localeCompare(b.counterparty)),
    payments: payments.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
    installments: installments.sort((a, b) => a.name.localeCompare(b.name)),
    rules: rules.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function useObligations(profileUuid: string) {
  return useLocalQuery(() => loadObligations(profileUuid), ['Debt', 'DebtPayment', 'Installment', 'RecurringRule'], [profileUuid]);
}

export const saveDebt = (draft: Draft<'Debt'>) => saveRecord('Debt', draft);
export const saveInstallment = (draft: Draft<'Installment'>) => saveRecord('Installment', draft);
export const saveRecurringRule = (draft: Draft<'RecurringRule'>) => saveRecord('RecurringRule', draft);
export const removeInstallment = (uuid: string) => deleteRecord('Installment', uuid);
export const removeRecurringRule = (uuid: string) => deleteRecord('RecurringRule', uuid);

export async function removeDebt(uuid: string, payments: DebtPaymentRecord[]): Promise<void> {
  for (const p of payments.filter((p) => p.debtUuid === uuid)) await deleteRecord('DebtPayment', p.uuid);
  await deleteRecord('Debt', uuid);
}

/**
 * Record a payment on a debt. With `accountUuid`, the money movement is also
 * recorded as a transaction (income when someone pays you back, expense when
 * you pay) and linked to the payment. Marks the debt settled when it is paid off.
 */
export async function recordDebtPayment(args: {
  debt: DebtRecord;
  amountMinor: number;
  occurredAt: string;
  accountUuid: string | null;
  remainingBeforeMinor: number;
}): Promise<DebtPaymentRecord> {
  const { debt, amountMinor, occurredAt, accountUuid, remainingBeforeMinor } = args;
  let transactionUuid: string | null = null;
  if (accountUuid) {
    const tx = await saveRecord('Transaction', {
      profileUuid: debt.profileUuid,
      type: debt.direction === 'owed_to_me' ? 'income' : 'expense',
      amountMinor,
      accountUuid,
      toAccountUuid: null,
      categoryUuid: null,
      occurredAt,
      note: debt.direction === 'owed_to_me' ? 'Debt repayment' : 'Debt payment',
      merchant: debt.counterparty,
      source: 'manual',
      recurringRuleUuid: null,
      installmentUuid: null,
    });
    transactionUuid = tx.uuid;
  }
  const payment = await saveRecord('DebtPayment', { profileUuid: debt.profileUuid, debtUuid: debt.uuid, amountMinor, occurredAt, transactionUuid });
  if (amountMinor >= remainingBeforeMinor && !debt.settledAt) {
    await saveRecord('Debt', { ...debt, settledAt: occurredAt });
  }
  return payment;
}

/** How far back the device catches up on missed recurring items. */
export const CATCH_UP_DAYS = 62;

/**
 * Create due transactions for auto-posting recurring rules and for installment
 * months, on the device (works offline). Each generated transaction has a
 * stable id — (rule, day) or (installment, month) — and the due date as its
 * clientUpdatedAt, so other devices produce the same rows, an edit the user
 * makes always wins, and a deleted one stays deleted (its tombstone keeps the id).
 * Returns how many were created.
 */
export async function postDueItems(profileUuid: string, now = new Date()): Promise<number> {
  const { rules, installments } = await loadObligations(profileUuid);
  const oldest = Math.max(windowStart(now).getTime(), subDays(now, CATCH_UP_DAYS).getTime());
  let created = 0;

  for (const rule of rules.filter((r) => r.autoPost)) {
    for (const day of occurrencesBetween(rule, new Date(oldest), now)) {
      const uuid = await stableUuid(`${rule.uuid}:${dayKey(day)}`);
      if (await getLocal('Transaction', uuid)) continue;
      const t = rule.template;
      await saveRecord(
        'Transaction',
        {
          uuid,
          profileUuid,
          type: t.type,
          amountMinor: t.amountMinor,
          accountUuid: t.accountUuid,
          toAccountUuid: t.toAccountUuid,
          categoryUuid: t.categoryUuid,
          occurredAt: setHours(day, 9).toISOString(),
          note: t.note,
          merchant: t.merchant || rule.name,
          source: 'recurring',
          recurringRuleUuid: rule.uuid,
          installmentUuid: null,
        },
        { clientUpdatedAt: day.toISOString() },
      );
      created += 1;
    }
  }

  for (const installment of installments) {
    for (const charge of installmentCharges(installment)) {
      if (charge.date.getTime() > now.getTime() || charge.date.getTime() < oldest) continue;
      const uuid = await stableUuid(`${installment.uuid}:month:${charge.index}`);
      if (await getLocal('Transaction', uuid)) continue;
      await saveRecord(
        'Transaction',
        {
          uuid,
          profileUuid,
          type: 'expense',
          amountMinor: charge.amountMinor,
          accountUuid: installment.accountUuid,
          toAccountUuid: null,
          categoryUuid: installment.categoryUuid,
          occurredAt: setHours(charge.date, 9).toISOString(),
          note: `Installment ${charge.index + 1} of ${installment.months}`,
          merchant: installment.name,
          source: 'recurring',
          recurringRuleUuid: null,
          installmentUuid: installment.uuid,
        },
        { clientUpdatedAt: charge.date.toISOString() },
      );
      created += 1;
    }
  }
  return created;
}
