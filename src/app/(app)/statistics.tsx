import { addMonths, format, startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { MoneyText } from '@/components/money-text';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { useCategories } from '@/data/repos/categories';
import { useSummaries } from '@/data/repos/insights';
import { useProfile } from '@/data/repos/profiles';
import { useTransactions } from '@/data/repos/transactions';
import { windowMonths } from '@/data/pins';
import { formatCompact, subtract } from '@/lib/money';
import { categoryBreakdown, lastMonths, monthKeyOf, monthlyTotals, summaryBreakdown, type CategorySlice } from '@/lib/statistics';
import { usePrivacyStore } from '@/stores/privacy-store';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

type Mode = 'month' | 'year';
type Kind = 'expense' | 'income';

/** How far back the month picker goes (older months come from synced summaries). */
const MAX_MONTHS_BACK = 36;

/** Where the money went: category breakdown for a month, and income vs spending over 12 months. */
export default function StatisticsScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const hideAmounts = usePrivacyStore((s) => s.hideAmounts);
  const { data: profile } = useProfile(profileUuid);
  const currency = profile?.baseCurrency ?? 'PHP';
  const { data: transactions } = useTransactions(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const { data: summaries } = useSummaries(profileUuid);
  const [mode, setMode] = useState<Mode>('month');
  const [kind, setKind] = useState<Kind>('expense');
  const [offset, setOffset] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);

  const now = new Date();
  const monthStart = startOfMonth(addMonths(now, -offset));
  const localMonths = useMemo(() => new Set(windowMonths()), []);

  const view = useMemo(() => {
    if (!transactions || !categories || !summaries) return null;
    const months = mode === 'month' ? [monthKeyOf(monthStart)] : lastMonths(now, 12);
    const from = mode === 'month' ? monthStart : startOfMonth(addMonths(now, -11));
    const to = mode === 'month' ? addMonths(monthStart, 1) : addMonths(startOfMonth(now), 1);
    // Months on the phone come from transactions; older ones from summaries.
    const older = new Set(months.filter((m) => !localMonths.has(m)));
    const slices = older.size === months.length ? summaryBreakdown(summaries, categories, older, kind) : categoryBreakdown(transactions, categories, from, to, kind);
    const totals = monthlyTotals(months, transactions, summaries, localMonths);
    const income = totals.reduce((s, t) => s + t.incomeMinor, 0);
    const expense = totals.reduce((s, t) => s + t.expenseMinor, 0);
    return { slices, totals, income, expense };
    // monthStart/now are derived from offset and today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categories, summaries, mode, kind, offset, localMonths]);

  if (!view) return null;
  const total = view.slices.reduce((s, c) => s + c.amountMinor, 0);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Segmented<Mode>
        options={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Last 12 months' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'month' ? (
        <View style={[styles.between, { paddingHorizontal: spacing.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={12} disabled={offset >= MAX_MONTHS_BACK} onPress={() => setOffset(offset + 1)}>
            <Icon name="chevronLeft" size={26} color={offset >= MAX_MONTHS_BACK ? colors.border : colors.text} />
          </Pressable>
          <AppText variant="heading">{format(monthStart, 'MMMM yyyy')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={12} disabled={offset === 0} onPress={() => setOffset(offset - 1)}>
            <Icon name="chevronRight" size={26} color={offset === 0 ? colors.border : colors.text} />
          </Pressable>
        </View>
      ) : null}

      <Card>
        <View style={[styles.between, { gap: spacing.md }]}>
          <Total label="Income" amountMinor={view.income} currency={currency} tone="income" />
          <Total label="Spent" amountMinor={view.expense} currency={currency} tone="expense" />
          <Total label="Saved" amountMinor={subtract(view.income, view.expense)} currency={currency} tone="default" />
        </View>
      </Card>

      {mode === 'year' && !hideAmounts ? (
        <Card>
          <AppText variant="heading">Income vs spending</AppText>
          <View style={{ overflow: 'hidden' }} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel="Bar chart of income and spending per month">
            {chartWidth > 0 ? (
              <BarChart
                data={view.totals.flatMap((t) => [
                  { value: t.incomeMinor, frontColor: colors.income, spacing: 2, label: format(new Date(`${t.month}-01T00:00:00`), 'MMMMM'), labelWidth: 20 },
                  { value: t.expenseMinor, frontColor: colors.expense },
                ])}
                width={chartWidth - 56}
                height={160}
                barWidth={Math.max(4, Math.floor((chartWidth - 56) / 12 / 2) - 6)}
                spacing={8}
                initialSpacing={4}
                noOfSections={4}
                yAxisLabelWidth={48}
                formatYLabel={(label) => formatCompact(Math.round(Number(label)), currency)}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                xAxisColor={colors.border}
                yAxisColor={colors.border}
                rulesColor={colors.border}
                disableScroll
              />
            ) : null}
          </View>
          <View style={[styles.row, { gap: spacing.lg }]}>
            <Legend color={colors.income} label="Income" />
            <Legend color={colors.expense} label="Spent" />
          </View>
        </Card>
      ) : null}

      <Card>
        <Segmented<Kind>
          options={[
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' },
          ]}
          value={kind}
          onChange={setKind}
        />
        {view.slices.length === 0 ? (
          <AppText tone="muted" style={{ marginTop: spacing.md }}>
            Nothing recorded for this period.
          </AppText>
        ) : (
          <>
            {!hideAmounts ? (
              <View style={{ alignItems: 'center', marginVertical: spacing.md }} accessible accessibilityLabel="Donut chart by category">
                <PieChart
                  data={view.slices.map((s) => ({ value: s.amountMinor, color: s.color }))}
                  donut
                  radius={96}
                  innerRadius={64}
                  innerCircleColor={colors.surface}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <AppText variant="caption" tone="muted">
                        {kind === 'expense' ? 'Spent' : 'Income'}
                      </AppText>
                      <AppText variant="heading">{formatCompact(total, currency)}</AppText>
                    </View>
                  )}
                />
              </View>
            ) : null}
            {view.slices.map((slice) => (
              <SliceRow key={slice.categoryUuid ?? 'none'} slice={slice} currency={currency} />
            ))}
          </>
        )}
      </Card>
    </ScrollView>
  );
}

function Total({ label, amountMinor, currency, tone }: { label: string; amountMinor: number; currency: string; tone: 'income' | 'expense' | 'default' }) {
  return (
    <View style={styles.flex}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <MoneyText amountMinor={amountMinor} currency={currency} tone={tone} options={{ trimZeroMinor: true }} />
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.row, { gap: 6 }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

function SliceRow({ slice, currency }: { slice: CategorySlice; currency: string }) {
  return (
    <ListRow
      title={slice.name}
      subtitle={`${Math.round(slice.shareBps / 100)}% · ${slice.count} ${slice.count === 1 ? 'transaction' : 'transactions'}`}
      color={slice.color}
      right={<MoneyText amountMinor={slice.amountMinor} currency={currency} />}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
