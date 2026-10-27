import type { MerchantMappingRecord } from '@shared/index';

import { stableUuid } from '@/lib/ids';
import { normalizeMerchant } from '@/lib/parser';

import { listLive } from '../local-store';
import { profilePin } from '../pins';
import { getRecord, saveRecord } from '../repo';

/** The user's learned merchant → category corrections for a profile. */
export function listMerchantMappings(profileUuid: string): Promise<MerchantMappingRecord[]> {
  return listLive<MerchantMappingRecord>('MerchantMapping', [profilePin(profileUuid)]);
}

/**
 * Remember that `merchant` belongs in `categoryUuid` (a correction from smart
 * entry). One row per merchant: its uuid is derived from profile + merchant,
 * so correcting the same merchant again — on any device — updates that row.
 * Returns false when there was nothing to learn.
 */
export async function learnMerchantCategory(profileUuid: string, merchant: string, categoryUuid: string): Promise<boolean> {
  const merchantNormalized = normalizeMerchant(merchant);
  if (!merchantNormalized) return false;
  const uuid = await stableUuid(`${profileUuid}:merchant:${merchantNormalized}`);
  const existing = await getRecord('MerchantMapping', uuid);
  if (existing?.categoryUuid === categoryUuid) return false;
  await saveRecord('MerchantMapping', { uuid, profileUuid, merchantNormalized, categoryUuid });
  return true;
}
