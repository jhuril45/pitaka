import { Parse } from '@/parse/init';

import { withLock } from './lock';
import { pinFor } from './pins';
import { jsonToRecord, toParseObject, type AnyRecord, type LocalClassName } from './records';

/**
 * Local Datastore access by (className, uuid) and by named pin. Repositories
 * build on this; the UI never touches Parse directly.
 *
 * Writes use the Parse SDK's pin API, so data is stored in the SDK's own
 * format (`Parse_LDS_<class>_<id>` objects, `parsePin_<name>` key lists).
 * Reads go straight to those keys instead of through Parse.Query /
 * fetchFromLocalDatastore, because in parse 8.6 both load *every* stored
 * object on each call (pins don't limit the work), and
 * fetchFromLocalDatastore throws on any object with a null field.
 */

const OBJECT_PREFIX = 'Parse_LDS_';
const PIN_PREFIX = 'parsePin_';

type StoredJSON = Record<string, unknown>;

function storage() {
  return Parse.CoreManager.getAsyncStorage();
}

function objectKey(className: string, uuid: string): string {
  return `${OBJECT_PREFIX}${className}_${uuid}`;
}

async function readJSON<T>(key: string): Promise<T | null> {
  const raw = await storage().getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** The stored record, or null when this device doesn't have it. */
export async function getLocal<T extends AnyRecord = AnyRecord>(className: LocalClassName, uuid: string): Promise<T | null> {
  // Objects are stored as a one-element array: [fullJSON].
  const stored = await readJSON<StoredJSON[]>(objectKey(className, uuid));
  return stored?.[0] ? jsonToRecord<T>(stored[0]) : null;
}

/**
 * Store a record in its pin, moving it out of its previous pin when that
 * changed (e.g. a transaction edited into another month).
 */
export function putLocal(className: LocalClassName, record: AnyRecord, previous?: AnyRecord | null): Promise<void> {
  return withLock(async () => {
    const before = previous === undefined ? await getLocal(className, record.uuid) : previous;
    const object = toParseObject(className, record);
    const pin = pinFor(className, record);
    // Pin first, then unpin from the old pin, so the object is never unreferenced.
    await object.pinWithName(pin);
    if (before) {
      const oldPin = pinFor(className, before);
      if (oldPin !== pin) await object.unPinWithName(oldPin);
    }
  });
}

/** Store many records (sync pulls). Groups by pin to keep pin rewrites few. */
export function putManyLocal(entries: { className: LocalClassName; record: AnyRecord; previous: AnyRecord | null }[]): Promise<void> {
  return withLock(async () => {
    const byPin = new Map<string, Parse.Object[]>();
    const moves: { object: Parse.Object; oldPin: string }[] = [];
    for (const { className, record, previous } of entries) {
      const object = toParseObject(className, record);
      const pin = pinFor(className, record);
      const list = byPin.get(pin) ?? [];
      list.push(object);
      byPin.set(pin, list);
      if (previous) {
        const oldPin = pinFor(className, previous);
        if (oldPin !== pin) moves.push({ object, oldPin });
      }
    }
    for (const [pin, objects] of byPin) await Parse.Object.pinAllWithName(pin, objects);
    for (const { object, oldPin } of moves) await object.unPinWithName(oldPin);
  });
}

/** Remove a record from this device entirely (not a delete — nothing is synced). */
export function dropLocal(className: LocalClassName, record: AnyRecord): Promise<void> {
  return withLock(async () => {
    await toParseObject(className, record).unPinWithName(pinFor(className, record));
  });
}

/** All records of a class in one pin (including soft-deleted ones). Reads only that pin's objects. */
export async function listPin<T extends AnyRecord = AnyRecord>(className: LocalClassName, pin: string): Promise<T[]> {
  const keys = (await readJSON<string[]>(`${PIN_PREFIX}${pin}`)) ?? [];
  const wanted = keys.filter((key) => key.startsWith(`${OBJECT_PREFIX}${className}_`));
  if (!wanted.length) return [];
  const pairs = (await storage().multiGet(wanted)) as readonly [string, string | null][];
  const out: T[] = [];
  for (const [, raw] of pairs) {
    if (!raw) continue;
    const stored = JSON.parse(raw) as StoredJSON[];
    if (stored[0]) out.push(jsonToRecord<T>(stored[0]));
  }
  return out;
}

/** Records from several pins, skipping soft-deleted rows. */
export async function listLive<T extends AnyRecord = AnyRecord>(className: LocalClassName, pins: string[]): Promise<T[]> {
  const lists = await Promise.all(pins.map((pin) => listPin<T>(className, pin)));
  return lists.flat().filter((record) => !record.deletedAt);
}
