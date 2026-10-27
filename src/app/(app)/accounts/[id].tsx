import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { z } from 'zod';

import { BANK_TEMPLATES, type AccountRecord, type BankTemplateRecord } from '@shared/index';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { SelectField } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { PickerSheet } from '@/components/ui/picker-sheet';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { listAccounts, removeAccount, saveAccount } from '@/data/repos/accounts';
import { getRecord } from '@/data/repo';
import { confirm } from '@/lib/confirm';
import { parseMoney, toMajorString } from '@/lib/money';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const TYPES: { value: AccountRecord['type']; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'investment', label: 'Investment' },
  { value: 'loan', label: 'Loan' },
];

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(80),
    type: z.enum(['cash', 'bank', 'ewallet', 'credit_card', 'investment', 'loan']),
    currency: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter code like PHP')),
    opening: z.string(),
    creditLimit: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.opening.trim() && parseMoney(v.opening, v.currency) === null)
      ctx.addIssue({ code: 'custom', path: ['opening'], message: 'Enter an amount like 1,500.00' });
    if (v.type === 'credit_card' && v.creditLimit.trim()) {
      const limit = parseMoney(v.creditLimit, v.currency);
      if (limit === null || limit < 0) ctx.addIssue({ code: 'custom', path: ['creditLimit'], message: 'Enter a limit like 50k' });
    }
  });
type Values = z.input<typeof schema>;

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const isNew = id === 'new';
  const [existing, setExisting] = useState<AccountRecord | null | undefined>(isNew ? null : undefined);
  const [template, setTemplate] = useState<BankTemplateRecord | null>(null);
  const [picker, setPicker] = useState<'template' | 'type' | null>(isNew ? 'template' : null);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset, setValue, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'bank', currency: 'PHP', opening: '', creditLimit: '' },
  });

  useEffect(() => {
    if (isNew) return;
    void getRecord('Account', id).then((account) => {
      setExisting(account);
      if (account) {
        reset({
          name: account.name,
          type: account.type,
          currency: account.currency,
          opening: account.openingBalanceMinor ? toMajorString(account.openingBalanceMinor, account.currency) : '',
          creditLimit: account.creditLimitMinor ? toMajorString(account.creditLimitMinor, account.currency) : '',
        });
      }
    });
  }, [id, isNew, reset]);

  const type = useWatch({ control, name: 'type' });

  function applyTemplate(t: BankTemplateRecord | null) {
    setTemplate(t);
    if (t) {
      setValue('name', t.name);
      setValue('type', t.type);
      setValue('currency', t.currency);
    }
    setPicker(null);
  }

  const submit = handleSubmit(async (raw) => {
    const values = schema.parse(raw);
    setError(null);
    try {
      const siblings = await listAccounts(profileUuid, { includeArchived: true });
      await saveAccount({
        uuid: existing?.uuid,
        profileUuid,
        name: values.name,
        type: values.type,
        currency: values.currency,
        openingBalanceMinor: values.opening.trim() ? parseMoney(values.opening, values.currency)! : 0,
        creditLimitMinor: values.type === 'credit_card' && values.creditLimit.trim() ? parseMoney(values.creditLimit, values.currency) : null,
        icon: existing?.icon ?? template?.icon ?? 'wallet',
        color: existing?.color ?? template?.color ?? colors.primary,
        archived: existing?.archived ?? false,
        sortOrder: existing?.sortOrder ?? siblings.length,
        templateKey: existing?.templateKey ?? template?.key ?? null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  });

  async function toggleArchive() {
    if (!existing) return;
    await saveAccount({ ...existing, archived: !existing.archived });
    router.back();
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete account?',
      message: 'Its transactions stay but will no longer count toward a balance. Archiving keeps the history instead.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await removeAccount(existing!.uuid);
    router.back();
  }

  if (existing === undefined) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        {isNew ? (
          <SelectField
            label="Bank or e-wallet"
            value={template?.name ?? 'Other'}
            placeholder="Choose"
            onPress={() => setPicker('template')}
          />
        ) : null}
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField label="Name" value={field.value} onChangeText={field.onChange} placeholder="e.g. BDO Savings" error={fieldState.error?.message} />
          )}
        />
        <SelectField label="Type" value={TYPES.find((t) => t.value === type)?.label} placeholder="Choose" onPress={() => setPicker('type')} />
        <Controller
          control={control}
          name="currency"
          render={({ field, fieldState }) => (
            <TextField label="Currency" value={field.value} onChangeText={field.onChange} autoCapitalize="characters" maxLength={3} error={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="opening"
          render={({ field, fieldState }) => (
            <TextField
              label={type === 'credit_card' || type === 'loan' ? 'Opening balance (negative if you owe)' : 'Opening balance'}
              value={field.value}
              onChangeText={field.onChange}
              keyboardType="numbers-and-punctuation"
              placeholder="0.00"
              error={fieldState.error?.message}
            />
          )}
        />
        {type === 'credit_card' ? (
          <Controller
            control={control}
            name="creditLimit"
            render={({ field, fieldState }) => (
              <TextField label="Credit limit" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="e.g. 50k" error={fieldState.error?.message} />
            )}
          />
        ) : null}

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Button title={isNew ? 'Add account' : 'Save changes'} onPress={() => void submit()} loading={formState.isSubmitting} />
          {existing ? (
            <>
              <Button title={existing.archived ? 'Unarchive' : 'Archive'} variant="secondary" onPress={toggleArchive} />
              <Button title="Delete account" variant="ghost" onPress={onDelete} />
            </>
          ) : null}
        </View>

        <PickerSheet visible={picker === 'template'} title="Bank or e-wallet" onClose={() => setPicker(null)}>
          <ListRow title="Other (type my own)" onPress={() => applyTemplate(null)} />
          {BANK_TEMPLATES.filter((t) => t.active).map((t) => (
            <ListRow key={t.key} title={t.name} color={t.color} subtitle={TYPES.find((x) => x.value === t.type)?.label} onPress={() => applyTemplate(t)} />
          ))}
        </PickerSheet>
        <PickerSheet visible={picker === 'type'} title="Account type" onClose={() => setPicker(null)}>
          {TYPES.map((t) => (
            <ListRow
              key={t.value}
              title={t.label}
              onPress={() => {
                setValue('type', t.value);
                setPicker(null);
              }}
            />
          ))}
        </PickerSheet>
        {isNew ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing.lg }}>
            The opening balance is what the account held before the first transaction you record here.
          </AppText>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
