import { useEffect, useMemo, useState } from 'react';

import type { AccountRecord, CategoryRecord, MerchantDictionaryRecord, MerchantMappingRecord } from '@shared/index';

import { loadMerchantDictionary } from '@/data/shared-cache';
import { normalizeMerchant, parseEntry, type ParsedEntry } from '@/lib/parser';
import { categoryForKey } from '@/lib/parser/categories';
import { suggestCategory } from '@/parse/cloud';

export interface SmartParse extends ParsedEntry {
  /** 'suggested' = from the online suggestCategory lookup. */
  source: ParsedEntry['categorySource'] | 'suggested';
}

/**
 * Parse smart text against the user's accounts, categories, learned mappings
 * and the cached dictionary; when none of those know the merchant, ask the
 * server's suggestCategory (after a pause in typing, online only) before the
 * keyword rules decide.
 */
export function useSmartParse(
  text: string,
  data: { accounts: AccountRecord[]; categories: CategoryRecord[]; mappings: MerchantMappingRecord[] },
): SmartParse | null {
  const { accounts, categories, mappings } = data;
  const [dictionary, setDictionary] = useState<MerchantDictionaryRecord[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, string | null>>({});

  useEffect(() => {
    void loadMerchantDictionary().then(setDictionary);
  }, []);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return parseEntry(text, {
      accounts,
      categories,
      mappings,
      dictionary,
      currency: accounts.find((a) => a.type === 'cash')?.currency ?? 'PHP',
    });
  }, [text, accounts, categories, mappings, dictionary]);

  const merchantKey = parsed ? normalizeMerchant(parsed.merchant) : '';
  const wantsSuggestion =
    !!parsed && parsed.type !== 'transfer' && !!merchantKey && parsed.categorySource !== 'mapping' && parsed.categorySource !== 'dictionary';

  useEffect(() => {
    if (!wantsSuggestion || merchantKey in suggestions) return;
    const timer = setTimeout(() => {
      suggestCategory(merchantKey)
        .then((s) => setSuggestions((prev) => ({ ...prev, [merchantKey]: s?.suggestedCategoryKey ?? null })))
        // Offline or not deployed yet: fall back to keyword rules, and don't retry this merchant.
        .catch(() => setSuggestions((prev) => ({ ...prev, [merchantKey]: null })));
    }, 700);
    return () => clearTimeout(timer);
  }, [wantsSuggestion, merchantKey, suggestions]);

  return useMemo(() => {
    if (!parsed) return null;
    const key = wantsSuggestion ? suggestions[merchantKey] : null;
    const suggested = key ? categoryForKey(key, categories) : null;
    const kind = parsed.type === 'income' ? 'income' : 'expense';
    if (suggested && suggested.kind === kind) {
      return { ...parsed, categoryUuid: suggested.uuid, source: 'suggested' };
    }
    return { ...parsed, source: parsed.categorySource };
  }, [parsed, wantsSuggestion, suggestions, merchantKey, categories]);
}
