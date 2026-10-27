import type { TransactionRecord } from '@shared/index';

import { getLocal, listLive } from '../local-store';
import { DEFAULT_TX_WINDOW_MONTHS, txPin, windowMonths } from '../pins';
import { deleteRecord, saveRecord, type Draft } from '../repo';
import { useLocalQuery } from '../use-local-query';

export interface TransactionFilter {
  /** Months to read, as YYYY-MM; defaults to the whole on-device window. */
  months?: string[];
  type?: TransactionRecord['type'];
  accountUuid?: string;
  categoryUuids?: string[];
  /** Matches merchant or note, case-insensitive. */
  search?: string;
}

/** Newest first. Reads only the month pins asked for. */
export async function listTransactions(profileUuid: string, filter: TransactionFilter = {}): Promise<TransactionRecord[]> {
  const months = filter.months ?? windowMonths(new Date(), DEFAULT_TX_WINDOW_MONTHS);
  const rows = await listLive<TransactionRecord>(
    'Transaction',
    months.map((m) => txPin(profileUuid, m)),
  );
  const search = filter.search?.trim().toLowerCase();
  const categories = filter.categoryUuids ? new Set(filter.categoryUuids) : null;
  return rows
    .filter((tx) => !filter.type || tx.type === filter.type)
    .filter((tx) => !filter.accountUuid || tx.accountUuid === filter.accountUuid || tx.toAccountUuid === filter.accountUuid)
    .filter((tx) => !categories || (tx.categoryUuid !== null && categories.has(tx.categoryUuid)))
    .filter((tx) => !search || tx.merchant.toLowerCase().includes(search) || tx.note.toLowerCase().includes(search))
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
}

export function useTransactions(profileUuid: string, filter: TransactionFilter = {}) {
  return useLocalQuery(() => listTransactions(profileUuid, filter), ['Transaction'], [profileUuid, JSON.stringify(filter)]);
}

export async function getTransaction(uuid: string): Promise<TransactionRecord | null> {
  const tx = await getLocal<TransactionRecord>('Transaction', uuid);
  return tx && !tx.deletedAt ? tx : null;
}

export function saveTransaction(draft: Draft<'Transaction'>): Promise<TransactionRecord> {
  return saveRecord('Transaction', draft);
}

export function removeTransaction(uuid: string): Promise<void> {
  return deleteRecord('Transaction', uuid);
}
