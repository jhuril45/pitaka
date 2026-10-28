import type { HoldingRecord } from '@shared/index';

import { add, ratioBps, subtract } from './money';
import { multiplyQuantity } from './quantity';

/**
 * Holding values on the device. Prices come only from PriceSnapshot rows
 * (pulled and pinned, so they work offline), else the holding's manual price.
 * No currency conversion: values are grouped per currency.
 */

export interface PriceQuote {
  symbol: string;
  assetClass: HoldingRecord['assetClass'];
  priceMinor: number;
  currency: string;
  capturedOn: string;
}

export interface HoldingValue {
  holding: HoldingRecord;
  /** Price used and where it came from. */
  priceMinor: number | null;
  priceSource: 'market' | 'manual' | 'none';
  priceDate: string | null;
  currency: string;
  costMinor: number;
  marketMinor: number | null;
  /** Profit/loss vs. cost; null without a price. */
  plMinor: number | null;
  plBps: number | null;
}

export const ASSET_CLASS_LABEL: Record<HoldingRecord['assetClass'], string> = { ph_stock: 'PH stocks', us_stock: 'US stocks', crypto: 'Crypto' };

/** Basis points as a signed percentage with two decimals: 1234 → "+12.34%". */
export function formatBps(bps: number): string {
  const abs = Math.abs(bps);
  return `${bps > 0 ? '+' : bps < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}%`;
}

export const priceKey = (assetClass: string, symbol: string) => `${assetClass}:${symbol}`;

export function valueHolding(holding: HoldingRecord, prices: Map<string, PriceQuote>): HoldingValue {
  const quote = prices.get(priceKey(holding.assetClass, holding.symbol));
  // A market price in another currency than the holding's can't be compared to its cost.
  const market = quote && quote.currency === holding.currency ? quote : null;
  const priceMinor = market ? market.priceMinor : holding.manualPriceMinor;
  const costMinor = multiplyQuantity(holding.quantity, holding.avgCostMinor);
  const marketMinor = priceMinor === null ? null : multiplyQuantity(holding.quantity, priceMinor);
  const plMinor = marketMinor === null ? null : subtract(marketMinor, costMinor);
  return {
    holding,
    priceMinor,
    priceSource: market ? 'market' : priceMinor !== null ? 'manual' : 'none',
    priceDate: market?.capturedOn ?? null,
    currency: holding.currency,
    costMinor,
    marketMinor,
    plMinor,
    plBps: plMinor === null || costMinor === 0 ? null : Math.round((plMinor * 10000) / costMinor),
  };
}

export interface PortfolioTotals {
  currency: string;
  /** Market value, using cost for holdings without any price. */
  valueMinor: number;
  costMinor: number;
  plMinor: number;
  plBps: number | null;
  /** Share of value per asset class, in basis points. */
  allocation: { assetClass: HoldingRecord['assetClass']; valueMinor: number; shareBps: number }[];
}

export function portfolioTotals(values: HoldingValue[]): PortfolioTotals[] {
  const byCurrency = new Map<string, HoldingValue[]>();
  for (const v of values) byCurrency.set(v.currency, [...(byCurrency.get(v.currency) ?? []), v]);
  return [...byCurrency].map(([currency, list]) => {
    let valueMinor = 0;
    let costMinor = 0;
    let plMinor = 0;
    const byClass = new Map<HoldingRecord['assetClass'], number>();
    for (const v of list) {
      const value = v.marketMinor ?? v.costMinor;
      valueMinor = add(valueMinor, value);
      costMinor = add(costMinor, v.costMinor);
      if (v.plMinor !== null) plMinor = add(plMinor, v.plMinor);
      byClass.set(v.holding.assetClass, add(byClass.get(v.holding.assetClass) ?? 0, value));
    }
    return {
      currency,
      valueMinor,
      costMinor,
      plMinor,
      plBps: costMinor ? Math.round((plMinor * 10000) / costMinor) : null,
      allocation: [...byClass]
        .map(([assetClass, value]) => ({ assetClass, valueMinor: value, shareBps: ratioBps(value, valueMinor) }))
        .sort((a, b) => b.valueMinor - a.valueMinor),
    };
  });
}
