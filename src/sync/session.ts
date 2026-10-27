import Storage from 'expo-sqlite/kv-store';
import { randomUUID } from 'expo-crypto';

import { Parse } from '@/parse/init';

import type { PullCursor } from '@/parse/cloud';

/** Id of the signed-in user, or null. Reads the stored session only (works offline). */
export async function currentUserId(): Promise<string | null> {
  const user = await Parse.User.currentAsync();
  return user?.id ?? null;
}

const DEVICE_KEY = 'pitaka.device-id';

/** Stable id for this install, sent with syncPush for diagnostics. */
export async function deviceId(): Promise<string> {
  const existing = await Storage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = randomUUID();
  await Storage.setItem(DEVICE_KEY, id);
  return id;
}

const cursorKey = (userId: string) => `pitaka.sync.cursor.${userId}`;

export async function loadCursor(userId: string): Promise<PullCursor | null> {
  const raw = await Storage.getItem(cursorKey(userId));
  return raw ? (JSON.parse(raw) as PullCursor) : null;
}

export async function saveCursor(userId: string, cursor: PullCursor | null): Promise<void> {
  if (cursor) await Storage.setItem(cursorKey(userId), JSON.stringify(cursor));
}

/**
 * Forget all sync state on this device (outbox, issues, cursors). Called with
 * the Local Datastore wipe at logout: a cursor without the data it describes
 * would make the next sign-in skip everything already pulled.
 */
export async function clearSyncState(): Promise<void> {
  const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith('pitaka.sync.'));
  if (keys.length) await Storage.multiRemove(keys);
}
