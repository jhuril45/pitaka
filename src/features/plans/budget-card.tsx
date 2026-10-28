import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BudgetRecord, CategoryRecord } from '@shared/index';

import { MoneyText } from '@/components/money-text';
import { ProgressBar } from '@/components/progress-bar';
import { Card } from '@/components/ui/card';
import { AppText } from '@/components/ui/text';
import { categoryLabel } from '@/data/repos/categories';
import type { BudgetStatus } from '@/lib/budgets';
import { useTheme } from '@/theme';

/** One budget: name, spent vs limit, bar (with today's pace marker), state. */
export function BudgetCard({ budget, status, categories, currency }: { budget: BudgetRecord; status: BudgetStatus; categories: CategoryRecord[]; currency: string }) {
  const { colors, radius, spacing } = useTheme();
  const tint = status.state === 'over' ? colors.danger : status.state === 'warning' ? colors.warning : colors.primary;
  const name = budget.categoryUuid ? categoryLabel(categories, budget.categoryUuid) : 'Everything';
  const label = status.state === 'over' ? 'Over budget' : status.state === 'warning' ? `${Math.floor(status.usedBps / 100)}% used` : 'On track';

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/budgets/[id]', params: { id: budget.uuid } })}>
      <Card>
        <View style={styles.between}>
          <AppText variant="heading" numberOfLines={1} style={styles.flex}>
            {name}
          </AppText>
          {budget.rollover ? (
            <View style={[styles.badge, { backgroundColor: colors.primaryMuted, borderRadius: radius.pill }]}>
              <AppText variant="caption" style={{ color: colors.primary }}>
                Rollover {status.carryMinor >= 0 ? '+' : '−'}
                <MoneyText amountMinor={Math.abs(status.carryMinor)} currency={currency} variant="caption" options={{ trimZeroMinor: true }} style={{ color: colors.primary }} />
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={[styles.between, { gap: spacing.sm }]}>
          <AppText variant="caption" tone="muted">
            <MoneyText amountMinor={status.spentMinor} currency={currency} variant="caption" tone="muted" /> of{' '}
            <MoneyText amountMinor={status.limitMinor} currency={currency} variant="caption" tone="muted" />
          </AppText>
          <AppText variant="caption" style={{ color: tint }}>
            {label}
          </AppText>
        </View>
        <ProgressBar bps={status.usedBps} color={tint} markerBps={status.elapsedBps} />
        <AppText variant="caption" tone="muted">
          {status.remainingMinor >= 0 ? (
            <>
              <MoneyText amountMinor={status.remainingMinor} currency={currency} variant="caption" tone="muted" /> left
            </>
          ) : (
            <>
              <MoneyText amountMinor={-status.remainingMinor} currency={currency} variant="caption" tone="expense" /> over
            </>
          )}{' '}
          · {status.daysLeft} day{status.daysLeft === 1 ? '' : 's'} to go
        </AppText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
});
