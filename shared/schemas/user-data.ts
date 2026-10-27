import { z } from 'zod';

import {
  baseRecord,
  currencyCode,
  decimalString,
  hexColor,
  icon,
  isoDate,
  minor,
  name,
  nonNegativeMinor,
  positiveMinor,
  profileRecord,
  shortText,
  uuid,
} from './common';

export const profileType = z.enum(['personal', 'family', 'business']);
export const profileSchema = baseRecord.extend({
  name,
  baseCurrency: currencyCode,
  icon,
  color: hexColor,
  type: profileType,
});

export const accountType = z.enum(['cash', 'bank', 'ewallet', 'credit_card', 'investment', 'loan']);
export const accountSchema = profileRecord.extend({
  name,
  type: accountType,
  currency: currencyCode,
  openingBalanceMinor: minor,
  creditLimitMinor: nonNegativeMinor.nullable(),
  icon,
  color: hexColor,
  archived: z.boolean(),
  sortOrder: z.int(),
  templateKey: z.string().max(64).nullable(),
});

export const categoryKind = z.enum(['expense', 'income']);
export const categorySchema = profileRecord.extend({
  parentUuid: uuid.nullable(),
  name,
  kind: categoryKind,
  icon,
  color: hexColor,
  sortOrder: z.int(),
});

export const transactionType = z.enum(['expense', 'income', 'transfer', 'adjustment']);
export const transactionSource = z.enum(['manual', 'voice', 'ocr', 'recurring']);

const transactionFields = {
  type: transactionType,
  /** Positive for expense/income/transfer; adjustments may be negative. */
  amountMinor: minor,
  accountUuid: uuid,
  toAccountUuid: uuid.nullable(),
  categoryUuid: uuid.nullable(),
  occurredAt: isoDate,
  note: shortText,
  merchant: z.string().max(120),
  source: transactionSource,
  recurringRuleUuid: uuid.nullable(),
  installmentUuid: uuid.nullable(),
};

type TransactionShape = {
  type: z.infer<typeof transactionType>;
  amountMinor: number;
  accountUuid: string;
  toAccountUuid: string | null;
};

/** Cross-field rules shared by transactions and recurring-rule templates. */
function checkTransaction(tx: TransactionShape, ctx: z.RefinementCtx) {
  if (tx.type === 'adjustment') {
    if (tx.amountMinor === 0) {
      ctx.addIssue({ code: 'custom', path: ['amountMinor'], message: 'Adjustment cannot be zero' });
    }
  } else if (tx.amountMinor <= 0) {
    ctx.addIssue({ code: 'custom', path: ['amountMinor'], message: 'Amount must be positive' });
  }
  if (tx.type === 'transfer') {
    if (!tx.toAccountUuid) {
      ctx.addIssue({ code: 'custom', path: ['toAccountUuid'], message: 'Transfer needs a destination account' });
    } else if (tx.toAccountUuid === tx.accountUuid) {
      ctx.addIssue({ code: 'custom', path: ['toAccountUuid'], message: 'Cannot transfer to the same account' });
    }
  } else if (tx.toAccountUuid) {
    ctx.addIssue({ code: 'custom', path: ['toAccountUuid'], message: 'Only transfers have a destination account' });
  }
}

export const transactionSchema = profileRecord.extend(transactionFields).superRefine(checkTransaction);

export const attachmentSchema = profileRecord.extend({
  transactionUuid: uuid,
  /** Parse.File reference once uploaded; null while the upload is pending. */
  file: z.object({ name: z.string(), url: z.url() }).nullable(),
  mime: z.enum(['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']),
  ocrText: z.string().max(20000).nullable(),
});

export const budgetPeriod = z.enum(['weekly', 'monthly', 'custom']);
export const budgetSchema = profileRecord.extend({
  /** null = overall budget across all expense categories. */
  categoryUuid: uuid.nullable(),
  period: budgetPeriod,
  amountMinor: positiveMinor,
  rollover: z.boolean(),
  startDate: isoDate,
  /** Required for custom periods: length in days. */
  customDays: z.int().min(1).max(366).nullable(),
});

