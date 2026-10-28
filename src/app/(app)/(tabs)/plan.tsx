import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { ProgressBar } from '@/components/progress-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useCategories } from '@/data/repos/categories';
import { useBudgets, useGoals } from '@/data/repos/plans';
import { useProfile } from '@/data/repos/profiles';
import { useAccountBalances } from '@/data/repos/use-balances';
import { BudgetCard } from '@/features/plans/budget-card';
import { budgetStatus, goalStatus } from '@/lib/budgets';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

export default function PlanScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const { data: profile } = useProfile(profileUuid);
  const currency = profile?.baseCurrency ?? 'PHP';
  const { data: budgets } = useBudgets(profileUuid);
  const { data: goalData } = useGoals(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const { transactions, balances } = useAccountBalances(profileUuid);

  const budgetRows = useMemo(
    () =>
      budgets && transactions && categories
        ? budgets.map((budget) => ({ budget, status: budgetStatus(budget, transactions, categories) })).sort((a, b) => b.status.usedBps - a.status.usedBps)
        : [],
    [budgets, transactions, categories],
  );

  return (
    <Screen title="Plan">
      <View style={styles.between}>
        <AppText variant="heading">Budgets</AppText>
        <Button title="Add" variant="ghost" onPress={() => router.push({ pathname: '/budgets/[id]', params: { id: 'new' } })} style={styles.inline} />
      </View>
      {budgets?.length === 0 ? (
        <Card>
          <AppText tone="muted">Set a monthly limit for a category (or everything) and Pitaka tracks it as you spend.</AppText>
        </Card>
      ) : null}
      {categories
        ? budgetRows.map(({ budget, status }) => <BudgetCard key={budget.uuid} budget={budget} status={status} categories={categories} currency={currency} />)
        : null}

      <View style={[styles.between, { marginTop: spacing.md }]}>
        <AppText variant="heading">Goals</AppText>
        <Button title="Add" variant="ghost" onPress={() => router.push({ pathname: '/goals/[id]', params: { id: 'new' } })} style={styles.inline} />
      </View>
      {goalData?.goals.length === 0 ? (
        <Card>
          <AppText tone="muted">Saving for something? Add a goal and log what you put aside.</AppText>
        </Card>
      ) : null}
      {goalData?.goals.map((goal) => {
        const s = goalStatus(goal, goalData.contributions, balances);
        return (
          <Pressable key={goal.uuid} accessibilityRole="button" onPress={() => router.push({ pathname: '/goals/[id]', params: { id: goal.uuid } })}>
            <Card>
              <View style={styles.between}>
                <AppText variant="heading">{goal.name}</AppText>
                <AppText variant="caption" style={{ color: s.reached ? colors.income : colors.textMuted }}>
                  {s.reached ? 'Reached!' : `${Math.floor(s.progressBps / 100)}%`}
                </AppText>
              </View>
              <ProgressBar bps={s.progressBps} color={s.reached ? colors.income : colors.primary} />
              <AppText variant="caption" tone="muted">
                <MoneyText amountMinor={s.savedMinor} currency={currency} variant="caption" tone="muted" /> of{' '}
                <MoneyText amountMinor={goal.targetMinor} currency={currency} variant="caption" tone="muted" />
                {s.perMonthMinor && !s.reached ? (
                  <>
                    {' · '}
                    <MoneyText amountMinor={s.perMonthMinor} currency={currency} variant="caption" tone="muted" />
                    /month to stay on target
                  </>
                ) : null}
              </AppText>
            </Card>
          </Pressable>
        );
      })}

      <Card style={{ marginTop: spacing.md }}>
        <AppText variant="heading">More planning</AppText>
        <ListRow title="Debts" subtitle="Coming in Milestone 8" />
        <ListRow title="Installments" subtitle="Coming in Milestone 8" />
        <ListRow title="Recurring bills" subtitle="Coming in Milestone 8" />
        <ListRow title="Cashflow forecast" subtitle="Coming in Milestone 9" />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inline: { minHeight: 36, paddingHorizontal: 8 },
});
