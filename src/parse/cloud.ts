import type { BankTemplateRecord, DefaultCategoryRecord, MerchantDictionaryRecord, UserDataClassName } from '@shared/index';

import { Parse } from './init';

/**
 * Typed wrappers for the Cloud functions in cloud/main.js.
 * Each call is one request; keep the param/result types in step with main.js.
 */

type Row = Record<string, unknown> & { uuid: string };

export interface RegisterDeviceParams {
  expoPushToken: string;
  platform: 'ios' | 'android';
}

export function registerDevice(params: RegisterDeviceParams): Promise<{ uuid: string }> {
  return Parse.Cloud.run('registerDevice', params);
}

interface DeleteAccountResult {
  done: boolean;
  deleted: number;
}

/**
 * Permanently delete the signed-in account and all of its data on the server.
 * The server works in time-boxed batches, so this keeps calling until it
 * reports done. Afterwards call useAuth().logout() to clear this device.
 */
export async function deleteAccount(maxCalls = 50): Promise<number> {
  let total = 0;
  for (let call = 0; call < maxCalls; call += 1) {
    const result: DeleteAccountResult = await Parse.Cloud.run('deleteAccount');
    total += result.deleted;
    if (result.done) return total;
  }
  throw new Error('Account deletion did not finish. Please try again.');
}

export interface PushChange {
  className: UserDataClassName;
  record: Row;
}

export interface PushResult {
  accepted: { className: UserDataClassName; uuid: string; serverUpdatedAt: string | null }[];
  conflicts: { className: UserDataClassName; uuid: string; server: Row }[];
  rejected: { className: string; uuid: string; error: string }[];
  serverTime: string;
}

export function syncPush(changes: PushChange[], deviceId: string): Promise<PushResult> {
  return Parse.Cloud.run('syncPush', { changes, deviceId });
}

/** Position in the server's change feed: (serverUpdatedAt, class index, objectId). */
export interface PullCursor {
  t: string;
  c: number;
  id: string;
}

export interface PullResult {
  changes: { className: UserDataClassName | 'MonthlySummary' | 'Insight'; record: Row }[];
  cursor: PullCursor | null;
  hasMore: boolean;
  serverTime: string;
}

export function syncPull(cursor: PullCursor | null, limit = 300): Promise<PullResult> {
  return Parse.Cloud.run('syncPull', { cursor, limit });
}

export interface BootstrapResult {
  changes: PullResult['changes'];
  shared: {
    bankTemplates: BankTemplateRecord[];
    categories: DefaultCategoryRecord[];
    /** Absent from servers deployed before Milestone 5. */
    merchantDictionary?: MerchantDictionaryRecord[];
  };
  serverTime: string;
}

export function bootstrap(): Promise<BootstrapResult> {
  return Parse.Cloud.run('bootstrap');
}

export interface CategorySuggestion {
  suggestedCategoryKey: string;
  confidenceBps: number;
}

/** Shared merchant → category suggestion (online only). */
export function suggestCategory(merchant: string): Promise<CategorySuggestion | null> {
  return Parse.Cloud.run('suggestCategory', { merchant });
}

/** Dismiss an insight on every device. */
export function markInsightRead(uuid: string): Promise<{ ok: boolean }> {
  return Parse.Cloud.run('markInsightRead', { uuid });
}

/** Recompute this account's monthly summaries on the server (e.g. after an import). */
export function rebuildSummaries(profileUuid?: string): Promise<{ months: number; rows: number }> {
  return Parse.Cloud.run('rebuildSummaries', profileUuid ? { profileUuid } : {});
}

export interface PriceSnapshot {
  symbol: string;
  assetClass: 'us_stock' | 'ph_stock' | 'crypto';
  priceMinor: number;
  currency: string;
  capturedOn: string;
}

/** Latest stored price per symbol (fetched on demand for newly held symbols). */
export function getPrices(symbols: { symbol: string; assetClass: PriceSnapshot['assetClass'] }[]): Promise<{ prices: PriceSnapshot[] }> {
  return Parse.Cloud.run('getPrices', { symbols });
}
