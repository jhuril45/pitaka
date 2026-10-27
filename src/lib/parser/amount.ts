import { parseMoneyDetailed } from '@/lib/money';

export interface AmountMatch {
  amountMinor: number;
  currency?: string;
  text: string;
}

/**
 * Money-looking tokens: optional currency (₱, PHP, P, $, USD), digits with
 * optional thousands separators and decimals, optional k/m/b suffix. A digit
 * glued to letters or a hyphen ("7-eleven", "3rd") is not an amount.
 */
const AMOUNT = /(?<![\p{L}\p{N}.,-])(?:(₱|php\s?|p(?=\d)|\$|usd\s?))?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)\s?([kmb])?(?![\p{L}\p{N}-])/giu;

/**
 * The amount in a phrase. When there are several numbers, one with a currency
 * sign, suffix, separator or decimals wins; otherwise the last number does
 * (amounts usually follow the merchant: "Grab 180").
 */
export function findAmount(text: string, currency: string): AmountMatch | null {
  const candidates: (AmountMatch & { score: number })[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const raw = m[0];
    const parsed = parseMoneyDetailed(raw.replace(/\s+/g, ''), currency);
    if (!parsed || parsed.amountMinor <= 0) continue;
    const score = (m[1] ? 2 : 0) + (m[3] ? 2 : 0) + (/[,.]/.test(m[2] ?? '') ? 1 : 0);
    candidates.push({ amountMinor: parsed.amountMinor, currency: parsed.currency, text: raw, score });
  }
  if (!candidates.length) return null;
  let best = candidates[0]!;
  for (const c of candidates) if (c.score >= best.score) best = c;
  const { score: _score, ...match } = best;
  return match;
}
