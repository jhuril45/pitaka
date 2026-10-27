import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { initParse } from '@/parse/init';

import { syncNow } from './engine';

/**
 * OS-scheduled background sync. The task must be defined at module load (this
 * file is imported by the root layout), before the app registers it.
 */
export const BACKGROUND_SYNC_TASK = 'pitaka-background-sync';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    initParse();
    const outcome = await syncNow('background');
    return outcome === 'error' ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Ask the OS to run the sync task about every 30 minutes (it decides the real timing). */
export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) return;
  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 30 });
}
