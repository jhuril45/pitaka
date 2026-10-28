import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import Storage from '@/lib/kv';
import { registerDevice } from '@/parse/cloud';

import { REMINDER_ID_PREFIX as ID_PREFIX, upcomingReminders } from './upcoming';

/**
 * Bill, installment and debt reminders.
 *
 * Local notifications are the offline guarantee: scheduled on the phone for
 * the next 30 days. When this phone has registered for push, the server's
 * processRecurring job sends the reminders instead and local ones are
 * cancelled, so each reminder arrives through one channel only.
 */

const PUSH_KEY = 'pitaka.push.token';
const CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export { upcomingReminders, type Reminder } from './upcoming';

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Ask once (e.g. when the user saves a recurring bill). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (await hasNotificationPermission()) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Re-schedule this profile's local reminders. Returns how many are scheduled. */
export async function scheduleReminders(profileUuid: string, now = new Date()): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(ID_PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  if (!(await hasNotificationPermission())) return 0;
  if (await Storage.getItem(PUSH_KEY)) return 0; // The server sends push reminders instead.

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: AndroidImportance.DEFAULT });
  }
  const reminders = await upcomingReminders(profileUuid, now);
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
    });
  }
  return reminders.length;
}

/**
 * Register this phone for push reminders from the server. Needs a physical
 * device and an EAS project id (set by `eas init`); otherwise reminders stay
 * local. Returns true when registered.
 */
export async function registerPushToken(): Promise<boolean> {
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
  if (!Device.isDevice || !projectId || !(await hasNotificationPermission())) return false;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerDevice({ expoPushToken: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    await Storage.setItem(PUSH_KEY, data);
    return true;
  } catch {
    return false;
  }
}