export const goalSchema = profileRecord.extend({
  name,
  targetMinor: positiveMinor,
  targetDate: isoDate.nullable(),
  linkedAccountUuid: uuid.nullable(),
  icon,
});

export const goalContributionSchema = profileRecord.extend({
  goalUuid: uuid,
  /** Negative values are withdrawals from the goal. */
  amountMinor: minor.refine((v) => v !== 0, 'Contribution cannot be zero'),
  occurredAt: isoDate,
});

export const debtDirection = z.enum(['i_owe', 'owed_to_me']);
export const debtSchema = profileRecord.extend({
  direction: debtDirection,
  counterparty: name,
  principalMinor: positiveMinor,
  dueDate: isoDate.nullable(),
  settledAt: isoDate.nullable(),
  note: shortText,
});

export const debtPaymentSchema = profileRecord.extend({
  debtUuid: uuid,
  amountMinor: positiveMinor,
  occurredAt: isoDate,
  transactionUuid: uuid.nullable(),
});

export const installmentSchema = profileRecord.extend({
  name,
  accountUuid: uuid,
  totalMinor: positiveMinor,
  months: z.int().min(1).max(120),
  startDate: isoDate,
  monthlyMinor: positiveMinor,
  categoryUuid: uuid.nullable(),
});

export const recurringFrequency = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
export const recurringKind = z.enum(['bill', 'subscription', 'income']);
export const recurringTemplate = z
  .object({
    type: transactionType,
    amountMinor: minor,
    accountUuid: uuid,
    toAccountUuid: uuid.nullable(),
    categoryUuid: uuid.nullable(),
    note: shortText,
    merchant: z.string().max(120),
  })
  .superRefine(checkTransaction);

export const recurringRuleSchema = profileRecord.extend({
  name,
  template: recurringTemplate,
  frequency: recurringFrequency,
  interval: z.int().min(1).max(365),
  /** Day of month for monthly rules; 31 means "last day" in short months. */
  byMonthDay: z.int().min(1).max(31).nullable(),
  nextRunAt: isoDate,
  endAt: isoDate.nullable(),
  kind: recurringKind,
  remindDaysBefore: z.int().min(0).max(30),
  autoPost: z.boolean(),
});

export const assetClass = z.enum(['us_stock', 'ph_stock', 'crypto']);
export const holdingSchema = profileRecord.extend({
  accountUuid: uuid,
  symbol: z.string().trim().toUpperCase().min(1).max(20),
  assetClass,
  quantity: decimalString,
  avgCostMinor: nonNegativeMinor,
  /** Currency avgCostMinor is expressed in. */
  currency: currencyCode,
  /** User-entered price used when no PriceSnapshot exists. */
  manualPriceMinor: nonNegativeMinor.nullable(),
});

export const noteSchema = profileRecord.extend({
  body: z.string().trim().min(1).max(2000),
  dueAt: isoDate.nullable(),
  done: z.boolean(),
});

export const merchantMappingSchema = profileRecord.extend({
  merchantNormalized: z.string().trim().toLowerCase().min(1).max(120),
  categoryUuid: uuid,
});

/** JSON-serialisable value (no functions, Dates, undefined). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

export const settingSchema = baseRecord.extend({
  /** null for account-wide settings, otherwise scoped to a profile. */
  profileUuid: uuid.nullable(),
  key: z.string().regex(/^[a-z][a-zA-Z0-9_.]{0,63}$/),
  value: jsonValue,
});

export const deviceTokenSchema = baseRecord.extend({
  expoPushToken: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/),
  platform: z.enum(['ios', 'android']),
  lastSeenAt: isoDate,
});

