/**
 * @jest-environment node
 *
 * cloud/main.js is pasted into Back4App as one plain-JS file, so it can't import
 * /shared. These tests keep its copies of the class list, money fields, field
 * names and seed data identical to the app's /shared definitions.
 */
import type { ZodObject, ZodRawShape } from 'zod';

import {
  BANK_TEMPLATES,
  bankTemplateSchema,
  DEFAULT_CATEGORIES,
  defaultCategorySchema,
  MONEY_FIELDS,
  USER_DATA_CLASSES,
  userDataSchemas,
} from '@shared/index';

import { loadCloud } from './helpers/load-cloud';

const cloud = loadCloud().internals;

/** Record fields stored under a different Parse column name. */
const COLUMN_RENAMES: Record<string, Record<string, string>> = {
  Setting: { value: 'valueJson' },
};

describe('cloud/main.js matches /shared', () => {
  it('has the same user-data classes', () => {
    expect([...cloud.USER_DATA_CLASSES].sort()).toEqual([...USER_DATA_CLASSES].sort());
  });

  it('has the same money fields', () => {
    expect(cloud.MONEY_FIELDS).toEqual(MONEY_FIELDS);
  });

  it.each(USER_DATA_CLASSES)('defines a Parse column for every %s record field', (className) => {
    const schema = userDataSchemas[className] as unknown as ZodObject<ZodRawShape>;
    const definition = cloud.classDefinitions().find((d: { className: string }) => d.className === className);
    const columns = Object.keys(definition.fields);
    const renames = COLUMN_RENAMES[className] ?? {};
    for (const field of Object.keys(schema.shape)) {
      expect(columns).toContain(renames[field] ?? field);
    }
    expect(columns).toContain('owner');
  });

  it('seeds the same bank templates the app bundles', () => {
    expect(cloud.BANK_TEMPLATES).toEqual(BANK_TEMPLATES);
    for (const row of BANK_TEMPLATES) bankTemplateSchema.parse(row);
  });

  it('seeds the same default categories the app bundles', () => {
    expect(cloud.DEFAULT_CATEGORIES).toEqual(DEFAULT_CATEGORIES);
    for (const row of DEFAULT_CATEGORIES) defaultCategorySchema.parse(row);
  });

  it('has unique seed keys and valid category parents', () => {
    const bankKeys = BANK_TEMPLATES.map((b) => b.key);
    expect(new Set(bankKeys).size).toBe(bankKeys.length);
    const categoryKeys = new Set(DEFAULT_CATEGORIES.map((c) => c.key));
    expect(categoryKeys.size).toBe(DEFAULT_CATEGORIES.length);
    for (const category of DEFAULT_CATEGORIES) {
      if (category.parentKey) {
        expect(categoryKeys.has(category.parentKey)).toBe(true);
        const parent = DEFAULT_CATEGORIES.find((c) => c.key === category.parentKey);
        expect(parent?.kind).toBe(category.kind);
      }
    }
  });
});
