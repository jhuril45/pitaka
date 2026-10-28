import { USER_DATA_CLASSES, type UserDataClassName } from '@shared/index';

import { getLocal } from '@/data/local-store';

import { syncNow } from './engine';
import { removeIssue, type SyncIssue } from './issues';
import { enqueue } from './outbox';

/**
 * Send a refused row again (e.g. after the server was updated to accept it).
 * Re-queues this device's current copy; returns false when the row is gone.
 */
export async function retryIssue(issue: SyncIssue): Promise<boolean> {
  if (!(USER_DATA_CLASSES as readonly string[]).includes(issue.className)) return false;
  const className = issue.className as UserDataClassName;
  if (!(await getLocal(className, issue.uuid))) return false;
  await enqueue(className, issue.uuid);
  await removeIssue(issue.id);
  void syncNow('retry-issue');
  return true;
}
