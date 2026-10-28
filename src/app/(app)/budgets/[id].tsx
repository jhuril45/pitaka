import { startOfMonth } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import type { BudgetRecord } from '@shared/index';

import { DayStepper } from '@/components/day-stepper';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { SelectField } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { PickerSheet } from '@/components/ui/picker-sheet';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { getRecord } from '@/data/repo';
import { categoryLabel, categoryTree, useCategories } from '@/data/repos/categories';
import { removeBudget, saveBudget } from '@/data/repos/plans';
import { confirm } from '@/lib/confirm';
import { parseMoney, toMajorString } from '@/lib/money';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

type Period = BudgetRecord['period'];

export default function BudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const { data: categories } = useCategories(profileUuid);
  const isNew = id === 'new';
  const [existing, setExisting] = useState<BudgetRecord | null | undefined>(isNew ? null : undefined);
  const [categoryUuid, setCategoryUuid] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('monthly');
  const [amount, setAmount] = useState('');
  const [customDays, setCustomDays] = useState('14');
  const [rollover, setRollover] = useState(false);
  const [startDate, setStartDate] = useState(() => startOfMonth(new Date()));
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    void getRecord('Budget', id).then((b) => {
      setExisting(b);
      if (!b) return;
      setCategoryUuid(b.categoryUuid);
      setPeriod(b.period);
      setAmount(toMajorString(b.amountMinor));
      setCustomDays(String(b.customDays ?? 14));
      setRollover(b.rollover);
      setStartDate(new Date(b.startDate));
    });
  }, [id, isNew]);

  if (existing === undefined || !categories) return null;

  async function onSave() {
    const amountMinor = parseMoney(amount);
    if (amountMinor === null || amountMinor <= 0) return setError('Enter the budget amount, like 5,000 or 5k.');
    const days = Number(customDays);
    if (period === 'custom' && (!Number.isInteger(days) || days < 1 || days > 366)) return setError('A custom period is 1 to 366 days.');
    setError(null);
    setSaving(true);
    try {
      await saveBudget({
        uuid: existing?.uuid,
        profileUuid,
        categoryUuid,
        period,
        amountMinor,
        rollover,
        startDate: startDate.toISOString(),
        customDays: period === 'custom' ? days : null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!(await confirm({ title: 'Delete budget?', message: 'Your transactions are not affected.', confirmText: 'Delete', destructive: true }))) return;
    await removeBudget(existing!.uuid);
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      <SelectField
        label="Category"
        value={categoryUuid ? categoryLabel(categories, categoryUuid) : 'Everything (all spending)'}
        placeholder="Everything"
        onPress={() => setPicking(true)}
      />
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        Period
      </AppText>
      <Segmented<Period>
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'custom', label: 'Custom' },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <View style={{ height: spacing.md }} />
      {period === 'custom' ? (
        <TextField label="Days in each period" value={customDays} onChangeText={setCustomDays} keyboardType="number-pad" />
      ) : null}
      <TextField label="Limit per period" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 5k" />
      <DayStepper value={startDate} onChange={setStartDate} />
      <AppText variant="caption" tone="muted" style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}>
        Periods start on this day ({period === 'monthly' ? 'same day each month' : period === 'weekly' ? 'every 7 days' : `every ${customDays || '?'} days`}).
      </AppText>
      <View style={[styles.row, { gap: spacing.md, marginBottom: spacing.lg }]}>
        <View style={styles.flex}>
          <AppText>Roll over</AppText>
          <AppText variant="caption" tone="muted">
            Carry what’s left (or overspent) into the next period.
          </AppText>
        </View>
        <Switch accessibilityLabel="Roll over" value={rollover} onValueChange={setRollover} trackColor={{ true: colors.primary }} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button title={isNew ? 'Add budget' : 'Save changes'} onPress={() => void onSave()} loading={saving} />
        {existing ? <Button title="Delete budget" variant="ghost" onPress={() => void onDelete()} /> : null}
      </View>

      <PickerSheet visible={picking} title="Budget for" onClose={() => setPicking(false)}>
        <ListRow
          title="Everything (all spending)"
          onPress={() => {
            setCategoryUuid(null);
            setPicking(false);
          }}
        />
        {categoryTree(categories, 'expense').map((node) => (
          <View key={node.uuid}>
            <ListRow
              title={node.name}
              subtitle={node.children.length ? 'Includes its subcategories' : undefined}
              color={node.color}
              onPress={() => {
                setCategoryUuid(node.uuid);
                setPicking(false);
              }}
            />
            {node.children.map((child) => (
              <ListRow
                key={child.uuid}
                title={child.name}
                indent
                onPress={() => {
                  setCategoryUuid(child.uuid);
                  setPicking(false);
                }}
              />
            ))}
          </View>
        ))}
      </PickerSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
