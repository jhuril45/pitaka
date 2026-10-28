import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { DebtRecord } from '@shared/index';

import { DateListField } from '@/components/date-list-field';
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
import { useAccounts } from '@/data/repos/accounts';
import { recordDebtPayment, removeDebt, saveDebt, useObligations } from '@/data/repos/obligations';
import { confirm } from '@/lib/confirm';
import { parseMoney, ratioBps, toMajorString } from '@/lib/money';
import { debtStatus } from '@/lib/schedules';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

type Direction = DebtRecord['direction'];

/** A debt: who, how much, when — plus its payments. /debts/new?direction=owed_to_me&counterparty=… */
export default function DebtScreen() {
  const params = useLocalSearchParams<{ id: string; direction?: Direction; counterparty?: string }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const isNew = params.id === 'new';
  const { data } = useObligations(profileUuid);
  const { data: accounts } = useAccounts(profileUuid);
  const [existing, setExisting] = useState<DebtRecord | null | undefined>(isNew ? null : undefined);
  const [direction, setDirection] = useState<Direction>(params.direction ?? 'i_owe');
  const [counterparty, setCounterparty] = useState(params.counterparty ?? '');
  const [principal, setPrincipal] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payAccount, setPayAccount] = useState<string | null>(null);
  const [pickAccount, setPickAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    void getRecord('Debt', params.id).then((d) => {
      setExisting(d);
      if (!d) return;
      setDirection(d.direction);
      setCounterparty(d.counterparty);
      setPrincipal(toMajorString(d.principalMinor));
      setDueDate(d.dueDate ? new Date(d.dueDate) : null);
      setNote(d.note);
    });
  }, [params.id, isNew]);

  if (existing === undefined || !data || !accounts) return null;
  const status = existing ? debtStatus(existing, data.payments) : null;
  const payments = existing ? data.payments.filter((p) => p.debtUuid === existing.uuid) : [];

  async function onSave() {
    const principalMinor = parseMoney(principal);
    if (!counterparty.trim()) return setError('Who is it with?');
    if (principalMinor === null || principalMinor <= 0) return setError('Enter the amount.');
    setError(null);
    await saveDebt({
      uuid: existing?.uuid,
      profileUuid,
      direction,
      counterparty: counterparty.trim(),
      principalMinor,
      dueDate: dueDate?.toISOString() ?? null,
      settledAt: existing?.settledAt ?? null,
      note: note.trim(),
    });
    router.back();
  }

  async function onPay() {
    const amountMinor = parseMoney(payAmount);
    if (amountMinor === null || amountMinor <= 0) return setError('Enter the payment amount.');
    if (status && amountMinor > status.remainingMinor) return setError('That’s more than what’s left.');
    setError(null);
    await recordDebtPayment({
      debt: existing!,
      amountMinor,
      occurredAt: new Date().toISOString(),
      accountUuid: payAccount,
      remainingBeforeMinor: status!.remainingMinor,
    });
    setPayAmount('');
  }

  async function onDelete() {
    if (!(await confirm({ title: 'Delete debt?', message: 'Its payments are deleted too (recorded transactions stay).', confirmText: 'Delete', destructive: true })))
      return;
    await removeDebt(existing!.uuid, data!.payments);
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      {status && existing ? (
        <Card>
          <AppText variant="label" tone="muted">
            {existing.direction === 'i_owe' ? `You still owe ${existing.counterparty}` : `${existing.counterparty} still owes you`}
          </AppText>
          <MoneyText amountMinor={status.remainingMinor} variant="title" tone={status.settled ? 'income' : 'default'} />
          <ProgressBar bps={ratioBps(status.paidMinor, existing.principalMinor)} color={status.settled ? colors.income : colors.primary} />
          <AppText variant="caption" tone={status.overdue ? 'danger' : 'muted'}>
            {status.settled ? 'Settled' : status.overdue ? `Overdue since ${format(new Date(existing.dueDate!), 'MMM d')}` : existing.dueDate ? `Due ${format(new Date(existing.dueDate), 'MMM d, yyyy')}` : 'No due date'}
          </AppText>
        </Card>
      ) : null}

      <View>
        <Segmented<Direction>
          options={[
            { value: 'i_owe', label: 'I owe' },
            { value: 'owed_to_me', label: 'Owed to me' },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <View style={{ height: spacing.md }} />
        <TextField label={direction === 'i_owe' ? 'Who you owe' : 'Who owes you'} value={counterparty} onChangeText={setCounterparty} placeholder="e.g. Mark" />
        <TextField label="Amount" value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" placeholder="e.g. 5,000" />
        <DateListField label="Due date" value={dueDate} onChange={setDueDate} optional days={120} />
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
        <View style={{ gap: spacing.sm }}>
          <Button title={isNew ? 'Add debt' : 'Save changes'} onPress={() => void onSave()} />
          {existing ? <Button title="Delete debt" variant="ghost" onPress={() => void onDelete()} /> : null}
        </View>
      </View>

      {existing && status && !status.settled ? (
        <Card>
          <AppText variant="heading">{existing.direction === 'i_owe' ? 'Record a payment' : 'Record a repayment'}</AppText>
          <TextField value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="Amount" />
          <SelectField
            label="Also record it in"
            value={payAccount ? accounts.find((a) => a.uuid === payAccount)?.name : 'Don’t record a transaction'}
            placeholder="Don’t record"
            onPress={() => setPickAccount(true)}
          />
          <Button title="Record" onPress={() => void onPay()} />
        </Card>
      ) : null}
      {payments.length ? (
        <Card>
          <AppText variant="heading">Payments</AppText>
          {payments.map((p) => (
            <ListRow key={p.uuid} title={format(new Date(p.occurredAt), 'MMM d, yyyy')} subtitle={p.transactionUuid ? 'Recorded as a transaction' : undefined} right={<MoneyText amountMinor={p.amountMinor} />} />
          ))}
        </Card>
      ) : null}

      <PickerSheet visible={pickAccount} title="Also record it in" onClose={() => setPickAccount(false)}>
        <ListRow
          title="Don’t record a transaction"
          onPress={() => {
            setPayAccount(null);
            setPickAccount(false);
          }}
        />
        {accounts.map((a) => (
          <ListRow
            key={a.uuid}
            title={a.name}
            color={a.color}
            onPress={() => {
              setPayAccount(a.uuid);
              setPickAccount(false);
            }}
          />
        ))}
      </PickerSheet>
    </ScrollView>
  );
}
