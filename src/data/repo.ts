import { randomUUID } from 'expo-crypto';

import { userDataSchemas, type UserDataClassName, type UserDataRecord } from '@shared/index';

import { scheduleSync } from '@/sync/engine';
import { enqueue, outboxSize } from '@/sync/outbox';
import { useSyncStore } from '@/stores/sync-store';

import { emitChange } from './events';
import { getLocal, putLocal } from './local-store';
import type { AnyRecord } from './records';

/** Fields the repository fills in; callers provide everything else. */
type Managed = 'uuid' | 'clientUpdatedAt' | 'deletedAt' | 'serverUpdatedAt';

export type Draft<C extends UserDataClassName> = Omit<UserDataRecord<C>, Managed> & { uuid?: string };

/**
 * Save a record locally and queue it for sync: validate with the shared zod
 * schema, stamp clientUpdatedAt, pin it, add it to the outbox, notify hooks
 * and schedule a sync a few seconds later. Works fully offline.
 *
 * Throws the ZodError when the draft is invalid.
 */
export async function saveRecord<C extends UserDataClassName>(
  className: C,
  draft: Draft<C>,
  options: { clientUpdatedAt?: string } = {},
): Promise<UserDataRecord<C>> {
  const uuid = draft.uuid ?? randomUUID();
  const existing = draft.uuid ? await getLocal(className, uuid) : null;
  const candidate = {
    ...draft,
    uuid,
    // Overridable only for starter rows, which must lose to any real edit (see ensureDefaultProfile).
    clientUpdatedAt: options.clientUpdatedAt ?? new Date().toISOString(),
    deletedAt: null,
    serverUpdatedAt: (existing?.serverUpdatedAt as string | null | undefined) ?? null,
  };
  const record = userDataSchemas[className].parse(candidate) as UserDataRecord<C>;
  await putLocal(className, record as AnyRecord, existing);
  await enqueue(className, uuid);
  useSyncStore.getState().set({ pending: await outboxSize() });
  emitChange(className);
  scheduleSync();
  return record;
}

/** Soft-delete: the row stays (with deletedAt) so the delete syncs to other devices. */
export async function deleteRecord(className: UserDataClassName, uuid: string): Promise<void> {
  const existing = await getLocal(className, uuid);
  if (!existing || existing.deletedAt) return;
  const now = new Date().toISOString();
  const record = { ...existing, deletedAt: now, clientUpdatedAt: now };
  await putLocal(className, record, existing);
  await enqueue(className, uuid);
  useSyncStore.getState().set({ pending: await outboxSize() });
  emitChange(className);
  scheduleSync();
}

export async function getRecord<C extends UserDataClassName>(className: C, uuid: string): Promise<UserDataRecord<C> | null> {
  const record = await getLocal(className, uuid);
  return record && !record.deletedAt ? (record as unknown as UserDataRecord<C>) : null;
}
