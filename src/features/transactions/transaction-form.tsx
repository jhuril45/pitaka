import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import type { AccountRecord, CategoryRecord, TransactionRecord } from '@shared/index';

import { DayStepper } from '@/components/day-stepper';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { SelectField } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { PickerSheet } from '@/components/ui/picker-sheet';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { categoryLabel, categoryTree } from '@/data/repos/categories';
import { formatMoney, parseMoney, toMajorString } from '@/lib/money';
import { useTheme } from '@/theme';

type EditableType = 'expense' | 'income' | 'transfer';

const formSchema = z
  .object({
    type: z.enum(['expense', 'income', 'transfer']),
    amount: z.string(),
    accountUuid: z.string().min(1, 'Choose an account'),
    toAccountUuid: z.string().nullable(),
    categoryUuid: z.string().nullable(),
    occurredAt: z.date(),
    merchant: z.string().max(120, 'Too long'),
    note: z.string().max(500, 'Too long'),
  })
  .superRefine((v, ctx) => {
    const minor = parseMoney(v.amount);
    if (minor === null || minor <= 0) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount above zero' });
    if (v.type === 'transfer') {
      if (!v.toAccountUuid) ctx.addIssue({ code: 'custom', path: ['toAccountUuid'], message: 'Choose where the money goes' });
      else if (v.toAccountUuid === v.accountUuid)
        ctx.addIssue({ code: 'custom', path: ['toAccountUuid'], message: 'Pick a different account' });
    }
  });

export type TransactionFormValues = z.infer<typeof formSchema>;

/** What the form hands back: a record minus the fields the screen adds. */
export type TransactionFormResult = Pick<
  TransactionRecord,
  'type' | 'amountMinor' | 'accountUuid' | 'toAccountUuid' | 'categoryUuid' | 'occurredAt' | 'merchant' | 'note'
>;

interface Props {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  initial?: TransactionRecord | null;
  /** Starting values for a new transaction (e.g. from smart text). Ignored when editing. */
  prefill?: Partial<TransactionFormResult> | null;
  defaultType?: EditableType;
  onSubmit: (values: TransactionFormResult) => Promise<void>;
  onDelete?: () => void;
}

