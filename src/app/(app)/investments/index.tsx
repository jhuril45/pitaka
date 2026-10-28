import { format } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { ProgressBar } from '@/components/progress-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { AppText } from '@/components/ui/text';
import { refreshPrices, usePortfolio } from '@/data/repos/holdings';
import { formatMoney } from '@/lib/money';
import { ASSET_CLASS_LABEL, formatBps, portfolioTotals, valueHolding } from '@/lib/portfolio';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

/** Holdings with market value, cost, profit/loss and allocation. */
export default function InvestmentsScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const { data } = usePortfolio(profileUuid);
  const [status, setStatus] = useState<'idle' | 'loading' | 'offline'>('idle');

  const values = useMemo(() => (data ? data.holdings.map((h) => valueHolding(h, data.prices)) : []), [data]);
  const totals = useMemo(() => portfolioTotals(values), [values]);
  const holdingCount = data?.holdings.length ?? 0;

  async function update() {
    if (!data?.holdings.length) return;
    setStatus('loading');
    try {
      await refreshPrices(data.holdings);
      setStatus('idle');
    } catch {
      setStatus('offline');
    }
  }

  // Refresh quietly when the screen opens (and when holdings are added or removed).
  const refreshQuietly = useEffectEvent(() => refreshPrices(data?.holdings ?? []));
  useEffect(() => {
    if (!holdingCount) return;
    let active = true;
    refreshQuietly()
      .then(() => active && setStatus('idle'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, [holdingCount]);

  if (!data) return null;
  const newest = values.map((v) => v.priceDate).filter((d): d is string => !!d).sort().pop();

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      {totals.map((t) => (
        <Card key={t.currency}>
          <AppText variant="label" tone="muted">
            Portfolio value{totals.length > 1 ? ` (${t.currency})` : ''}
          </AppText>
          <MoneyText amountMinor={t.valueMinor} currency={t.currency} variant="display" />
          <AppText variant="caption" tone="muted">
            <MoneyText
              amountMinor={t.plMinor}
              currency={t.currency}
              variant="caption"
              tone={t.plMinor > 0 ? 'income' : t.plMinor < 0 ? 'expense' : 'muted'}
              options={{ sign: 'always' }}
            />
            {t.plBps !== null ? ` (${formatBps(t.plBps)})` : ''} on <MoneyText amountMinor={t.costMinor} currency={t.currency} variant="caption" tone="muted" /> invested
          </AppText>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {t.allocation.map((a) => (
              <View key={a.assetClass}>
                <View style={styles.between}>
                  <AppText variant="caption">{ASSET_CLASS_LABEL[a.assetClass]}</AppText>
                  <AppText variant="caption" tone="muted">
                    {Math.round(a.shareBps / 100)}%
                  </AppText>
                </View>
                <ProgressBar bps={a.shareBps} color={colors.primary} />
              </View>
            ))}
          </View>
        </Card>
      ))}

      <View style={styles.between}>
        <AppText variant="heading">Holdings</AppText>
        <Button title="Add" variant="ghost" accessibilityLabel="Add holding" onPress={() => router.push({ pathname: '/holdings/[id]', params: { id: 'new' } })} style={styles.inline} />
      </View>
      <Card>
        {holdingCount === 0 ? (
          <AppText tone="muted">Add stocks or crypto you own to see their value and profit or loss. Prices update from the market; you can also enter your own.</AppText>
        ) : null}
        {values.map((v) => (
          <ListRow
            key={v.holding.uuid}
            title={v.holding.symbol}
            subtitle={
              v.priceMinor === null
                ? `${v.holding.quantity} · no price yet`
                : `${v.holding.quantity} × ${(v.priceSource === 'manual' ? 'your price ' : '') + formatMoney(v.priceMinor, v.currency)}`
            }
            onPress={() => router.push({ pathname: '/holdings/[id]', params: { id: v.holding.uuid } })}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <MoneyText amountMinor={v.marketMinor ?? v.costMinor} currency={v.currency} />
                {v.plBps !== null ? (
                  <AppText variant="caption" tone={v.plBps > 0 ? undefined : v.plBps < 0 ? 'danger' : 'muted'} style={v.plBps > 0 ? { color: colors.income } : undefined}>
                    {formatBps(v.plBps)}
                  </AppText>
                ) : null}
              </View>
            }
          />
        ))}
      </Card>

      {holdingCount ? (
        <View style={{ gap: spacing.sm }}>
          <Button title={status === 'loading' ? 'Updating prices…' : 'Update prices'} variant="outline" loading={status === 'loading'} onPress={() => void update()} />
          <AppText variant="caption" tone={status === 'offline' ? 'danger' : 'muted'} style={{ textAlign: 'center' }}>
            {status === 'offline'
              ? 'Couldn’t get new prices right now. Showing the last saved ones.'
              : newest
                ? `Market prices as of ${format(new Date(`${newest}T00:00:00`), 'MMM d, yyyy')}. US stock prices need the server’s price key; otherwise use your own price.`
                : 'No market prices yet. You can enter your own price on each holding.'}
          </AppText>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inline: { minHeight: 36, paddingHorizontal: 8 },
});
