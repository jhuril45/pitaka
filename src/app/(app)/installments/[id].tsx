import { format, startOfDay } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { InstallmentRecord } from '@shared/index';

import { CategoryPickerSheet } from '@/components/category-picker-sheet';
import { DateListField } from '@/components/date-list-field';
import { MoneyText } from '@/components/money-text';
import { ProgressBar } from '@/components/progress-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { SelectField } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { PickerSheet } from '@/components/ui/picker-sheet';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { getRecord } from '@/data/repo';
import { useAccounts } from '@/data/repos/accounts';
import { categoryLabel, useCategories } from '@/data/repos/categories';
import { removeInstallment, saveInstallment } from '@/data/repos/obligations';
import { confirm } from '@/lib/confirm';
import { allocate, parseMoney, ratioBps, toMajorString } from '@/lib/money';
import { installmentStatus } from '@/lib/schedules';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

/** A purchase paid in equal monthly charges (e.g. a 0% credit card installment). */
export default function InstallmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const isNew = id === 'new';
  const { data: accounts } = useAccounts(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const [existing, setExisting] = useState<InstallmentRecord | null | undefined>(isNew ? null : undefined);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [months, setMonths] = useState('12');
  const [startDate, setStartDate] = useState<Date | null>(() => startOfDay(new Date()));
  const [pickedAccount, setAccountUuid] = useState<string | null>(null);
  const [categoryUuid, setCategoryUuid] = useState<string | null>(null);
  const [picking, setPicking] = useState<'account' | 'category' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    void getRecord('Installment', id).then((i) => {
      setExisting(i);
      if (!i) return;
      setName(i.name);
      setTotal(toMajorString(i.totalMinor));
      setMonths(String(i.months));
      setStartDate(new Date(i.startDate));
      setAccountUuid(i.accountUuid);
      setCategoryUuid(i.categoryUuid);
    });
  }, [id, isNew]);

  if (existing === undefined || !accounts || !categories) return null;
  // Until one is picked: the first credit card, else the first account.
  const accountUuid = pickedAccount ?? accounts.find((a) => a.type === 'credit_card')?.uuid ?? accounts[0]?.uuid ?? null;
  const totalMinor = parseMoney(total);
  const monthCount = Number(months);
  const validMonths = Number.isInteger(monthCount) && monthCount >= 1 && monthCount <= 120;
  const monthly = totalMinor && totalMinor > 0 && validMonths ? allocate(totalMinor, monthCount)[0] : null;
  const status = existing ? installmentStatus(existing) : null;

  async function onSave() {
    if (!name.trim()) return setError('What did you buy?');
    if (totalMinor === null || totalMinor <= 0) return setError('Enter the total price.');
    if (!validMonths) return setError('Months is 1 to 120.');
    if (!startDate) return setError('Choose the first charge date.');
    if (!accountUuid) return setError('Choose the account it’s charged to.');
    setError(null);
    await saveInstallment({
      uuid: existing?.uuid,
      profileUuid,
      name: name.trim(),
      accountUuid,
      totalMinor,
      months: monthCount,
      startDate: startDate.toISOString(),
      monthlyMinor: monthly!,
      categoryUuid,
    });
    router.back();
  }

  async function onDelete() {
    if (!(await confirm({ title: 'Delete installment?', message: 'Charges already recorded stay; no new ones are created.', confirmText: 'Delete', destructive: true })))
      return;
    await removeInstallment(existing!.uuid);
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      {status && existing ? (
        <Card>
          <AppText variant="label" tone="muted">
            {status.done ? 'Fully paid' : `${status.paidMonths} of ${existing.months} months paid · left`}
          </AppText>
          <MoneyText amountMinor={status.remainingMinor} variant="title" tone={status.done ? 'income' : 'default'} />
          <ProgressBar bps={ratioBps(status.paidMinor, existing.totalMinor)} color={status.done ? colors.income : colors.primary} />
          {status.next ? (
            <AppText variant="caption" tone="muted">
              Next charge {format(status.next.date, 'MMM d, yyyy')}
            </AppText>
          ) : null}
        </Card>
      ) : null}
      <View>
        <TextField label="What you bought" value={name} onChangeText={setName} placeholder="e.g. Laptop" />
        <TextField label="Total price" value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="e.g. 48,000" />
        <TextField label="Months" value={months} onChangeText={setMonths} keyboardType="number-pad" />
        {monthly ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}>
            About <MoneyText amountMinor={monthly} variant="caption" tone="muted" /> a month.
          </AppText>
        ) : null}
        <DateListField label="First charge" value={startDate} onChange={setStartDate} fromDays={-365} days={425} />
        <SelectField label="Charged to" value={accounts.find((a) => a.uuid === accountUuid)?.name} placeholder="Choose an account" onPress={() => setPicking('account')} />
        <SelectField label="Category" value={categoryUuid ? categoryLabel(categories, categoryUuid) : 'None'} placeholder="None" onPress={() => setPicking('category')} />
        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
          Each month’s charge is recorded automatically on its date (charges from the last two months are filled in now).
        </AppText>
        <View style={{ gap: spacing.sm }}>
          <Button title={isNew ? 'Add installment' : 'Save changes'} onPress={() => void onSave()} />
          {existing ? <Button title="Delete installment" variant="ghost" onPress={() => void onDelete()} /> : null}
        </View>
      </View>

      <PickerSheet visible={picking === 'account'} title="Charged to" onClose={() => setPicking(null)}>
        {accounts.map((a) => (
          <ListRow
            key={a.uuid}
            title={a.name}
            color={a.color}
            onPress={() => {
              setAccountUuid(a.uuid);
              setPicking(null);
            }}
          />
        ))}
      </PickerSheet>
      <CategoryPickerSheet
        visible={picking === 'category'}
        title="Category"
        categories={categories}
        type="expense"
        noneLabel="None"
        onPick={setCategoryUuid}
        onClose={() => setPicking(null)}
      />
    </ScrollView>
  );
}
