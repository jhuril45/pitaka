import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import type { TransactionRecord } from '@shared/index';

import { AppText } from '@/components/ui/text';
import { useAccounts } from '@/data/repos/accounts';
import { useCategories } from '@/data/repos/categories';
import { getTransaction, removeTransaction, saveTransaction } from '@/data/repos/transactions';
import { AttachmentStrip } from '@/features/attachments/attachment-strip';
import { TransactionForm, type TransactionFormResult } from '@/features/transactions/transaction-form';
import { confirm } from '@/lib/confirm';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

/** /transaction/new (optionally ?type=income) or /transaction/<uuid> to edit. */
export default function TransactionScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: 'expense' | 'income' | 'transfer' }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const { data: accounts } = useAccounts(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const isNew = id === 'new';
  const [existing, setExisting] = useState<TransactionRecord | null | undefined>(isNew ? null : undefined);

  useEffect(() => {
    if (!isNew) void getTransaction(id).then(setExisting);
  }, [id, isNew]);

  if (!accounts || !categories || existing === undefined) return null;
  if (!isNew && !existing) {
    return (
      <AppText tone="muted" style={{ padding: spacing.lg }}>
        This transaction was deleted.
      </AppText>
    );
  }

  async function onSubmit(values: TransactionFormResult) {
    await saveTransaction({
      ...(existing ?? {}),
      ...values,
      uuid: existing?.uuid,
      profileUuid,
      source: existing?.source ?? 'manual',
      recurringRuleUuid: existing?.recurringRuleUuid ?? null,
      installmentUuid: existing?.installmentUuid ?? null,
    });
    router.back();
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete transaction?',
      message: 'It will be removed from all your devices.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await removeTransaction(existing!.uuid);
    router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        {accounts.length === 0 ? (
          <AppText tone="muted">Add an account first (More → Accounts).</AppText>
        ) : (
          <TransactionForm
            accounts={accounts}
            categories={categories}
            initial={existing}
            defaultType={type}
            onSubmit={onSubmit}
            onDelete={existing ? onDelete : undefined}
          />
        )}
        {existing ? <AttachmentStrip profileUuid={profileUuid} transactionUuid={existing.uuid} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
