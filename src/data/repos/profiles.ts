import Storage from '@/lib/kv';

import {
  BANK_TEMPLATES,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  type ProfileRecord,
} from '@shared/index';

import { stableUuid } from '@/lib/ids';

import { listLive } from '../local-store';
import { PIN_PROFILES } from '../pins';
import { getRecord, saveRecord } from '../repo';

export async function listProfiles(): Promise<ProfileRecord[]> {
  const profiles = await listLive<ProfileRecord>('Profile', [PIN_PROFILES]);
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

const currentKey = (userId: string) => `pitaka.profile.current.${userId}`;

/**
 * Starter rows are stamped at the epoch so any real edit on the server (e.g.
 * the profile renamed on another phone) wins last-write-wins against them.
 */
const SEED = { clientUpdatedAt: new Date(0).toISOString() };

/**
 * Create the starter profile — "Personal", PHP, the default categories and a
 * Cash account — unless this device already has a profile.
 *
 * Every row's uuid is derived from the user id, so two devices doing this
 * independently (e.g. both offline) produce the same rows and sync merges them
 * instead of creating duplicates; the epoch timestamp (SEED) means they never
 * overwrite changes already made to those rows elsewhere.
 */
export async function ensureDefaultProfile(userId: string): Promise<string> {
  const existing = await listProfiles();
  if (existing.length) return existing[0]!.uuid;

  const profileUuid = await stableUuid(`${userId}:profile:default`);
  await saveRecord('Profile', {
    uuid: profileUuid,
    name: 'Personal',
    baseCurrency: DEFAULT_CURRENCY,
    icon: 'wallet',
    color: '#0F766E',
    type: 'personal',
  }, SEED);

  const uuidOf = new Map<string, string>();
  for (const category of DEFAULT_CATEGORIES) {
    uuidOf.set(category.key, await stableUuid(`${userId}:${profileUuid}:category:${category.key}`));
  }
  // Parents before children, so a child's parent always exists locally first.
  const ordered = [...DEFAULT_CATEGORIES].sort((a, b) => Number(!!a.parentKey) - Number(!!b.parentKey));
  for (const category of ordered) {
    await saveRecord('Category', {
      uuid: uuidOf.get(category.key)!,
      profileUuid,
      parentUuid: category.parentKey ? uuidOf.get(category.parentKey)! : null,
      name: category.name,
      kind: category.kind,
      icon: category.icon,
      color: category.color,
      sortOrder: category.sortOrder,
    }, SEED);
  }

  const cash = BANK_TEMPLATES.find((t) => t.key === 'cash')!;
  await saveRecord('Account', {
    uuid: await stableUuid(`${userId}:${profileUuid}:account:cash`),
    profileUuid,
    name: cash.name,
    type: cash.type,
    currency: cash.currency,
    openingBalanceMinor: 0,
    creditLimitMinor: null,
    icon: cash.icon,
    color: cash.color,
    archived: false,
    sortOrder: 0,
    templateKey: cash.key,
  }, SEED);

  return profileUuid;
}

/** The profile this device last used, if it still exists. */
export async function loadCurrentProfile(userId: string): Promise<string | null> {
  const saved = await Storage.getItem(currentKey(userId));
  if (saved && (await getRecord('Profile', saved))) return saved;
  const profiles = await listProfiles();
  return profiles[0]?.uuid ?? null;
}

export async function saveCurrentProfile(userId: string, profileUuid: string): Promise<void> {
  await Storage.setItem(currentKey(userId), profileUuid);
}
