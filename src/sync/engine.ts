import * as Network from 'expo-network';

import { USER_DATA_CLASSES, type UserDataClassName } from '@shared/index';

import { emitChange } from '@/data/events';
import { getLocal, putManyLocal, dropLocal } from '@/data/local-store';
import { windowStart } from '@/data/pins';
import { saveSharedData } from '@/data/shared-cache';
import type { AnyRecord, LocalClassName } from '@/data/records';
import { bootstrap, syncPull, syncPush, type PullResult } from '@/parse/cloud';
import { Parse } from '@/parse/init';
import { useSyncStore } from '@/stores/sync-store';

import { logIssue } from './issues';
import { dequeue, dequeueMany, isQueued, listOutbox } from './outbox';
import { currentUserId, deviceId, loadCursor, saveCursor } from './session';

/**
 * Sync cycle: push the outbox in batches through syncPush, then pull every
 * change since the stored cursor through syncPull, then save the cursor.
 *
 * Conflict rule: newest clientUpdatedAt wins. A server copy replaces the local
 * one unless this device has a newer change still queued; when a local change
 * loses, it is logged as a sync issue.
 */

export const PUSH_BATCH = 200;
const PULL_PAGE = 300;
const MAX_PULL_PAGES = 1000;

const USER_CLASSES = new Set<string>(USER_DATA_CLASSES);

export type SyncOutcome = 'synced' | 'offline' | 'signed-out' | 'error';

let running: Promise<SyncOutcome> | null = null;

/**
 * Work to do at the start of each online sync, before the outbox is pushed.
 * Features register here (the attachment uploader does) so the engine doesn't
 * import them — they import the repository, which imports the engine.
 */
const beforePush: (() => Promise<unknown>)[] = [];

export function registerBeforePush(step: () => Promise<unknown>): void {
  if (!beforePush.includes(step)) beforePush.push(step);
}
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

function updatedAt(record: AnyRecord | null): number {
  const value = record?.clientUpdatedAt;
  return typeof value === 'string' ? Date.parse(value) : 0;
}

function isNetworkError(error: unknown): boolean {
  return error instanceof Parse.Error && error.code === Parse.Error.CONNECTION_FAILED;
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true; // Unknown: try, and let the request decide.
  }
}

async function refreshPending(): Promise<void> {
  useSyncStore.getState().set({ pending: (await listOutbox()).length });
}

/** Push every queued row. Returns the number of rows the server accepted. */
async function pushAll(): Promise<number> {
  let acceptedTotal = 0;
  const device = await deviceId();
  // Each pass sends up to PUSH_BATCH rows; stop when a pass makes no progress.
  for (let pass = 0; pass < 1000; pass += 1) {
    const entries = (await listOutbox()).slice(0, PUSH_BATCH);
    if (!entries.length) break;

    const sent = new Map<string, AnyRecord>();
    const changes: { className: UserDataClassName; record: AnyRecord }[] = [];
    for (const entry of entries) {
      const record = await getLocal(entry.className, entry.uuid);
      if (!record) {
        await dequeue(entry.className, entry.uuid); // Row no longer on this device.
        continue;
      }
      sent.set(`${entry.className}:${entry.uuid}`, record);
      changes.push({ className: entry.className, record });
    }
    if (!changes.length) continue;

    const result = await syncPush(changes, device);
    const changedClasses = new Set<string>();

    const done: { className: string; uuid: string }[] = [];
    const stamped: { className: LocalClassName; record: AnyRecord; previous: AnyRecord }[] = [];
    for (const item of result.accepted) {
      const before = sent.get(`${item.className}:${item.uuid}`);
      const now = await getLocal(item.className, item.uuid);
      // Only clear the entry if the row wasn't edited again while the push was in flight.
      if (now && before && updatedAt(now) === updatedAt(before)) {
        done.push(item);
        if (item.serverUpdatedAt) stamped.push({ className: item.className, record: { ...now, serverUpdatedAt: item.serverUpdatedAt }, previous: now });
      }
      acceptedTotal += 1;
    }
    if (stamped.length) await putManyLocal(stamped);
    await dequeueMany(done);

    for (const conflict of result.conflicts) {
      const local = await getLocal(conflict.className, conflict.uuid);
      const before = sent.get(`${conflict.className}:${conflict.uuid}`) ?? null;
      if (local && updatedAt(local) > updatedAt(conflict.server)) continue; // Edited again since: next push decides.
      await putManyLocal([{ className: conflict.className, record: conflict.server, previous: local }]);
      await dequeue(conflict.className, conflict.uuid);
      // Starter rows (stamped at the epoch) are meant to lose to real data: not an issue.
      if (updatedAt(before) === 0) {
        changedClasses.add(conflict.className);
        continue;
      }
      await logIssue({
        kind: 'conflict',
        className: conflict.className,
        uuid: conflict.uuid,
        message: 'Changed on another device more recently; that version was kept.',
        discarded: before,
      });
      changedClasses.add(conflict.className);
    }

    for (const rejected of result.rejected) {
      await dequeue(rejected.className, rejected.uuid);
      await logIssue({
        kind: 'rejected',
        className: rejected.className,
        uuid: rejected.uuid,
        message: `The server refused this change: ${rejected.error}`,
        discarded: sent.get(`${rejected.className}:${rejected.uuid}`) ?? null,
      });
    }

    if (changedClasses.size) emitChange(...changedClasses);
    await refreshPending();
    if (!result.accepted.length && !result.conflicts.length && !result.rejected.length) break;
  }
  return acceptedTotal;
}

