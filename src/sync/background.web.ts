/**
 * Browsers have no OS-scheduled background tasks. On web the app syncs on
 * start, when the tab regains focus or connection, and a few seconds after
 * each change (see use-sync-triggers).
 */
export const BACKGROUND_SYNC_TASK = 'pitaka-background-sync';

export async function registerBackgroundSync(): Promise<void> {}
