import { useState } from 'react';
import { ScrollView } from 'react-native';

import type { TransactionRecord } from '@shared/index';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { AppText } from '@/components/ui/text';
import { emitChange } from '@/data/events';
import { putManyLocal } from '@/data/local-store';
import { monthOf, windowStart } from '@/data/pins';
import { useAccounts } from '@/data/repos/accounts';
import { useCategories } from '@/data/repos/categories';
import { useTransactions } from '@/data/repos/transactions';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { getTransactionsPage, type TransactionsPage } from '@/parse/cloud';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

/**
 * Transactions older than the 12 months the phone keeps: loaded from the
 * server a page at a time and kept on the device in their month pins.
 */
export default function HistoryScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const [months, setMonths] = useState<string[]>([]);
  const [next, setNext] = useState<TransactionsPage['next'] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: accounts } = useAccounts(profileUuid, { includeArchived: true });
  const { data: categories } = useCategories(profileUuid);
  const { data: transactions } = useTransactions(profileUuid, { months });

  async function loadMore() {
    setBusy(true);
    setError(null);
    try {
      // Start just before the on-device window.
      const page = await getTransactionsPage({
        profileUuid,
        before: next?.before ?? windowStart().toISOString(),
        beforeUuid: next?.beforeUuid,
        limit: 100,
      });
      const rows = page.transactions as unknown as TransactionRecord[];
      await putManyLocal(rows.map((record) => ({ className: 'Transaction' as const, record, previous: null })));
      emitChange('Transaction');
      setMonths((prev) => [...new Set([...prev, ...rows.map((r) => monthOf(r.occurredAt))])]);
      setNext(page.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load older history. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const done = next === null;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <AppText tone="muted">Your phone keeps the last 12 months. Older transactions load from your account when you’re online.</AppText>
      <ErrorBanner message={error} />
      {transactions?.length && accounts && categories ? (
        <Card style={{ paddingHorizontal: 0 }}>
          {transactions.map((tx) => (
            <TransactionRow key={tx.uuid} tx={tx} accounts={accounts} categories={categories} />
          ))}
        </Card>
      ) : null}
      {done ? (
        <AppText tone="muted" style={{ textAlign: 'center' }}>
          {transactions?.length ? 'That’s everything.' : 'No older transactions.'}
        </AppText>
      ) : (
        <Button title={next === undefined ? 'Load older transactions' : 'Load more'} variant="outline" loading={busy} onPress={() => void loadMore()} />
      )}
    </ScrollView>
  );
}
