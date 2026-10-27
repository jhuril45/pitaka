import type { AccountRecord } from '@shared/index';

import { listLive } from '../local-store';
import { profilePin } from '../pins';
import { deleteRecord, saveRecord, type Draft } from '../repo';
import { useLocalQuery } from '../use-local-query';

export async function listAccounts(profileUuid: string, { includeArchived = false } = {}): Promise<AccountRecord[]> {
  const accounts = await listLive<AccountRecord>('Account', [profilePin(profileUuid)]);
  return accounts
    .filter((a) => includeArchived || !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function useAccounts(profileUuid: string, options: { includeArchived?: boolean } = {}) {
  const includeArchived = !!options.includeArchived;
  return useLocalQuery(() => listAccounts(profileUuid, { includeArchived }), ['Account'], [profileUuid, includeArchived]);
}

export function saveAccount(draft: Draft<'Account'>): Promise<AccountRecord> {
  return saveRecord('Account', draft);
}

export function removeAccount(uuid: string): Promise<void> {
  return deleteRecord('Account', uuid);
}