/** Store pulled rows, respecting queued local edits and the transaction window. */
async function applyChanges(changes: PullResult['changes']): Promise<void> {
  const oldest = windowStart().getTime();
  const puts: { className: LocalClassName; record: AnyRecord; previous: AnyRecord | null }[] = [];
  const changed = new Set<string>();

  for (const { className, record } of changes) {
    const local = await getLocal(className, record.uuid);

    if (USER_CLASSES.has(className) && (await isQueued(className, record.uuid))) {
      if (local && updatedAt(local) > updatedAt(record)) continue; // Ours is newer and will be pushed.
      await dequeue(className, record.uuid);
      if (local && updatedAt(local) > 0 && updatedAt(local) < updatedAt(record)) {
        await logIssue({
          kind: 'conflict',
          className,
          uuid: record.uuid,
          message: 'Changed on another device more recently; that version was kept.',
          discarded: local,
        });
      }
    }

    // Transactions older than the window stay on the server.
    if (className === 'Transaction' && Date.parse(String(record.occurredAt)) < oldest) {
      if (local) await dropLocal(className, local);
      changed.add(className);
      continue;
    }

    puts.push({ className, record, previous: local });
    changed.add(className);
  }

  if (puts.length) await putManyLocal(puts);
  if (changed.size) emitChange(...changed);
}

async function pullAll(userId: string): Promise<void> {
  let cursor = await loadCursor(userId);

  if (!cursor) {
    // New device / reinstall: make the app usable in one call, then pull everything.
    const first = await bootstrap();
    await saveSharedData(first.shared);
    await applyChanges(first.changes);
  }

  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const result = await syncPull(cursor, PULL_PAGE);
    await applyChanges(result.changes);
    cursor = result.cursor ?? cursor;
    await saveCursor(userId, cursor);
    if (!result.hasMore) break;
  }
}

function scheduleRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  failures += 1;
  const delay = Math.min(5000 * 2 ** (failures - 1), 5 * 60 * 1000);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow('retry');
  }, delay);
}

/**
 * Run one sync cycle. Concurrent calls share the running cycle. Never throws:
 * the outcome is returned and reflected in the sync store.
 */
export function syncNow(_reason = 'manual'): Promise<SyncOutcome> {
  if (running) return running;
  const store = useSyncStore.getState();
  running = (async (): Promise<SyncOutcome> => {
    const userId = await currentUserId();
    if (!userId) {
      store.set({ status: 'idle' });
      return 'signed-out';
    }
    await refreshPending();
    if (!(await isOnline())) {
      store.set({ status: 'offline' });
      return 'offline';
    }
    store.set({ status: 'syncing', error: null });
    try {
      // e.g. receipt photos: their Attachment rows join this push.
      for (const step of beforePush) await step().catch(() => undefined);
      await pushAll();
      await pullAll(userId);
      failures = 0;
      store.set({ status: 'synced', lastSyncedAt: new Date().toISOString(), error: null });
      await refreshPending();
      return 'synced';
    } catch (error) {
      if (isNetworkError(error)) {
        store.set({ status: 'offline' });
        return 'offline';
      }
      store.set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      scheduleRetry();
      return 'error';
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Sync a few seconds after the last local write (batches quick successive edits). */
export function scheduleSync(delayMs = 5000): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow('debounced');
  }, delayMs);
}

/** Stop timers (sign-out, tests). */
export function stopSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (retryTimer) clearTimeout(retryTimer);
  debounceTimer = null;
  retryTimer = null;
  failures = 0;
}
