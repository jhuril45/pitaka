import { z } from 'zod';

import { currencyCode, hexColor, icon, isoDate, minor, monthKey, name, nonNegativeMinor, uuid } from './common';
import { accountType, assetClass, categoryKind, jsonValue } from './user-data';

/**
 * Classes written only by Cloud Code. Clients read them (owner-only or public),
 * so these schemas validate pulled data and job output, not client writes.
 */

export const monthlySummarySchema = z.object({
  uuid,
  profileUuid: uuid,
  month: monthKey,
  accountUuid: uuid,
  /** null bucket holds uncategorised transactions and transfers. */
  categoryUuid: uuid.nullable(),
  incomeMinor: minor,
  expenseMinor: minor,
  txCount: z.int().nonnegative(),
  serverUpdatedAt: isoDate,
});

export const insightKind = z.enum([
  'category_change',
  'unusual_transaction',
  'subscription_increase',
  'budget_pace',
  'weekly_summary',
]);
export const insightSchema = z.object({
  uuid,
  profileUuid: uuid,
  kind: insightKind,
  message: z.string().max(500),
  payload: jsonValue,
  periodStart: isoDate,
  readAt: isoDate.nullable(),
  serverUpdatedAt: isoDate,
});

export const priceSnapshotSchema = z.object({
  symbol: z.string().min(1).max(20),
  assetClass,
  priceMinor: nonNegativeMinor,
  currency: currencyCode,
  /** Calendar date (UTC) the price was captured, YYYY-MM-DD. */
  capturedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const trackedSymbolSchema = z.object({
  symbol: z.string().min(1).max(20),
  assetClass,
  refCount: z.int().nonnegative(),
  lastFetchedAt: isoDate.nullable(),
});

export const merchantDictionarySchema = z.object({
  merchantNormalized: z.string().min(1).max(120),
  suggestedCategoryKey: z.string().min(1).max(64),
  /** Share of contributing users who chose this category, in basis points. */
  confidenceBps: z.int().min(0).max(10000),
});

export const bankTemplateSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  name,
  type: accountType,
  icon,
  color: hexColor,
  currency: currencyCode,
  sortOrder: z.int(),
  active: z.boolean(),
});

export const defaultCategorySchema = z.object({
  key: z.string().regex(/^[a-z0-9_.]+$/),
  /** Key of the parent category, null for top-level entries. */
  parentKey: z.string().nullable(),
  name,
  kind: categoryKind,
  icon,
  color: hexColor,
  sortOrder: z.int(),
  /** Lowercase words the parser matches to this category (incl. Taglish). */
  keywords: z.array(z.string().min(1)),
});

export type MonthlySummaryRecord = z.infer<typeof monthlySummarySchema>;
export type InsightRecord = z.infer<typeof insightSchema>;
export type PriceSnapshotRecord = z.infer<typeof priceSnapshotSchema>;
export type TrackedSymbolRecord = z.infer<typeof trackedSymbolSchema>;
export type MerchantDictionaryRecord = z.infer<typeof merchantDictionarySchema>;
export type BankTemplateRecord = z.infer<typeof bankTemplateSchema>;
export type DefaultCategoryRecord = z.infer<typeof defaultCategorySchema>;

export const SHARED_PUBLIC_CLASSES = ['PriceSnapshot', 'MerchantDictionary', 'BankTemplate', 'DefaultCategorySet'] as const;
export const SERVER_OWNED_CLASSES = ['MonthlySummary', 'Insight'] as const;
