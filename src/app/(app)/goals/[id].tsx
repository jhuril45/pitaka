import { addMonths, format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { GoalRecord } from '@shared/index';

import { MoneyText } from '@/components/money-text';
import { ProgressBar } from '@/components/progress-bar';
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
import { removeContribution, removeGoal, saveContribution, saveGoal, useGoals } from '@/data/repos/plans';
import { useAccountBalances } from '@/data/repos/use-balances';
import { goalStatus } from '@/lib/budgets';
import { confirm } from '@/lib/confirm';
import { parseMoney, toMajorString } from '@/lib/money';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const DEADLINES = [3, 6, 12, 24];

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const isNew = id === 'new';
  const { data } = useGoals(profileUuid);
  const { accounts, balances } = useAccountBalances(profileUuid);
  const [existing, setExisting] = useState<GoalRecord | null | undefined>(isNew ? null : undefined);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [linkedAccountUuid, setLinked] = useState<string | null>(null);
  const [picker, setPicker] = useState<'date' | 'account' | null>(null);
  const [move, setMove] = useState<'add' | 'withdraw'>('add');
  const [moveAmount, setMoveAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    void getRecord('Goal', id).then((g) => {
      setExisting(g);
      if (!g) return;
      setName(g.name);
      setTarget(toMajorString(g.targetMinor));
      setTargetDate(g.targetDate);
      setLinked(g.linkedAccountUuid);
    });
  }, [id, isNew]);

  if (existing === undefined || !data || !accounts) return null;
  const contributions = existing ? data.contributions.filter((c) => c.goalUuid === existing.uuid) : [];
  const status = existing ? goalStatus(existing, data.contributions, balances) : null;

  async function onSave() {
    const targetMinor = parseMoney(target);
    if (!name.trim()) return setError('Name the goal.');
    if (targetMinor === null || targetMinor <= 0) return setError('Enter a target amount, like 50k.');
    setError(null);
    await saveGoal({ uuid: existing?.uuid, profileUuid, name: name.trim(), targetMinor, targetDate, linkedAccountUuid, icon: 'goal' });
    router.back();
  }

  async function onMove() {
    const minor = parseMoney(moveAmount);
    if (minor === null || minor <= 0) return setError('Enter an amount.');
    setError(null);
    await saveContribution({
      profileUuid,
      goalUuid: existing!.uuid,
      amountMinor: move === 'add' ? minor : -minor,
      occurredAt: new Date().toISOString(),
    });
    setMoveAmount('');
  }

  async function onDelete() {
    if (!(await confirm({ title: 'Delete goal?', message: 'Its contribution history is deleted too.', confirmText: 'Delete', destructive: true }))) return;
    await removeGoal(existing!.uuid, data!.contributions);
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      {status && existing ? (
        <Card>
          <AppText variant="label" tone="muted">
            Saved
          </AppText>
          <MoneyText amountMinor={status.savedMinor} variant="title" />
          <ProgressBar bps={status.progressBps} color={status.reached ? colors.income : colors.primary} />
          <AppText variant="caption" tone="muted">
            {status.reached ? 'Goal reached — nice!' : null}
            {!status.reached && status.perMonthMinor !== null ? (
              <>
                Put aside <MoneyText amountMinor={status.perMonthMinor} variant="caption" tone="muted" /> a month to reach it by{' '}
                {format(new Date(existing.targetDate!), 'MMM yyyy')}.
              </>
            ) : null}
            {!status.reached && status.perMonthMinor === null ? (
              <>
                <MoneyText amountMinor={status.remainingMinor} variant="caption" tone="muted" /> to go.
              </>
            ) : null}
          </AppText>
        </Card>
      ) : null}

      <View>
        <TextField label="Goal" value={name} onChangeText={setName} placeholder="e.g. Emergency fund" />
        <TextField label="Target amount" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="e.g. 50k" />
        <SelectField
          label="Reach it by"
          value={targetDate ? format(new Date(targetDate), 'MMMM yyyy') : 'No deadline'}
          placeholder="No deadline"
          onPress={() => setPicker('date')}
        />
        <SelectField
          label="Track an account"
          value={linkedAccountUuid ? (accounts.find((a) => a.uuid === linkedAccountUuid)?.name ?? 'Deleted account') : 'No — I’ll log contributions'}
          placeholder="No"
          onPress={() => setPicker('account')}
        />
        <View style={{ gap: spacing.sm }}>
          <Button title={isNew ? 'Add goal' : 'Save changes'} onPress={() => void onSave()} />
          {existing ? <Button title="Delete goal" variant="ghost" onPress={() => void onDelete()} /> : null}
        </View>
      </View>

      {existing && !existing.linkedAccountUuid ? (
        <Card>
          <AppText variant="heading">Contributions</AppText>
          <Segmented
            options={[
              { value: 'add', label: 'Add money' },
              { value: 'withdraw', label: 'Withdraw' },
            ]}
            value={move}
            onChange={setMove}
          />
          <View style={[styles.row, { gap: spacing.sm }]}>
            <View style={styles.flex}>
              <TextField value={moveAmount} onChangeText={setMoveAmount} keyboardType="decimal-pad" placeholder="Amount" />
            </View>
            <Button title={move === 'add' ? 'Add' : 'Withdraw'} onPress={() => void onMove()} style={{ marginBottom: spacing.md }} />
          </View>
          {contributions.map((c) => (
            <ListRow
              key={c.uuid}
              title={format(new Date(c.occurredAt), 'MMM d, yyyy')}
              right={<MoneyText amountMinor={c.amountMinor} tone={c.amountMinor < 0 ? 'expense' : 'income'} options={{ sign: 'always' }} />}
              onLongPress={async () => {
                if (await confirm({ title: 'Remove this entry?', message: 'It no longer counts toward the goal.', confirmText: 'Remove', destructive: true })) {
                  await removeContribution(c.uuid);
                }
              }}
            />
          ))}
          {contributions.length ? (
            <AppText variant="caption" tone="muted">
              Long-press an entry to remove it.
            </AppText>
          ) : null}
        </Card>
      ) : null}

      <PickerSheet visible={picker === 'date'} title="Reach it by" onClose={() => setPicker(null)}>
        <ListRow
          title="No deadline"
          onPress={() => {
            setTargetDate(null);
            setPicker(null);
          }}
        />
        {DEADLINES.map((months) => {
          const date = addMonths(new Date(), months);
          return (
            <ListRow
              key={months}
              title={format(date, 'MMMM yyyy')}
              subtitle={`In ${months} months`}
              onPress={() => {
                setTargetDate(date.toISOString());
                setPicker(null);
              }}
            />
          );
        })}
      </PickerSheet>
      <PickerSheet visible={picker === 'account'} title="Track an account" onClose={() => setPicker(null)}>
        <ListRow
          title="No — I’ll log contributions"
          onPress={() => {
            setLinked(null);
            setPicker(null);
          }}
        />
        {accounts.map((a) => (
          <ListRow
            key={a.uuid}
            title={a.name}
            subtitle="Progress follows this account’s balance"
            color={a.color}
            onPress={() => {
              setLinked(a.uuid);
              setPicker(null);
            }}
          />
        ))}
      </PickerSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
