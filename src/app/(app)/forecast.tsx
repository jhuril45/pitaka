import { format, isToday, isTomorrow, startOfDay } from 'date-fns';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { DateListField } from '@/components/date-list-field';
import { MoneyText } from '@/components/money-text';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useObligations } from '@/data/repos/obligations';
import { useProfile } from '@/data/repos/profiles';
import { useAccountBalances } from '@/data/repos/use-balances';
import { canAfford, defaultBufferMinor, forecastCashflow } from '@/lib/forecast';
import { formatCompact, parseMoney, toMajorString } from '@/lib/money';
import { usePrivacyStore } from '@/stores/privacy-store';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

type Range = '30' | '60' | '90';

const dayLabel = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE, MMM d'));

const VERDICT = {
  yes: { title: 'Yes, you can afford it', tone: 'income' },
  tight: { title: 'You can, but it’s tight', tone: 'default' },
  no: { title: 'Not right now', tone: 'expense' },
} as const;

/** Cashflow forecast for 30/60/90 days and "Can I afford it?", all on the device. */
export default function ForecastScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const hideAmounts = usePrivacyStore((s) => s.hideAmounts);
  const { data: profile } = useProfile(profileUuid);
  const currency = profile?.baseCurrency ?? 'PHP';
  const { accounts, transactions, balances } = useAccountBalances(profileUuid);
  const { data: obligations } = useObligations(profileUuid);
  const [range, setRange] = useState<Range>('30');
  const [chartWidth, setChartWidth] = useState(0);
  const [price, setPrice] = useState('');
  const [buyOn, setBuyOn] = useState<Date | null>(() => startOfDay(new Date()));
  const [buffer, setBuffer] = useState('');

  const forecast = useMemo(
    () =>
      accounts && balances && transactions && obligations
        ? forecastCashflow({ accounts, balances, transactions, ...obligations, baseCurrency: currency, days: Number(range) })
        : null,
    [accounts, balances, transactions, obligations, currency, range],
  );
  if (!forecast) return null;

  const priceMinor = parseMoney(price);
  const bufferMinor = parseMoney(buffer) ?? defaultBufferMinor(forecast);
  const answer = priceMinor && priceMinor > 0 ? canAfford(forecast, priceMinor, bufferMinor, buyOn ?? undefined) : null;

  // Chart in whole currency units (display only); one point every few days keeps it light.
  const step = Math.max(1, Math.round(forecast.points.length / 30));
  const chartPoints = forecast.points.filter((_, i) => i % step === 0 || i === forecast.points.length - 1);
  const values = chartPoints.map((p) => Math.round(p.balanceMinor / 100));
  const lowestValue = Math.min(0, ...values);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <Segmented<Range>
        options={[
          { value: '30', label: '30 days' },
          { value: '60', label: '60 days' },
          { value: '90', label: '90 days' },
        ]}
        value={range}
        onChange={setRange}
      />

      <Card>
        <View style={[styles.between, { gap: spacing.md }]}>
          <View style={styles.flex}>
            <AppText variant="caption" tone="muted">
              Spendable now
            </AppText>
            <MoneyText amountMinor={forecast.startMinor} currency={currency} variant="heading" />
          </View>
          <View style={styles.flex}>
            <AppText variant="caption" tone="muted">
              In {range} days
            </AppText>
            <MoneyText amountMinor={forecast.endMinor} currency={currency} variant="heading" tone={forecast.endMinor < 0 ? 'expense' : 'default'} />
          </View>
        </View>
        <AppText variant="caption" tone={forecast.lowest.balanceMinor < 0 ? 'danger' : 'muted'}>
          Lowest: <MoneyText amountMinor={forecast.lowest.balanceMinor} currency={currency} variant="caption" tone={forecast.lowest.balanceMinor < 0 ? 'expense' : 'muted'} /> on{' '}
          {dayLabel(forecast.lowest.date)}
        </AppText>
        <View
          style={{ marginTop: spacing.md, overflow: 'hidden' }}
          onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityLabel={`Balance chart over ${range} days`}>
          {chartWidth > 0 && !hideAmounts ? (
            <LineChart
              data={values.map((value) => ({ value }))}
              width={chartWidth - 56}
              height={160}
              adjustToWidth
              initialSpacing={0}
              areaChart
              curved
              hideDataPoints
              thickness={2}
              color={colors.primary}
              startFillColor={colors.primary}
              endFillColor={colors.primary}
              startOpacity={0.25}
              endOpacity={0.02}
              noOfSections={4}
              yAxisLabelWidth={48}
              formatYLabel={(label) => formatCompact(Math.round(Number(label)) * 100, currency)}
              mostNegativeValue={lowestValue < 0 ? lowestValue : undefined}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              rulesColor={colors.border}
              disableScroll
            />
          ) : null}
        </View>
        <AppText variant="caption" tone="muted">
          Counts bills, income, installments and debts you owe on their dates, plus about{' '}
          <MoneyText amountMinor={forecast.dailySpendMinor} currency={currency} variant="caption" tone="muted" /> of everyday spending a day (your
          last 90 days). Cash, bank and e-wallet accounts only.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Can I afford it?</AppText>
        <TextField label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="e.g. 15,000" />
        <DateListField label="When" value={buyOn} onChange={setBuyOn} days={Number(range)} />
        <TextField
          label="Keep at least"
          value={buffer}
          onChangeText={setBuffer}
          keyboardType="decimal-pad"
          placeholder={toMajorString(defaultBufferMinor(forecast))}
        />
        {!buffer ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: -spacing.sm, marginBottom: spacing.sm }}>
            Safety buffer: about two weeks of everyday spending.
          </AppText>
        ) : null}
        {answer ? (
          <View accessibilityLiveRegion="polite">
            <AppText variant="heading" tone={VERDICT[answer.verdict].tone === 'expense' ? 'danger' : undefined} style={answer.verdict === 'yes' ? { color: colors.income } : undefined}>
              {VERDICT[answer.verdict].title}
            </AppText>
            <AppText tone="muted">
              Your lowest balance afterwards would be{' '}
              <MoneyText amountMinor={answer.lowestAfter.balanceMinor} currency={currency} tone={answer.lowestAfter.balanceMinor < 0 ? 'expense' : 'muted'} /> on{' '}
              {dayLabel(answer.lowestAfter.date)}
              {answer.verdict === 'tight' ? ', below your safety buffer.' : answer.verdict === 'no' ? '.' : ', above your safety buffer.'}
            </AppText>
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText variant="heading">Coming up</AppText>
        {forecast.events.length === 0 ? <AppText tone="muted">No bills, income or installments in this period. Add them in Plan.</AppText> : null}
        {forecast.events.map((event, i) => (
          <ListRow
            key={`${event.title}:${event.date.getTime()}:${i}`}
            title={event.title}
            subtitle={dayLabel(event.date)}
            right={<MoneyText amountMinor={event.amountMinor} currency={currency} tone={event.amountMinor > 0 ? 'income' : 'default'} options={{ sign: 'always' }} />}
          />
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
