import { COMMON_DATE_FIELDS, DATE_FIELDS, type UserDataClassName } from '@shared/index';

import { Parse } from '@/parse/init';

/**
 * Conversion between records (plain JSON rows, dates as ISO strings — the shape
 * zod validates and the sync functions exchange) and Parse objects in the Local
 * Datastore.
 *
 * Local objects use the record's uuid as their Parse id. The Local Datastore
 * keys objects by `${className}_${id}`, so a row created offline and the same
 * row pulled from the server are one object locally. These objects are never
 * saved with the SDK (writes go through syncPush), so the id is never sent.
 */

/** Classes stored locally: synced user data plus the server-owned per-user rows. */
export type LocalClassName = UserDataClassName | 'MonthlySummary' | 'Insight';

export type AnyRecord = Record<string, unknown> & { uuid: string };

const SERVER_DATE_FIELDS: Record<'MonthlySummary' | 'Insight', readonly string[]> = {
  MonthlySummary: ['serverUpdatedAt'],
  Insight: ['periodStart', 'readAt', 'serverUpdatedAt'],
};

export function dateFieldsOf(className: LocalClassName): readonly string[] {
  if (className === 'MonthlySummary' || className === 'Insight') return SERVER_DATE_FIELDS[className];
  return [...COMMON_DATE_FIELDS, ...DATE_FIELDS[className]];
}

/** Record → Parse object (in memory; pin it to store it). */
export function toParseObject(className: LocalClassName, record: AnyRecord): Parse.Object {
  const json: Record<string, unknown> = { className, objectId: record.uuid };
  const dates = new Set(dateFieldsOf(className));
  for (const [key, value] of Object.entries(record)) {
    if (dates.has(key) && typeof value === 'string') json[key] = { __type: 'Date', iso: value };
    else json[key] = value;
  }
  // override=true replaces any cached state for this id with exactly this record.
  return Parse.Object.fromJSON(json, true);
}

const PARSE_META = new Set(['objectId', 'className', 'createdAt', 'updatedAt', 'ACL', '__type']);

/** Stored/encoded Parse JSON (dates as {__type:'Date', iso}) → record. */
export function jsonToRecord<T extends AnyRecord = AnyRecord>(json: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(json)) {
    if (PARSE_META.has(key)) continue;
    if (value && typeof value === 'object' && (value as { __type?: string }).__type === 'Date') {
      out[key] = (value as { iso: string }).iso;
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/** Parse object → record. */
export function toRecord<T extends AnyRecord = AnyRecord>(object: Parse.Object): T {
  return jsonToRecord<T>(object.toJSON() as Record<string, unknown>);
}
