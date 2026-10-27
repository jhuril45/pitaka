import { z } from 'zod';

/**
 * Field building blocks shared by every record schema.
 *
 * Records are the plain-JSON shape exchanged between the app's repositories and
 * Cloud Code (syncPush/syncPull). Dates travel as ISO-8601 strings; repositories
 * convert to and from the Date fields stored on Parse objects.
 */

export const isoDate = z.iso.datetime({ offset: true });

/** Integer minor units (centavos). Rejects floats, NaN and unsafe integers. */
export const minor = z.int();
export const positiveMinor = z.int().positive();
export const nonNegativeMinor = z.int().nonnegative();

export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO-4217 code like PHP');
export const uuid = z.uuid();
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a #RRGGBB color');
export const icon = z.string().min(1).max(64);
export const name = z.string().trim().min(1).max(80);
export const shortText = z.string().max(500);
/** Positive decimal kept as a string so share quantities never lose precision. */
export const decimalString = z.string().regex(/^\d+(\.\d{1,12})?$/, 'Expected a positive decimal string');
/** Calendar month key, e.g. 2026-10. */
export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

/** Fields every synced user-data record carries. */
export const baseRecord = z.object({
  uuid,
  clientUpdatedAt: isoDate,
  deletedAt: isoDate.nullable(),
  /** Set only by Cloud Code; absent on records the server hasn't seen yet. */
  serverUpdatedAt: isoDate.nullish(),
});

/** Base fields plus the profile the record belongs to. */
export const profileRecord = baseRecord.extend({
  profileUuid: uuid,
});
