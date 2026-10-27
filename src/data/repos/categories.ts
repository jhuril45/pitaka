import type { CategoryRecord } from '@shared/index';

import { listLive } from '../local-store';
import { profilePin } from '../pins';
import { deleteRecord, saveRecord, type Draft } from '../repo';
import { useLocalQuery } from '../use-local-query';

export async function listCategories(profileUuid: string): Promise<CategoryRecord[]> {
  const categories = await listLive<CategoryRecord>('Category', [profilePin(profileUuid)]);
  return categories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function useCategories(profileUuid: string) {
  return useLocalQuery(() => listCategories(profileUuid), ['Category'], [profileUuid]);
}

export interface CategoryNode extends CategoryRecord {
  children: CategoryRecord[];
}

/** Top-level categories of one kind with their children; orphans (parent deleted) become top-level. */
export function categoryTree(categories: CategoryRecord[], kind: CategoryRecord['kind']): CategoryNode[] {
  const ofKind = categories.filter((c) => c.kind === kind);
  const ids = new Set(ofKind.map((c) => c.uuid));
  const tops = ofKind.filter((c) => !c.parentUuid || !ids.has(c.parentUuid));
  return tops.map((top) => ({ ...top, children: ofKind.filter((c) => c.parentUuid === top.uuid) }));
}

/** "Food › Coffee" style label. */
export function categoryLabel(categories: CategoryRecord[], uuid: string | null): string {
  if (!uuid) return 'Uncategorized';
  const category = categories.find((c) => c.uuid === uuid);
  if (!category) return 'Uncategorized';
  const parent = category.parentUuid ? categories.find((c) => c.uuid === category.parentUuid) : null;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

export function saveCategory(draft: Draft<'Category'>): Promise<CategoryRecord> {
  return saveRecord('Category', draft);
}

/** Deleting a parent also deletes its subcategories; their transactions become uncategorized. */
export async function removeCategory(categories: CategoryRecord[], uuid: string): Promise<void> {
  for (const child of categories.filter((c) => c.parentUuid === uuid)) await deleteRecord('Category', child.uuid);
  await deleteRecord('Category', uuid);
}