/** Every class a client may write through syncPush, keyed by Parse class name. */
export const userDataSchemas = {
  Profile: profileSchema,
  Account: accountSchema,
  Category: categorySchema,
  Transaction: transactionSchema,
  Attachment: attachmentSchema,
  Budget: budgetSchema,
  Goal: goalSchema,
  GoalContribution: goalContributionSchema,
  Debt: debtSchema,
  DebtPayment: debtPaymentSchema,
  Installment: installmentSchema,
  RecurringRule: recurringRuleSchema,
  Holding: holdingSchema,
  Note: noteSchema,
  MerchantMapping: merchantMappingSchema,
  Setting: settingSchema,
  DeviceToken: deviceTokenSchema,
} as const;

export type UserDataClassName = keyof typeof userDataSchemas;
export const USER_DATA_CLASSES = Object.keys(userDataSchemas) as UserDataClassName[];

export type UserDataRecord<C extends UserDataClassName> = z.infer<(typeof userDataSchemas)[C]>;

export type ProfileRecord = UserDataRecord<'Profile'>;
export type AccountRecord = UserDataRecord<'Account'>;
export type CategoryRecord = UserDataRecord<'Category'>;
export type TransactionRecord = UserDataRecord<'Transaction'>;
export type AttachmentRecord = UserDataRecord<'Attachment'>;
export type BudgetRecord = UserDataRecord<'Budget'>;
export type GoalRecord = UserDataRecord<'Goal'>;
export type GoalContributionRecord = UserDataRecord<'GoalContribution'>;
export type DebtRecord = UserDataRecord<'Debt'>;
export type DebtPaymentRecord = UserDataRecord<'DebtPayment'>;
export type InstallmentRecord = UserDataRecord<'Installment'>;
export type RecurringRuleRecord = UserDataRecord<'RecurringRule'>;
export type HoldingRecord = UserDataRecord<'Holding'>;
export type NoteRecord = UserDataRecord<'Note'>;
export type MerchantMappingRecord = UserDataRecord<'MerchantMapping'>;
export type SettingRecord = UserDataRecord<'Setting'>;
export type DeviceTokenRecord = UserDataRecord<'DeviceToken'>;

/** Fields every synced record carries that are stored as Parse Dates. */
export const COMMON_DATE_FIELDS = ['clientUpdatedAt', 'deletedAt', 'serverUpdatedAt'] as const;

/**
 * Class-specific date fields (ISO strings in records, Parse Dates on objects).
 * Kept in step with the 'Date' columns in cloud/main.js by cloud-parity.test.ts.
 */
export const DATE_FIELDS: Record<UserDataClassName, readonly string[]> = {
  Profile: [],
  Account: [],
  Category: [],
  Transaction: ['occurredAt'],
  Attachment: [],
  Budget: ['startDate'],
  Goal: ['targetDate'],
  GoalContribution: ['occurredAt'],
  Debt: ['dueDate', 'settledAt'],
  DebtPayment: ['occurredAt'],
  Installment: ['startDate'],
  RecurringRule: ['nextRunAt', 'endAt'],
  Holding: [],
  Note: ['dueAt'],
  MerchantMapping: [],
  Setting: [],
  DeviceToken: ['lastSeenAt'],
};

/**
 * Integer money fields per class. Cloud Code's beforeSave rejects non-integers here,
 * and the float-money check script uses the same list.
 */
export const MONEY_FIELDS: Record<UserDataClassName, readonly string[]> = {
  Profile: [],
  Account: ['openingBalanceMinor', 'creditLimitMinor'],
  Category: [],
  Transaction: ['amountMinor'],
  Attachment: [],
  Budget: ['amountMinor'],
  Goal: ['targetMinor'],
  GoalContribution: ['amountMinor'],
  Debt: ['principalMinor'],
  DebtPayment: ['amountMinor'],
  Installment: ['totalMinor', 'monthlyMinor'],
  RecurringRule: ['template.amountMinor'],
  Holding: ['avgCostMinor', 'manualPriceMinor'],
  Note: [],
  MerchantMapping: [],
  Setting: [],
  DeviceToken: [],
};