export function TransactionForm({ accounts, categories, initial, prefill, defaultType = 'expense', onSubmit, onDelete }: Props) {
  const { colors, spacing } = useTheme();
  const [picker, setPicker] = useState<'account' | 'toAccount' | 'category' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currencyOf = (uuid: string | null | undefined) => accounts.find((a) => a.uuid === uuid)?.currency ?? 'PHP';
  const start = initial ?? prefill ?? null;
  const startType = start?.type && start.type !== 'adjustment' ? start.type : defaultType;

  const { control, handleSubmit, setValue, formState } = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: startType,
      amount: start?.amountMinor ? toMajorString(start.amountMinor, currencyOf(start.accountUuid)) : '',
      accountUuid: start?.accountUuid ?? accounts[0]?.uuid ?? '',
      toAccountUuid: start?.toAccountUuid ?? null,
      categoryUuid: start?.categoryUuid ?? null,
      occurredAt: start?.occurredAt ? new Date(start.occurredAt) : new Date(),
      merchant: start?.merchant ?? '',
      note: start?.note ?? '',
    },
  });

  const type = useWatch({ control, name: 'type' });
  const accountUuid = useWatch({ control, name: 'accountUuid' });
  const toAccountUuid = useWatch({ control, name: 'toAccountUuid' });
  const categoryUuid = useWatch({ control, name: 'categoryUuid' });
  const amount = useWatch({ control, name: 'amount' });
  const currency = currencyOf(accountUuid);
  const parsed = parseMoney(amount, currency);
  const kind = type === 'income' ? 'income' : 'expense';

  const submit = handleSubmit(async (values) => {
    setError(null);
    const isTransfer = values.type === 'transfer';
    try {
      await onSubmit({
        type: values.type,
        amountMinor: parseMoney(values.amount, currencyOf(values.accountUuid))!,
        accountUuid: values.accountUuid,
        toAccountUuid: isTransfer ? values.toAccountUuid : null,
        categoryUuid: isTransfer ? null : values.categoryUuid,
        occurredAt: values.occurredAt.toISOString(),
        merchant: values.merchant.trim(),
        note: values.note.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  });

  const accountName = (uuid: string | null) => accounts.find((a) => a.uuid === uuid)?.name;

  return (
    <View>
      <ErrorBanner message={error} />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Segmented<EditableType>
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
            ]}
            value={field.value}
            onChange={(next) => {
              field.onChange(next);
              // A category of the other kind no longer fits.
              const current = categories.find((c) => c.uuid === categoryUuid);
              if (current && current.kind !== (next === 'income' ? 'income' : 'expense')) setValue('categoryUuid', null);
            }}
          />
        )}
      />

      <View style={{ height: spacing.lg }} />
      <Controller
        control={control}
        name="amount"
        render={({ field, fieldState }) => (
          <TextField
            label={`Amount (${currency})`}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
            autoFocus={!start}
            error={fieldState.error?.message}
            style={{ fontSize: 28, fontWeight: '700', color: type === 'income' ? colors.income : type === 'expense' ? colors.expense : colors.text }}
          />
        )}
      />
      {parsed !== null && parsed > 0 && /[kmb,]/i.test(amount) ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}>
          = {formatMoney(parsed, currency)}
        </AppText>
      ) : null}

      <SelectField
        label={type === 'transfer' ? 'From account' : 'Account'}
        value={accountName(accountUuid)}
        placeholder="Choose an account"
        onPress={() => setPicker('account')}
        error={formState.errors.accountUuid?.message}
      />
      {type === 'transfer' ? (
        <SelectField
          label="To account"
          value={accountName(toAccountUuid)}
          placeholder="Choose an account"
          onPress={() => setPicker('toAccount')}
          error={formState.errors.toAccountUuid?.message}
        />
      ) : (
        <SelectField
          label="Category"
          value={categoryUuid ? categoryLabel(categories, categoryUuid) : undefined}
          placeholder="Uncategorized"
          onPress={() => setPicker('category')}
        />
      )}

      <Controller
        control={control}
        name="occurredAt"
        render={({ field }) => <DayStepper value={field.value} onChange={field.onChange} />}
      />
      <Controller
        control={control}
        name="merchant"
        render={({ field, fieldState }) => (
          <TextField
            label={type === 'income' ? 'From (payer)' : type === 'transfer' ? 'Description' : 'Merchant'}
            value={field.value}
            onChangeText={field.onChange}
            placeholder={type === 'income' ? 'e.g. Employer' : type === 'transfer' ? 'Optional' : 'e.g. Jollibee'}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="note"
        render={({ field, fieldState }) => (
          <TextField label="Note" value={field.value} onChangeText={field.onChange} placeholder="Optional" multiline error={fieldState.error?.message} />
        )}
      />

      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Button title={initial ? 'Save changes' : 'Save'} onPress={() => void submit()} loading={formState.isSubmitting} />
        {onDelete ? <Button title="Delete transaction" variant="ghost" onPress={onDelete} /> : null}
      </View>

      <PickerSheet visible={picker === 'account' || picker === 'toAccount'} title="Choose account" onClose={() => setPicker(null)}>
        {accounts.map((account) => (
          <ListRow
            key={account.uuid}
            title={account.name}
            subtitle={account.currency}
            color={account.color}
            onPress={() => {
              setValue(picker === 'toAccount' ? 'toAccountUuid' : 'accountUuid', account.uuid, { shouldValidate: formState.isSubmitted });
              setPicker(null);
            }}
          />
        ))}
      </PickerSheet>
      <PickerSheet visible={picker === 'category'} title="Choose category" onClose={() => setPicker(null)}>
        <ListRow
          title="Uncategorized"
          onPress={() => {
            setValue('categoryUuid', null);
            setPicker(null);
          }}
        />
        {categoryTree(categories, kind).map((node) => (
          <View key={node.uuid}>
            <ListRow
              title={node.name}
              color={node.color}
              onPress={() => {
                setValue('categoryUuid', node.uuid);
                setPicker(null);
              }}
            />
            {node.children.map((child) => (
              <ListRow
                key={child.uuid}
                title={child.name}
                indent
                onPress={() => {
                  setValue('categoryUuid', child.uuid);
                  setPicker(null);
                }}
              />
            ))}
          </View>
        ))}
      </PickerSheet>
    </View>
  );
}
