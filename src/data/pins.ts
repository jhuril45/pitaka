import { format, startOfMonth, subMonths } from 'date-fns';

import type { AnyRecord, LocalClassName } from './records';

/**
 * Named pins group Local Datastore objects so queries only scan what they need
 * (a Local Datastore query reads every object in its pin):
 *
 *   profiles                    Profile rows
 *   account                     account-wide rows (DeviceToken, Settings without a profile)
 *   profile:<profileUuid>       reference data of one profile (accounts, categories, budgets…)
 *   tx:<profileUuid>:<YYYY-MM>  transactions of one month
 *   summary:<profileUuid>       MonthlySummary rows
 *   insights:<profileUuid>      Insight rows
 */

export const PIN_PROFILES = 'profiles';
export const PIN_ACCOUNT = 'account';
export const PIN_OUTBOX = 'outbox';
export const PIN_SYNC_ISSUES = 'sync-issues';

/** Transactions older than this many months are left on the server (fetched on demand). */
export const DEFAULT_TX_WINDOW_MONTHS = 12;

export function profilePin(profileUuid: string): string {
  return `profile:${profileUuid}`;
}

/** Calendar month of an ISO timestamp in the device's time zone, e.g. 2026-10. */
export function monthOf(iso: string): string {
  return format(new Date(iso), 'yyyy-MM');
}

export function txPin(profileUuid: string, month: string): string {
  return `tx:${profileUuid}:${month}`;
}

export function summaryPin(profileUuid: string): string {
  return `summary:${profileUuid}`;
}

export function insightsPin(profileUuid: string): string {
  return `insights:${profileUuid}`;
}

/** The pin a record belongs in. */
export function pinFor(className: LocalClassName, record: AnyRecord): string {
  const profileUuid = typeof record.profileUuid === 'string' ? record.profileUuid : null;
  switch (className) {
    case 'Profile':
      return PIN_PROFILES;
    case 'DeviceToken':
      return PIN_ACCOUNT;
    case 'Transaction':
      return txPin(String(profileUuid), monthOf(String(record.occurredAt)));
    case 'MonthlySummary':
      return summaryPin(String(profileUuid));
    case 'Insight':
      return insightsPin(String(profileUuid));
    default:
      return profileUuid ? profilePin(profileUuid) : PIN_ACCOUNT;
  }
}

/** First day of the oldest month kept on the device. */
export function windowStart(now = new Date(), months = DEFAULT_TX_WINDOW_MONTHS): Date {
  return startOfMonth(subMonths(now, months - 1));
}

/** Month pins covering the rolling window, newest first. */
export function windowMonths(now = new Date(), months = DEFAULT_TX_WINDOW_MONTHS): string[] {
  return Array.from({ length: months }, (_, i) => format(subMonths(now, i), 'yyyy-MM'));
}
