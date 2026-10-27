import Storage from 'expo-sqlite/kv-store';

import type { UserDataClassName } from '@shared/index';

import { withLock } from '@/data/lock';

/**
 * Rows changed on this device and not yet accepted by the server.
 *
 * One JSON map in the key-value store, keyed `<className>~<uuid>`, so queuing
 * the same row again just refreshes its entry (de-duplicated by uuid). The
 * rows themselves live in the Local Datastore. Kept out of the Local Datastore
 * itself because removing pinned objects there scans every pin.
 */

export const OUTBOX_KEY = 'pitaka.sync.outbox';

export interface OutboxEntry {
  className: UserDataClassName;
  uuid: string;
  queuedAt: string;
}

type OutboxMap = Record<string, OutboxEntry>;

const keyOf = (className: string, uuid: string) => `${className}~${uuid}`;

async function read(): Promise<OutboxMap> {
  const raw = await Storage.getItem(OUTBOX_KEY);
  return raw ? (JSON.parse(raw) as OutboxMap) : {};
}

export function enqueue(className: UserDataClassName, uuid: string): Promise<void> {
  return withLock(async () => {
    const map = await read();
    map[keyOf(className, uuid)] = { className, uuid, queuedAt: new Date().toISOString() };
    await Storage.setItem(OUTBOX_KEY, JSON.stringify(map));
  });
}

export function dequeue(className: string, uuid: string): Promise<void> {
  return dequeueMany([{ className, uuid }]);
}

export function dequeueMany(entries: { className: string; uuid: string }[]): Promise<void> {
  if (!entries.length) return Promise.resolve();
  return withLock(async () => {
    const map = await read();
    for (const { className, uuid } of entries) delete map[keyOf(className, uuid)];
    await Storage.setItem(OUTBOX_KEY, JSON.stringify(map));
  });
}

/** Pending entries, oldest first. */
export async function listOutbox(): Promise<OutboxEntry[]> {
  return Object.values(await read()).sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : 0));
}

export async function isQueued(className: string, uuid: string): Promise<boolean> {
  return keyOf(className, uuid) in (await read());
}

export async function outboxSize(): Promise<number> {
  return Object.keys(await read()).length;
}
