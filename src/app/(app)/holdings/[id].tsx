import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { HoldingRecord } from '@shared/index';

import { MoneyText } from '@/components/money-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { SelectField } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { PickerSheet } from '@/components/ui/picker-sheet';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { getRecord } from '@/data/repo';
import { useAccounts } from '@/data/repos/accounts';
import { removeHolding, saveHolding, usePortfolio } from '@/data/repos/holdings';
import { confirm } from '@/lib/confirm';
import { parseMoney, toMajorString } from '@/lib/money';
import { formatBps, valueHolding } from '@/lib/portfolio';
import { normalizeQuantity } from '@/lib/quantity';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

type AssetClass = HoldingRecord['assetClass'];

/** Market prices for US stocks are in US dollars; PH stocks and crypto in pesos. */
const CURRENCY_OF: Record<AssetClass, string> = { ph_stock: 'PHP', us_stock: 'USD', crypto: 'PHP' };
const SYMBOL_HINT: Record<AssetClass, string> = { ph_stock: 'e.g. JFC, BDO, SM', us_stock: 'e.g. AAPL, VOO', crypto: 'e.g. BTC, ETH' };

/** Add or edit a holding: what, how many, average cost, and an optional price of your own. */
export default function HoldingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const isNew = id === 'new';
  const { data: accounts } = useAccounts(profileUuid);
  const { data: portfolio } = usePortfolio(profileUuid);
  const [existing, setExisting] = useState<HoldingRecord | null | undefined>(isNew ? null : undefined);
  const [assetClass, setAssetClass] = useState<AssetClass>('ph_stock');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [pickedAccount, setAccountUuid] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    void getRecord('Holding', id).then((h) => {
      setExisting(h);
      if (!h) return;
      setAssetClass(h.assetClass);
      setSymbol(h.symbol);
      setQuantity(h.quantity);
      setAvgCost(toMajorString(h.avgCostMinor, h.currency));
      setManualPrice(h.manualPriceMinor === null ? '' : toMajorString(h.manualPriceMinor, h.currency));
      setAccountUuid(h.accountUuid);
    });
  }, [id, isNew]);

  if (existing === undefined || !accounts || !portfolio) return null;
  // Until one is picked: the first investment account, else the first account.
  const accountUuid = pickedAccount ?? accounts.find((a) => a.type === 'investment')?.uuid ?? accounts[0]?.uuid ?? null;
  const currency = existing?.currency ?? CURRENCY_OF[assetClass];
  const value = existing ? valueHolding(existing, portfolio.prices) : null;

  async function onSave() {
    const cleanSymbol = symbol.trim().toUpperCase();
    const qty = normalizeQuantity(quantity);
    const costMinor = parseMoney(avgCost, currency);
    const priceMinor = manualPrice.trim() ? parseMoney(manualPrice, currency) : null;
    if (!/^[A-Z0-9.-]{1,20}$/.test(cleanSymbol)) return setError('Enter the ticker symbol, like JFC or BTC.');
    if (!qty) return setError('Enter how many you own (up to 12 decimals).');
    if (costMinor === null || costMinor < 0) return setError('Enter your average cost per share or coin.');
    if (manualPrice.trim() && (priceMinor === null || priceMinor < 0)) return setError('Your price isn’t a valid amount.');
    if (!accountUuid) return setError('Choose the account it’s held in.');
    setError(null);
    await saveHolding({
      uuid: existing?.uuid,
      profileUuid,
      accountUuid,
      symbol: cleanSymbol,
      assetClass,
      quantity: qty,
      avgCostMinor: costMinor,
      currency,
      manualPriceMinor: priceMinor,
    });
    router.back();
  }

  async function onDelete() {
    if (!existing) return;
    if (!(await confirm({ title: `Delete ${existing.symbol}?`, message: 'Your transactions are not affected.', confirmText: 'Delete', destructive: true }))) return;
    await removeHolding(existing.uuid);
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      {value && value.marketMinor !== null ? (
        <Card>
          <AppText variant="label" tone="muted">
            Value {value.priceSource === 'manual' ? '(your price)' : value.priceDate ? `(market, ${value.priceDate})` : ''}
          </AppText>
          <MoneyText amountMinor={value.marketMinor} currency={currency} variant="title" />
          {value.plMinor !== null ? (
            <AppText variant="caption" tone="muted">
              <MoneyText amountMinor={value.plMinor} currency={currency} variant="caption" tone={value.plMinor >= 0 ? 'income' : 'expense'} options={{ sign: 'always' }} />
              {value.plBps !== null ? ` (${formatBps(value.plBps)})` : ''}
            </AppText>
          ) : null}
        </Card>
      ) : null}
      <View>
        <Segmented<AssetClass>
          options={[
            { value: 'ph_stock', label: 'PH stock' },
            { value: 'us_stock', label: 'US stock' },
            { value: 'crypto', label: 'Crypto' },
          ]}
          value={assetClass}
          onChange={(next) => {
            // The currency follows the asset class for new holdings only.
            if (!existing) setAssetClass(next);
          }}
        />
        <View style={{ height: spacing.md }} />
        <TextField label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" autoCorrect={false} placeholder={SYMBOL_HINT[assetClass]} />
        <TextField label="How many" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="e.g. 100 or 0.05" />
        <TextField label={`Average cost per unit (${currency})`} value={avgCost} onChangeText={setAvgCost} keyboardType="decimal-pad" placeholder="e.g. 250" />
        <TextField
          label={`Your price per unit (${currency}, optional)`}
          value={manualPrice}
          onChangeText={setManualPrice}
          keyboardType="decimal-pad"
          placeholder="Used when there’s no market price"
        />
        <SelectField label="Held in" value={accounts.find((a) => a.uuid === accountUuid)?.name} placeholder="Choose an account" onPress={() => setPicking(true)} />
        <View style={{ gap: spacing.sm }}>
          <Button title={isNew ? 'Add holding' : 'Save changes'} onPress={() => void onSave()} />
          {existing ? <Button title="Delete holding" variant="ghost" onPress={() => void onDelete()} /> : null}
        </View>
      </View>

      <PickerSheet visible={picking} title="Held in" onClose={() => setPicking(false)}>
        {accounts.map((a) => (
          <ListRow
            key={a.uuid}
            title={a.name}
            subtitle={a.type === 'investment' ? 'Investment account' : undefined}
            color={a.color}
            onPress={() => {
              setAccountUuid(a.uuid);
              setPicking(false);
            }}
          />
        ))}
      </PickerSheet>
    </ScrollView>
  );
}
