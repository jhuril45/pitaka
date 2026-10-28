import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { SyncIndicator } from '@/components/sync-indicator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useCategories } from '@/data/repos/categories';
import { useObligations } from '@/data/repos/obligations';
import { useBudgets } from '@/data/repos/plans';
import { listProfiles } from '@/data/repos/profiles';
import { useAccountBalances } from '@/data/repos/use-balances';
import { useLocalQuery } from '@/data/use-local-query';
import { useAuth } from '@/features/auth/auth-context';
import { BudgetCard } from '@/features/plans/budget-card';
import { dueSoon } from '@/features/reminders/upcoming';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { budgetStatus } from '@/lib/budgets';
import { netWorth, periodTotals } from '@/lib/balances';
import { usePrivacyStore } from '@/stores/privacy-store';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const dayLabel = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : isPast(d) ? `Overdue · ${format(d, 'MMM d')}` : format(d, 'EEE, MMM d'));

export default function HomeScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const auth = useAuth();
  const firstName = auth.status === 'account' ? auth.account.name.trim().split(/\s+/)[0] : '';
  const { hideAmounts, toggleHideAmounts } = usePrivacyStore();
  const { data: profile } = useLocalQuery(async () => (await listProfiles()).find((p) => p.uuid === profileUuid), ['Profile'], [profileUuid]);
  const { accounts, transactions, balances } = useAccountBalances(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const baseCurrency = profile?.baseCurrency ?? 'PHP';

  const month = format(new Date(), 'yyyy-MM');
  const thisMonth = useMemo(
    () => periodTotals((transactions ?? []).filter((tx) => format(new Date(tx.occurredAt), 'yyyy-MM') === month)),
    [transactions, month],
  );
  const worth = accounts && balances ? netWorth(accounts, balances, baseCurrency) : null;
  const { data: budgets } = useBudgets(profileUuid);
  // The two budgets closest to their limit.
  const topBudgets = useMemo(
    () =>
      budgets && transactions && categories
        ? budgets
            .map((budget) => ({ budget, status: budgetStatus(budget, transactions, categories) }))
            .sort((a, b) => b.status.usedBps - a.status.usedBps)
            .slice(0, 2)
        : [],
    [budgets, transactions, categories],
  );
  const { data: obligations } = useObligations(profileUuid);
  const upcoming = useMemo(() => (obligations ? dueSoon(obligations) : []), [obligations]);

  return (
    <Screen title={firstName ? `Hi, ${firstName}` : 'Home'}>
      {profile ? (
        <AppText variant="label" tone="muted" style={{ marginTop: -spacing.md }}>
          {profile.name}
        </AppText>
      ) : null}
      <SyncIndicator />

      <Card>
        <View style={styles.between}>
          <AppText variant="label" tone="muted">
            Net worth
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hideAmounts ? 'Show amounts' : 'Hide amounts'}
            onPress={toggleHideAmounts}
            hitSlop={10}>
            <Icon name={hideAmounts ? 'eyeOff' : 'eye'} size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <MoneyText amountMinor={worth?.totalMinor ?? 0} currency={baseCurrency} variant="display" />
        {worth?.other.map((o) => (
          <AppText key={o.currency} variant="caption" tone="muted">
            + <MoneyText amountMinor={o.totalMinor} currency={o.currency} variant="caption" tone="muted" /> in {o.currency} accounts
          </AppText>
        ))}
      </Card>

      <Card>
        <AppText variant="label" tone="muted">
          {format(new Date(), 'MMMM')}
        </AppText>
        <View style={[styles.between, { gap: spacing.md }]}>
          <View style={styles.flex}>
            <AppText variant="caption" tone="muted">
              Income
            </AppText>
            <MoneyText amountMinor={thisMonth.incomeMinor} currency={baseCurrency} variant="heading" tone="income" />
          </View>
          <View style={styles.flex}>
            <AppText variant="caption" tone="muted">
              Spent
            </AppText>
            <MoneyText amountMinor={thisMonth.expenseMinor} currency={baseCurrency} variant="heading" tone="expense" />
          </View>
        </View>
      </Card>

      {upcoming.length ? (
        <Card>
          <AppText variant="heading">Next 7 days</AppText>
          {upcoming.slice(0, 5).map((item) => (
            <ListRow
              key={item.key}
              title={item.title}
              subtitle={dayLabel(item.date)}
              onPress={() => router.push({ pathname: item.pathname, params: { id: item.id } })}
              right={<MoneyText amountMinor={item.amountMinor} currency={baseCurrency} tone={item.incoming ? 'income' : 'default'} />}
            />
          ))}
        </Card>
      ) : null}

      {categories
        ? topBudgets.map(({ budget, status }) => (
            <BudgetCard key={budget.uuid} budget={budget} status={status} categories={categories} currency={baseCurrency} />
          ))
        : null}

      <Card>
        <View style={styles.between}>
          <AppText variant="heading">Accounts</AppText>
          <Button title="Manage" variant="ghost" onPress={() => router.push('/accounts')} style={styles.inlineButton} />
        </View>
        {accounts?.length === 0 ? <AppText tone="muted">No accounts yet.</AppText> : null}
        {accounts?.map((account) => (
          <ListRow
            key={account.uuid}
            title={account.name}
            color={account.color}
            onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: account.uuid } })}
            right={
              <MoneyText
                amountMinor={balances?.get(account.uuid) ?? 0}
                currency={account.currency}
                tone={(balances?.get(account.uuid) ?? 0) < 0 ? 'expense' : 'default'}
              />
            }
          />
        ))}
      </Card>

      <Card style={{ paddingHorizontal: 0 }}>
        <View style={[styles.between, { paddingHorizontal: spacing.lg }]}>
          <AppText variant="heading">Recent</AppText>
          <Button title="See all" variant="ghost" onPress={() => router.push('/transactions')} style={styles.inlineButton} />
        </View>
        {transactions && accounts && categories
          ? transactions.slice(0, 5).map((tx) => <TransactionRow key={tx.uuid} tx={tx} accounts={accounts} categories={categories} />)
          : null}
        {transactions?.length === 0 ? (
          <AppText tone="muted" style={{ paddingHorizontal: spacing.lg }}>
            Nothing yet. Tap ＋ to add your first transaction.
          </AppText>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inlineButton: { minHeight: 36, paddingHorizontal: 8 },
});
