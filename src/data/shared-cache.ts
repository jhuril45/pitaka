import Storage from 'expo-sqlite/kv-store';

import type { MerchantDictionaryRecord } from '@shared/index';

import type { BootstrapResult } from '@/parse/cloud';

/**
 * Device copy of shared, public data that isn't per-user (kept across logins).
 * Filled by bootstrap; the app falls back to its bundled copies when empty.
 */
const DICTIONARY_KEY = 'pitaka.shared.merchant-dictionary';

export async function saveSharedData(shared: BootstrapResult['shared']): Promise<void> {
  if (shared.merchantDictionary) await Storage.setItem(DICTIONARY_KEY, JSON.stringify(shared.merchantDictionary));
}

export async function loadMerchantDictionary(): Promise<MerchantDictionaryRecord[]> {
  const raw = await Storage.getItem(DICTIONARY_KEY);
  return raw ? (JSON.parse(raw) as MerchantDictionaryRecord[]) : [];
}
