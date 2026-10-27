import Storage from 'expo-sqlite/kv-store';
import { randomUUID } from 'expo-crypto';

import { emitChange } from '@/data/events';
import { withLock } from '@/data/lock';
import type { AnyRecord } from '@/data/records';

/**
 * Log of changes that lost a conflict or were rejected by the server, shown on
 * the "Sync issues" screen so nothing disappears silently. Newest 200 kept.
 */

export const ISSUES_KEY = 'pitaka.sync.issues';
export const SYNC_ISSUE_CLASS = 'SyncIssue';
const MAX_ISSUES = 200;

export interface SyncIssue {
  id: string;
  kind: 'conflict' | 'rejected';
  className: string;
  uuid: string;
  message: string;
  /** The version that was discarded (this device's copy). */
  discarded: AnyRecord | null;
  at: string;
}

async function read(): Promise<SyncIssue[]> {
  const raw = await Storage.getItem(ISSUES_KEY);
  return raw ? (JSON.parse(raw) as SyncIssue[]) : [];
}

export async function logIssue(issue: Omit<SyncIssue, 'id' | 'at'>): Promise<void> {
  await withLock(async () => {
    const issues = await read();
    issues.unshift({ ...issue, discarded: issue.discarded ?? null, id: randomUUID(), at: new Date().toISOString() });
    await Storage.setItem(ISSUES_KEY, JSON.stringify(issues.slice(0, MAX_ISSUES)));
  });
  emitChange(SYNC_ISSUE_CLASS);
}

/** Newest first. */
export function listIssues(): Promise<SyncIssue[]> {
  return read();
}

export async function clearIssues(): Promise<void> {
  await Storage.removeItem(ISSUES_KEY);
  emitChange(SYNC_ISSUE_CLASS);
}
