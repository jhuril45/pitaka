import {
  USER_DATA_CLASSES,
  userDataSchemas,
  type AccountRecord,
  type CategoryRecord,
  type TransactionRecord,
  type UserDataClassName,
} from '@shared/index';

import { getLocal, listLive } from '@/data/local-store';
import { PIN_PROFILES, profilePin, txPin, windowMonths } from '@/data/pins';
import { saveRecord } from '@/data/repo';
import { toMajorString } from '@/lib/money';

/**
 * Backups: one profile's data as a JSON file (and transactions as CSV), made
 * on the device from what it holds (the last 12 months of transactions plus
 * everything else). Importing merges by record id: a row is restored only if
 * this device has no newer version of it, so importing twice changes nothing.
 */

export const BACKUP_FORMAT = 'pitaka-backup';
export const BACKUP_VERSION = 1;

/** Classes not worth backing up: device tokens, and attachments (their files stay on the server). */
const SKIP: UserDataClassName[] = ['DeviceToken', 'Attachment', 'Profile'];
const BACKUP_CLASSES = USER_DATA_CLASSES.filter((c) => !SKIP.includes(c));

type AnyRow = Record<string, unknown> & { uuid: string; clientUpdatedAt: string };

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  profile: AnyRow;
  records: Partial<Record<UserDataClassName, AnyRow[]>>;
}

export async function collectBackup(profileUuid: string, now = new Date()): Promise<Backup> {
  const profile = (await listLive<AnyRow>('Profile', [PIN_PROFILES])).find((p) => p.uuid === profileUuid);
  if (!profile) throw new Error('Profile not found on this device.');
  const records: Backup['records'] = {};
  for (const className of BACKUP_CLASSES) {
    const pins = className === 'Transaction' ? windowMonths(now).map((m) => txPin(profileUuid, m)) : [profilePin(profileUuid)];
    const rows = (await listLive<AnyRow>(className, pins)).filter((r) => r.profileUuid === profileUuid);
    if (rows.length) records[className] = rows;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), profile, records };
}

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Transactions as CSV (amounts as plain decimals in each account's currency). */
export function transactionsCsv(transactions: TransactionRecord[], accounts: AccountRecord[], categories: CategoryRecord[]): string {
  const account = new Map(accounts.map((a) => [a.uuid, a]));
  const category = new Map(categories.map((c) => [c.uuid, c.name]));
  const header = ['date', 'type', 'amount', 'currency', 'account', 'to_account', 'category', 'merchant', 'note'];
  const lines = [...transactions]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((tx) => {
      const from = account.get(tx.accountUuid);
      const currency = from?.currency ?? 'PHP';
      return [
        tx.occurredAt,
        tx.type,
        toMajorString(tx.amountMinor, currency, { grouping: false }),
        currency,
        from?.name ?? '',
        tx.toAccountUuid ? (account.get(tx.toAccountUuid)?.name ?? '') : '',
        tx.categoryUuid ? (category.get(tx.categoryUuid) ?? '') : '',
        tx.merchant,
        tx.note,
      ]
        .map(csvCell)
        .join(',');
    });
  return [header.join(','), ...lines].join('\n') + '\n';
}

export interface ParsedBackup {
  backup: Backup;
  /** Valid rows per class, in restore order. */
  rows: { className: UserDataClassName; record: AnyRow }[];
  invalid: number;
}

/** Restore order: parents before the rows that point at them. */
const ORDER: UserDataClassName[] = ['Account', 'Category', ...BACKUP_CLASSES.filter((c) => c !== 'Account' && c !== 'Category')];

/** Read and validate a backup file's text. Throws a readable Error for files that aren't backups. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Pitaka backup (it isn’t JSON).');
  }
  const backup = data as Backup;
  if (!backup || backup.format !== BACKUP_FORMAT) throw new Error('That file isn’t a Pitaka backup.');
  if (backup.version > BACKUP_VERSION) throw new Error('This backup is from a newer version of Pitaka. Update the app first.');
  if (!userDataSchemas.Profile.safeParse(backup.profile).success) throw new Error('The backup’s profile is damaged.');
  const profileUuid = backup.profile.uuid;

  const rows: ParsedBackup['rows'] = [];
  let invalid = 0;
  for (const className of ORDER) {
    const list = backup.records?.[className] ?? [];
    const items = className === 'Category' ? [...list].sort((a, b) => Number(!!a.parentUuid) - Number(!!b.parentUuid)) : list;
    for (const raw of items) {
      const parsed = userDataSchemas[className].safeParse({ ...raw, deletedAt: null, serverUpdatedAt: null });
      if (parsed.success && (parsed.data as { profileUuid?: unknown }).profileUuid === profileUuid) rows.push({ className, record: parsed.data as AnyRow });
      else invalid += 1;
    }
  }
  return { backup, rows, invalid };
}

export interface ImportResult {
  restored: number;
  skipped: number;
}

/** Restore rows this device doesn't have, or has an older version of. Syncs like any other change. */
export async function importBackup(parsed: ParsedBackup): Promise<ImportResult> {
  let restored = 0;
  let skipped = 0;
  const all: { className: UserDataClassName; record: AnyRow }[] = [{ className: 'Profile', record: parsed.backup.profile }, ...parsed.rows];
  for (const { className, record } of all) {
    const local = await getLocal<AnyRow>(className, record.uuid);
    if (local && local.clientUpdatedAt >= record.clientUpdatedAt) {
      skipped += 1;
      continue;
    }
    const { deletedAt: _d, serverUpdatedAt: _s, clientUpdatedAt, ...draft } = record;
    await saveRecord(className, draft as never, { clientUpdatedAt });
    restored += 1;
  }
  return { restored, skipped };
}
