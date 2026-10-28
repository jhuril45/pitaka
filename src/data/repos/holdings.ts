import type { HoldingRecord } from '@shared/index';

import { priceKey, type PriceQuote } from '@/lib/portfolio';
import { getPrices } from '@/parse/cloud';

import { emitChange } from '../events';
import { listLive, listPin, putManyLocal } from '../local-store';
import { PIN_PRICES, profilePin } from '../pins';
import { deleteRecord, saveRecord, type Draft } from '../repo';
import { useLocalQuery } from '../use-local-query';

/** Investment holdings of a profile, plus the pinned prices they're valued with. */

export async function listHoldings(profileUuid: string): Promise<HoldingRecord[]> {
  const rows = await listLive<HoldingRecord & Record<string, unknown>>('Holding', [profilePin(profileUuid)]);
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function loadPrices(): Promise<Map<string, PriceQuote>> {
  const rows = await listPin<PriceQuote & Record<string, unknown> & { uuid: string }>('PriceSnapshot', PIN_PRICES);
  return new Map(rows.map((r) => [priceKey(r.assetClass, r.symbol), r]));
}

export function usePortfolio(profileUuid: string) {
  return useLocalQuery(
    async () => {
      const [holdings, prices] = await Promise.all([listHoldings(profileUuid), loadPrices()]);
      return { holdings, prices };
    },
    ['Holding', 'PriceSnapshot'],
    [profileUuid],
  );
}

export const saveHolding = (draft: Draft<'Holding'>) => saveRecord('Holding', draft);
export const removeHolding = (uuid: string) => deleteRecord('Holding', uuid);

/**
 * Ask the server for the latest prices of these holdings and pin them, so
 * values work offline afterwards. Throws when offline (callers show the last
 * pinned prices).
 */
export async function refreshPrices(holdings: Pick<HoldingRecord, 'symbol' | 'assetClass'>[]): Promise<number> {
  const unique = new Map(holdings.map((h) => [priceKey(h.assetClass, h.symbol), { symbol: h.symbol, assetClass: h.assetClass }]));
  if (!unique.size) return 0;
  const { prices } = await getPrices([...unique.values()]);
  if (!prices.length) return 0;
  await putManyLocal(
    prices.map((p) => ({ className: 'PriceSnapshot' as const, record: { ...p, uuid: `price-${p.assetClass}-${p.symbol}` }, previous: null })),
  );
  emitChange('PriceSnapshot');
  return prices.length;
}
