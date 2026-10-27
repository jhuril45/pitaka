import type { AccountRecord, TransactionRecord } from '@shared/index';

import { add, subtract } from './money';

/**
 * Derived money figures. Balances are never stored: they're the opening
 * balance plus every non-deleted transaction touching the account.
 *
 *   expense     −amount on accountUuid
 *   income      +amount on accountUuid
 *   transfer    −amount on accountUuid, +amount on toAccountUuid
 *   adjustment  +amount (signed) on accountUuid
 *
 * Credit cards and loans therefore go negative as you spend/borrow.
 */
export function computeBalances(
  accounts: Pick<AccountRecord, 'uuid' | 'openingBalanceMinor'>[],
  transactions: Pick<TransactionRecord, 'type' | 'amountMinor' | 'accountUuid' | 'toAccountUuid' | 'deletedAt'>[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const account of accounts) balances.set(account.uuid, account.openingBalanceMinor);
  const move = (uuid: string | null, delta: number) => {
    if (uuid && balances.has(uuid)) balances.set(uuid, add(balances.get(uuid)!, delta));
  };
  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    switch (tx.type) {
      case 'expense':
        move(tx.accountUuid, -tx.amountMinor);
        break;
      case 'income':
      case 'adjustment':
        move(tx.accountUuid, tx.amountMinor);
        break;
      case 'transfer':
        move(tx.accountUuid, -tx.amountMinor);
        move(tx.toAccountUuid, tx.amountMinor);
        break;
    }
  }
  return balances;
}

export interface NetWorth {
  /** Sum of accounts in the base currency. */
  totalMinor: number;
  baseCurrency: string;
  /** Accounts in other currencies, summed per currency (no FX conversion). */
  other: { currency: string; totalMinor: number }[];
}

export function netWorth(
  accounts: Pick<AccountRecord, 'uuid' | 'currency' | 'archived'>[],
  balances: Map<string, number>,
  baseCurrency: string,
): NetWorth {
  let totalMinor = 0;
  const other = new Map<string, number>();
  for (const account of accounts) {
    if (account.archived) continue;
    const balance = balances.get(account.uuid) ?? 0;
    if (account.currency === baseCurrency) totalMinor = add(totalMinor, balance);
    else other.set(account.currency, add(other.get(account.currency) ?? 0, balance));
  }
  return {
    totalMinor,
    baseCurrency,
    other: [...other].map(([currency, total]) => ({ currency, totalMinor: total })),
  };
}

export interface PeriodTotals {
  incomeMinor: number;
  expenseMinor: number;
  /** income − expense; transfers and adjustments don't count. */
  netMinor: number;
}

export function periodTotals(transactions: Pick<TransactionRecord, 'type' | 'amountMinor' | 'deletedAt'>[]): PeriodTotals {
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    if (tx.type === 'income') incomeMinor = add(incomeMinor, tx.amountMinor);
    else if (tx.type === 'expense') expenseMinor = add(expenseMinor, tx.amountMinor);
  }
  return { incomeMinor, expenseMinor, netMinor: subtract(incomeMinor, expenseMinor) };
}

/** Expense totals per category uuid (null = uncategorised), biggest first. */
export function spendingByCategory(
  transactions: Pick<TransactionRecord, 'type' | 'amountMinor' | 'categoryUuid' | 'deletedAt'>[],
): { categoryUuid: string | null; totalMinor: number }[] {
  const totals = new Map<string | null, number>();
  for (const tx of transactions) {
    if (tx.deletedAt || tx.type !== 'expense') continue;
    totals.set(tx.categoryUuid, add(totals.get(tx.categoryUuid) ?? 0, tx.amountMinor));
  }
  return [...totals]
    .map(([categoryUuid, totalMinor]) => ({ categoryUuid, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}
