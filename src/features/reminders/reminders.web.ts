/**
 * Browsers: no scheduled local notifications or Expo push. Upcoming bills
 * still show on Home and in Plan.
 */
export { upcomingReminders } from './upcoming';

export async function hasNotificationPermission(): Promise<boolean> {
  return false;
}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function scheduleReminders(_profileUuid: string): Promise<number> {
  return 0;
}

export async function registerPushToken(): Promise<boolean> {
  return false;
}
