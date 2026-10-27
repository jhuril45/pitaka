import { useMemo } from 'react';

import { computeBalances } from '@/lib/balances';

import { useAccounts } from './accounts';
import { useTransactions } from './transactions';

/** Accounts of a profile with balances derived from the on-device transactions. */
export function useAccountBalances(profileUuid: string, options: { includeArchived?: boolean } = {}) {
  const { data: accounts } = useAccounts(profileUuid, options);
  const { data: transactions } = useTransactions(profileUuid);
  const balances = useMemo(
    () => (accounts && transactions ? computeBalances(accounts, transactions) : undefined),
    [accounts, transactions],
  );
  return { accounts, transactions, balances };
}
