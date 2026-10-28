import { format, startOfDay } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import type { RecurringRuleRecord } from '@shared/index';

import { CategoryPickerSheet } from '@/components/category-picker-sheet';
import { DateListField } from '@/components/date-list-field';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { SelectField } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { PickerSheet } from '@/components/ui/picker-sheet';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { getRecord } from '@/data/repo';
import { useAccounts } from '@/data/repos/accounts';
import { categoryLabel, useCategories } from '@/data/repos/categories';
import { removeRecurringRule, saveRecurringRule } from '@/data/repos/obligations';
import { requestNotificationPermission, scheduleReminders } from '@/features/reminders/reminders';
import { confirm } from '@/lib/confirm';
import { parseMoney, toMajorString } from '@/lib/money';
import { nextOccurrence } from '@/lib/schedules';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

type Kind = RecurringRuleRecord['kind'];
type Frequency = RecurringRuleRecord['frequency'];

const REMIND_OPTIONS = [0, 1, 3, 7] as const;

/** A recurring bill, subscription or income: reminders and optional auto-recording. */
export default function RecurringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const isNew = id === 'new';
  const { data: accounts } = useAccounts(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const [existing, setExisting] = useState<RecurringRuleRecord | null | undefined>(isNew ? null : undefined);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('bill');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [firstDate, setFirstDate] = useState<Date | null>(() => startOfDay(new Date()));
  const [pickedAccount, setAccountUuid] = useState<string | null>(null);
  const [categoryUuid, setCategoryUuid] = useState<string | null>(null);
  const [remindDaysBefore, setRemindDaysBefore] = useState(1);
  const [autoPost, setAutoPost] = useState(true);
  const [picking, setPicking] = useState<'account' | 'category' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    void getRecord('RecurringRule', id).then((r) => {
      setExisting(r);
      if (!r) return;
      setName(r.name);
      setKind(r.kind);
      setAmount(toMajorString(r.template.amountMinor));
      setFrequency(r.frequency);
      setFirstDate(new Date(r.nextRunAt));
      setAccountUuid(r.template.accountUuid);
      setCategoryUuid(r.template.categoryUuid);
      setRemindDaysBefore(r.remindDaysBefore);
      setAutoPost(r.autoPost);
    });
  }, [id, isNew]);

  if (existing === undefined || !accounts || !categories) return null;
  const accountUuid = pickedAccount ?? accounts[0]?.uuid ?? null;
  const type = kind === 'income' ? 'income' : 'expense';
  const next = existing ? nextOccurrence(existing) : null;

  async function onSave() {
    const amountMinor = parseMoney(amount);
    if (!name.trim()) return setError('Give it a name, like Netflix or Rent.');
    if (amountMinor === null || amountMinor <= 0) return setError('Enter the amount.');
    if (!firstDate) return setError('Choose the first date.');
    if (!accountUuid) return setError('Choose an account.');
    setError(null);
    await saveRecurringRule({
      uuid: existing?.uuid,
      profileUuid,
      name: name.trim(),
      kind,
      template: { type, amountMinor, accountUuid, toAccountUuid: null, categoryUuid, note: '', merchant: name.trim() },
      frequency,
      interval: 1,
      byMonthDay: frequency === 'monthly' ? firstDate.getDate() : null,
      nextRunAt: firstDate.toISOString(),
      endAt: existing?.endAt ?? null,
      remindDaysBefore,
      autoPost,
    });
    if (await requestNotificationPermission()) await scheduleReminders(profileUuid);
    router.back();
  }

  async function onDelete() {
    if (!(await confirm({ title: 'Delete recurring item?', message: 'Transactions already recorded stay.', confirmText: 'Delete', destructive: true }))) return;
    await removeRecurringRule(existing!.uuid);
    await scheduleReminders(profileUuid);
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      {existing ? (
        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
          {next ? `Next on ${format(next, 'EEE, MMM d, yyyy')}` : 'Ended'}
        </AppText>
      ) : null}
      <Segmented<Kind>
        options={[
          { value: 'bill', label: 'Bill' },
          { value: 'subscription', label: 'Subscription' },
          { value: 'income', label: 'Income' },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategoryUuid(null);
        }}
      />
      <View style={{ height: spacing.md }} />
      <TextField label="Name" value={name} onChangeText={setName} placeholder={kind === 'income' ? 'e.g. Salary' : 'e.g. Meralco'} />
      <TextField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 2,500" />
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        Repeats
      </AppText>
      <Segmented<Frequency>
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
        value={frequency}
        onChange={setFrequency}
      />
      <View style={{ height: spacing.md }} />
      <DateListField label={existing ? 'Starting from' : 'Next date'} value={firstDate} onChange={setFirstDate} fromDays={-31} days={400} />
      <SelectField label={kind === 'income' ? 'Paid into' : 'Paid from'} value={accounts.find((a) => a.uuid === accountUuid)?.name} placeholder="Choose an account" onPress={() => setPicking('account')} />
      <SelectField label="Category" value={categoryUuid ? categoryLabel(categories, categoryUuid) : 'None'} placeholder="None" onPress={() => setPicking('category')} />
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        Remind me
      </AppText>
      <Segmented<string>
        options={REMIND_OPTIONS.map((d) => ({ value: String(d), label: d === 0 ? 'Same day' : `${d}d before` }))}
        value={String(remindDaysBefore)}
        onChange={(v) => setRemindDaysBefore(Number(v))}
      />
      <View style={[styles.row, { gap: spacing.md, marginVertical: spacing.lg }]}>
        <View style={styles.flex}>
          <AppText>Record automatically</AppText>
          <AppText variant="caption" tone="muted">
            Add the transaction on each date. Turn off to only get a reminder.
          </AppText>
        </View>
        <Switch accessibilityLabel="Record automatically" value={autoPost} onValueChange={setAutoPost} trackColor={{ true: colors.primary }} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button title={isNew ? 'Add' : 'Save changes'} onPress={() => void onSave()} />
        {existing ? <Button title="Delete" variant="ghost" onPress={() => void onDelete()} /> : null}
      </View>

      <PickerSheet visible={picking === 'account'} title="Account" onClose={() => setPicking(null)}>
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
        type={type}
        noneLabel="None"
        onPick={setCategoryUuid}
        onClose={() => setPicking(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
