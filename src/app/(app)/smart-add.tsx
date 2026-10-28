import { format, isToday } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useAccounts } from '@/data/repos/accounts';
import { categoryLabel, useCategories } from '@/data/repos/categories';
import { learnMerchantCategory, listMerchantMappings } from '@/data/repos/merchant-mappings';
import { saveTransaction } from '@/data/repos/transactions';
import { useLocalQuery } from '@/data/use-local-query';
import { useSmartParse } from '@/features/smart-entry/use-smart-parse';
import { useVoiceInput } from '@/features/voice/use-voice-input';
import { TransactionForm, type TransactionFormResult } from '@/features/transactions/transaction-form';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const EXAMPLES = ['Starbucks 250', 'Salary 30k', 'Grab 180 yesterday gcash', 'Pamasahe 50', 'Paid credit card 5k'];

const SOURCE_LABEL: Record<string, string> = {
  mapping: 'learned from you',
  dictionary: 'common for this merchant',
  suggested: 'common for this merchant',
  keyword: 'from keywords',
  name: 'matches a category name',
};

/** Smart entry: type a phrase, check what was understood, then review and save. */
export default function SmartAddScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, radius, spacing } = useTheme();
  const { voice: startWithVoice } = useLocalSearchParams<{ voice?: string }>();
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const voice = useVoiceInput((heard) => {
    setText(heard);
    setReviewing(false);
    setUsedVoice(true);
  });
  const { start: startVoice } = voice;

  // Quick Add → Voice opens this screen already listening.
  useEffect(() => {
    if (startWithVoice === '1') void startVoice();
  }, [startWithVoice, startVoice]);
  const { data: accounts } = useAccounts(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const { data: mappings } = useLocalQuery(() => listMerchantMappings(profileUuid), ['MerchantMapping'], [profileUuid]);
  const parsed = useSmartParse(text, { accounts: accounts ?? [], categories: categories ?? [], mappings: mappings ?? [] });

  if (!accounts || !categories) return null;
  const accountName = (uuid: string | null) => accounts.find((a) => a.uuid === uuid)?.name ?? '—';
  const currency = accounts.find((a) => a.uuid === parsed?.accountUuid)?.currency ?? 'PHP';
  const ready = !!parsed && parsed.amountMinor !== null && !!parsed.accountUuid;

  async function onSubmit(values: TransactionFormResult) {
    await saveTransaction({
      ...values,
      profileUuid,
      source: usedVoice ? 'voice' : 'manual',
      recurringRuleUuid: null,
      installmentUuid: null,
    });
    // A category changed from what was suggested is a correction worth remembering.
    if (values.type !== 'transfer' && values.merchant && values.categoryUuid && values.categoryUuid !== parsed?.categoryUuid) {
      await learnMerchantCategory(profileUuid, values.merchant, values.categoryUuid);
    }
    router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <TextField
          label="What did you spend or receive?"
          value={text}
          onChangeText={(next) => {
            setText(next);
            setReviewing(false);
          }}
          placeholder="e.g. Grab 180 yesterday gcash"
          autoFocus={startWithVoice !== '1'}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => ready && setReviewing(true)}
        />
        <Button
          title={voice.listening ? 'Listening… tap to stop' : 'Say it instead'}
          variant={voice.listening ? 'primary' : 'outline'}
          onPress={() => (voice.listening ? voice.stop() : void voice.start())}
        />
        {voice.message ? (
          <AppText variant="caption" tone={voice.state === 'idle' ? 'muted' : 'danger'}>
            {voice.message}
          </AppText>
        ) : null}

        {!text ? (
          <View style={[styles.chips, { gap: spacing.sm }]}>
            {EXAMPLES.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                onPress={() => setText(example)}
                style={[styles.chip, { borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface }]}>
                <AppText variant="caption">{example}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {parsed && !reviewing ? (
          <Card>
            <View style={styles.between}>
              <AppText variant="label" tone="muted">
                {parsed.type === 'income' ? 'Income' : parsed.type === 'transfer' ? 'Transfer' : 'Expense'}
              </AppText>
              <AppText variant="caption" tone="muted">
                {isToday(parsed.occurredAt) ? 'Today' : format(parsed.occurredAt, 'EEE, MMM d')}
              </AppText>
            </View>
            {parsed.amountMinor !== null ? (
              <MoneyText
                amountMinor={parsed.amountMinor}
                currency={parsed.currency ?? currency}
                variant="title"
                tone={parsed.type === 'income' ? 'income' : parsed.type === 'expense' ? 'expense' : 'default'}
                maskable={false}
              />
            ) : (
              <AppText tone="danger">Add an amount, like 250 or 2.5k</AppText>
            )}
            {parsed.merchant ? <AppText variant="heading">{parsed.merchant}</AppText> : null}
            <AppText tone="muted">
              {parsed.type === 'transfer'
                ? `${accountName(parsed.accountUuid)} → ${accountName(parsed.toAccountUuid)}`
                : `${categoryLabel(categories, parsed.categoryUuid)} · ${accountName(parsed.accountUuid)}`}
            </AppText>
            {parsed.source && parsed.type !== 'transfer' && parsed.categoryUuid ? (
              <AppText variant="caption" tone="muted">
                Category {SOURCE_LABEL[parsed.source]}
              </AppText>
            ) : null}
            {parsed.currency && parsed.currency !== currency ? (
              <AppText variant="caption" tone="danger">
                Amount is in {parsed.currency}; the account is in {currency}. Check before saving.
              </AppText>
            ) : null}
            {parsed.confirm === 'income-or-debt' && parsed.debtMatches.length ? (
              <AppText variant="caption" tone="muted">
                {parsed.counterparty} has an open debt with you. Recording it as a repayment arrives with debts (Milestone 8); for now this is
                income.
              </AppText>
            ) : null}
            <Button title="Review & save" onPress={() => setReviewing(true)} disabled={!ready} style={{ marginTop: spacing.sm }} />
          </Card>
        ) : null}

        {parsed && reviewing ? (
          <TransactionForm
            key={text}
            accounts={accounts}
            categories={categories}
            prefill={{
              type: parsed.type,
              amountMinor: parsed.amountMinor ?? undefined,
              accountUuid: parsed.accountUuid ?? undefined,
              toAccountUuid: parsed.toAccountUuid,
              categoryUuid: parsed.categoryUuid,
              occurredAt: parsed.occurredAt.toISOString(),
              merchant: parsed.merchant,
            }}
            onSubmit={onSubmit}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
