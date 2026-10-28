import type { SettingRecord } from '@shared/index';

import { stableUuid } from '@/lib/ids';

import { listLive } from '../local-store';
import { PIN_ACCOUNT } from '../pins';
import { saveRecord } from '../repo';
import { useLocalQuery } from '../use-local-query';

/** Account-wide settings that sync between the user's devices (e.g. sharing choices). */

export const SHARE_MERCHANT_DATA = 'shareMerchantData';

export async function getAccountSetting(key: string): Promise<SettingRecord | null> {
  const rows = await listLive<SettingRecord & Record<string, unknown>>('Setting', [PIN_ACCOUNT]);
  return rows.find((r) => r.key === key && r.profileUuid === null) ?? null;
}

export function useAccountSetting(key: string) {
  return useLocalQuery(() => getAccountSetting(key), ['Setting'], [key]);
}

/** One row per user and key (stable id), so two devices edit the same setting. */
export async function setAccountSetting(userId: string, key: string, value: SettingRecord['value']): Promise<void> {
  await saveRecord('Setting', { uuid: await stableUuid(`${userId}:setting:${key}`), profileUuid: null, key, value });
}
