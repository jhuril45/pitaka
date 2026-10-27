import { FlashList } from '@shopify/flash-list';
import { format, isToday, isYesterday } from 'date-fns';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TransactionRecord } from '@shared/index';

import { MoneyText } from '@/components/money-text';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useAccounts } from '@/data/repos/accounts';
import { useCategories } from '@/data/repos/categories';
import { useTransactions } from '@/data/repos/transactions';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { periodTotals } from '@/lib/balances';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { syncNow } from '@/sync/engine';
import { useTheme } from '@/theme';

type Filter = 'all' | 'expense' | 'income' | 'transfer';
type Item = { kind: 'day'; key: string; label: string; netMinor: number } | { kind: 'tx'; key: string; tx: TransactionRecord };

function dayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, MMM d');
}

export default function TransactionsScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const { data: accounts } = useAccounts(profileUuid, { includeArchived: true });
  const { data: categories } = useCategories(profileUuid);

  const query = search.trim().toLowerCase();
  const { data: transactions } = useTransactions(profileUuid, { type: filter === 'all' ? undefined : filter });

  const items = useMemo<Item[]>(() => {
    // Search matches merchant, note or category name.
    const categoryHits = new Set(
      query && categories ? categories.filter((c) => c.name.toLowerCase().includes(query)).map((c) => c.uuid) : [],
    );
    const rows = (transactions ?? []).filter(
      (tx) =>
        !query ||
        tx.merchant.toLowerCase().includes(query) ||
        tx.note.toLowerCase().includes(query) ||
        (tx.categoryUuid !== null && categoryHits.has(tx.categoryUuid)),
    );
    const out: Item[] = [];
    let currentDay = '';
    let dayRows: TransactionRecord[] = [];
    let header: Extract<Item, { kind: 'day' }> | null = null;
    const closeDay = () => {
      if (header) header.netMinor = periodTotals(dayRows).netMinor;
    };
    for (const tx of rows) {
      const date = new Date(tx.occurredAt);
      const key = format(date, 'yyyy-MM-dd');
      if (key !== currentDay) {
        closeDay();
        currentDay = key;
        dayRows = [];
        header = { kind: 'day', key: `day-${key}`, label: dayLabel(date), netMinor: 0 };
        out.push(header);
      }
      dayRows.push(tx);
      out.push({ kind: 'tx', key: tx.uuid, tx });
    }
    closeDay();
    return out;
  }, [transactions, categories, query]);

  async function onRefresh() {
    setRefreshing(true);
    await syncNow('pull-to-refresh');
    setRefreshing(false);
  }

  const loading = !accounts || !categories || !transactions;

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          Transactions
        </AppText>
        <TextField value={search} onChangeText={setSearch} placeholder="Search merchant, note or category" autoCorrect={false} />
        <Segmented<Filter>
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfers' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>
      {loading ? null : items.length === 0 ? (
        <View style={{ padding: spacing.xl, gap: spacing.md, alignItems: 'center' }}>
          <AppText variant="heading">{query || filter !== 'all' ? 'Nothing matches' : 'No transactions yet'}</AppText>
          <AppText tone="muted" style={{ textAlign: 'center' }}>
            {query || filter !== 'all' ? 'Try a different search or filter.' : 'Tap ＋ to record your first expense or income.'}
          </AppText>
          {!query && filter === 'all' ? <Button title="Add transaction" onPress={() => router.push('/transaction/new')} /> : null}
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          onRefresh={onRefresh}
          refreshing={refreshing}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <View style={[styles.day, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs }]}>
                <AppText variant="label" tone="muted">
                  {item.label}
                </AppText>
                <MoneyText
                  amountMinor={item.netMinor}
                  variant="label"
                  tone={item.netMinor < 0 ? 'expense' : item.netMinor > 0 ? 'income' : 'muted'}
                  options={{ sign: 'always' }}
                />
              </View>
            ) : (
              <TransactionRow tx={item.tx} accounts={accounts} categories={categories} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  day: { flexDirection: 'row', justifyContent: 'space-between' },
});
