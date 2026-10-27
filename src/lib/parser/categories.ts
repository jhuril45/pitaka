import { DEFAULT_CATEGORIES } from '@shared/index';

import { normalizeMerchant, wordRegex } from './normalize';

export interface ParserCategory {
  uuid: string;
  name: string;
  kind: 'expense' | 'income';
  parentUuid: string | null;
}

export interface MerchantMappingLike {
  merchantNormalized: string;
  categoryUuid: string;
}

export interface DictionaryEntry {
  merchantNormalized: string;
  suggestedCategoryKey: string;
}

export type CategorySource = 'mapping' | 'dictionary' | 'keyword' | 'name';

export interface CategoryMatch {
  category: ParserCategory;
  source: CategorySource;
}

/** The user's category that corresponds to a default category key (matched by its default name). */
export function categoryForKey(key: string, categories: ParserCategory[]): ParserCategory | null {
  const seed = DEFAULT_CATEGORIES.find((c) => c.key === key);
  if (!seed) return null;
  const name = seed.name.toLowerCase();
  return categories.find((c) => c.kind === seed.kind && c.name.toLowerCase() === name) ?? null;
}

/**
 * Keyword rules from the default categories (English + Taglish), plus the
 * user's own category names. Longest keyword wins; on a tie a subcategory
 * beats its parent (pamasahe → "Jeep, bus & train" rather than "Transport").
 */
export function categoryByKeywords(
  text: string,
  categories: ParserCategory[],
  kind: 'expense' | 'income' | null,
): CategoryMatch | null {
  let best: { category: ParserCategory; length: number; isChild: boolean; source: CategorySource } | null = null;
  const consider = (category: ParserCategory | null, length: number, source: CategorySource) => {
    if (!category || (kind && category.kind !== kind)) return;
    const isChild = !!category.parentUuid;
    if (!best || length > best.length || (length === best.length && isChild && !best.isChild)) {
      best = { category, length, isChild, source };
    }
  };

  for (const seed of DEFAULT_CATEGORIES) {
    for (const keyword of seed.keywords) {
      if (wordRegex(keyword).test(text)) consider(categoryForKey(seed.key, categories), keyword.length, 'keyword');
    }
  }
  for (const category of categories) {
    const name = category.name.toLowerCase();
    if (name.length >= 3 && wordRegex(name).test(text)) consider(category, name.length, 'name');
  }
  const found = best as { category: ParserCategory; source: CategorySource } | null;
  return found ? { category: found.category, source: found.source } : null;
}

/**
 * Category for a merchant, in the order the app trusts most:
 * the user's own corrections, then the shared dictionary, then keyword rules.
 * (The online `suggestCategory` lookup sits between dictionary and keywords and
 * is done by the caller, since it needs the network.)
 */
export function resolveCategory(args: {
  merchant: string;
  text: string;
  kind: 'expense' | 'income' | null;
  categories: ParserCategory[];
  mappings: MerchantMappingLike[];
  dictionary: DictionaryEntry[];
}): CategoryMatch | null {
  const { merchant, text, kind, categories, mappings, dictionary } = args;
  const key = normalizeMerchant(merchant);
  const fits = (c: ParserCategory | null | undefined): c is ParserCategory => !!c && (!kind || c.kind === kind);

  if (key) {
    const mapped = mappings.find((m) => m.merchantNormalized === key);
    const category = mapped && categories.find((c) => c.uuid === mapped.categoryUuid);
    if (fits(category)) return { category, source: 'mapping' };

    const entry = dictionary.find((d) => d.merchantNormalized === key);
    const suggested = entry ? categoryForKey(entry.suggestedCategoryKey, categories) : null;
    if (fits(suggested)) return { category: suggested, source: 'dictionary' };
  }
  return categoryByKeywords(text, categories, kind);
}
