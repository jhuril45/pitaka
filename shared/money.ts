/**
 * Money helpers shared by the app and Cloud Code.
 *
 * Every amount is an integer count of the currency's minor unit (centavos for PHP).
 * Nothing in this module converts through floating point: parsing works on the
 * decimal string and uses BigInt, formatting works on the integer's digits.
 */

export type CurrencyCode = string;

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  /** Number of minor-unit digits (2 for PHP/USD, 0 for JPY). */
  minorDigits: number;
}

export const DEFAULT_CURRENCY: CurrencyCode = 'PHP';

const CURRENCIES: Record<string, CurrencyInfo> = {
  PHP: { code: 'PHP', symbol: '₱', minorDigits: 2 },
  USD: { code: 'USD', symbol: '$', minorDigits: 2 },
  EUR: { code: 'EUR', symbol: '€', minorDigits: 2 },
  GBP: { code: 'GBP', symbol: '£', minorDigits: 2 },
  JPY: { code: 'JPY', symbol: '¥', minorDigits: 0 },
  KRW: { code: 'KRW', symbol: '₩', minorDigits: 0 },
  SGD: { code: 'SGD', symbol: 'S$', minorDigits: 2 },
  HKD: { code: 'HKD', symbol: 'HK$', minorDigits: 2 },
  AUD: { code: 'AUD', symbol: 'A$', minorDigits: 2 },
  CAD: { code: 'CAD', symbol: 'C$', minorDigits: 2 },
  AED: { code: 'AED', symbol: 'AED ', minorDigits: 2 },
  SAR: { code: 'SAR', symbol: 'SAR ', minorDigits: 2 },
};

/** Symbols recognised when parsing user input, mapped to their currency. */
const INPUT_SYMBOLS: [string, CurrencyCode][] = [
  ['php', 'PHP'],
  ['₱', 'PHP'],
  ['p', 'PHP'],
  ['us$', 'USD'],
  ['usd', 'USD'],
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
];

const SUFFIX_EXPONENT: Record<string, number> = { k: 3, m: 6, b: 9 };

export function getCurrency(code: CurrencyCode = DEFAULT_CURRENCY): CurrencyInfo {
  const known = CURRENCIES[code.toUpperCase()];
  if (known) return known;
  if (!/^[A-Za-z]{3}$/.test(code)) {
    throw new RangeError(`Invalid currency code: ${code}`);
  }
  const upper = code.toUpperCase();
  return { code: upper, symbol: `${upper} `, minorDigits: 2 };
}

export function isMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertMinor(value: unknown, label = 'amount'): asserts value is number {
  if (!isMinor(value)) {
    throw new TypeError(`${label} must be a safe integer in minor units, got ${String(value)}`);
  }
}

function checked(result: number): number {
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Money result exceeds the safe integer range');
  }
  return result;
}

export function add(a: number, b: number): number {
  assertMinor(a, 'a');
  assertMinor(b, 'b');
  return checked(a + b);
}

export function subtract(a: number, b: number): number {
  assertMinor(a, 'a');
  assertMinor(b, 'b');
  return checked(a - b);
}

export function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    assertMinor(value, 'value');
    total = checked(total + value);
  }
  return total;
}

export function negate(a: number): number {
  assertMinor(a, 'a');
  return a === 0 ? 0 : -a;
}

export function abs(a: number): number {
  assertMinor(a, 'a');
  return Math.abs(a);
}

/** Multiply by a whole number (e.g. monthly amount × months). */
export function multiply(a: number, factor: number): number {
  assertMinor(a, 'a');
  if (!Number.isSafeInteger(factor)) {
    throw new TypeError('factor must be an integer; use allocate() or ratio helpers for fractions');
  }
  return checked(a * factor);
}

/**
 * Split an amount into `parts` integers that add back up exactly.
 * The remainder goes to the first parts: allocate(1000, 3) → [334, 333, 333].
 */
export function allocate(total: number, parts: number): number[] {
  assertMinor(total, 'total');
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new RangeError('parts must be a positive integer');
  }
  const sign = total < 0 ? -1 : 1;
  const absolute = Math.abs(total);
  const base = Math.floor(absolute / parts);
  const remainder = absolute - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)) || 0);
}

/**
 * `part / whole` in basis points (1/100 of a percent), rounded half away from zero.
 * Integer-only, so budget progress like "72%" never touches float money.
 */
export function ratioBps(part: number, whole: number): number {
  assertMinor(part, 'part');
  assertMinor(whole, 'whole');
  if (whole === 0) return 0;
  const numerator = BigInt(part) * 10000n;
  const denominator = BigInt(whole);
  return Number(roundDiv(numerator, denominator));
}

/** Integer division of BigInts, rounding half away from zero. */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

export interface ParsedMoney {
  amountMinor: number;
  /** Currency named in the input ("$20", "usd 20"), if any. */
  currency?: CurrencyCode;
}

/**
 * Parse user-entered money text into minor units.
 *
 * Accepts thousands separators ("1,250.50"), currency symbols or codes ("₱99", "PHP 99",
 * "$20"), magnitude suffixes ("2.5k", "1m", "3b"), and a leading minus. Extra precision
 * beyond the currency's minor digits is rounded half away from zero. Returns null when
 * the text isn't a single amount.
 */
export function parseMoneyDetailed(
  input: string,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): ParsedMoney | null {
  let text = input.trim().toLowerCase().replace(/\s+/g, '');
  if (text === '') return null;

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }

  let detected: CurrencyCode | undefined;
  for (const [symbol, code] of INPUT_SYMBOLS) {
    if (text.startsWith(symbol) && /[\d.-]/.test(text.charAt(symbol.length))) {
      detected = code;
      text = text.slice(symbol.length);
      break;
    }
  }
  if (!detected) {
    const trailing = /^(.*\d)(php|usd)$/.exec(text);
    if (trailing?.[1] && trailing[2]) {
      text = trailing[1];
      detected = trailing[2].toUpperCase();
    }
  }
  if (!negative && text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }

  let exponent = 0;
  const suffix = text.slice(-1);
  if (suffix in SUFFIX_EXPONENT) {
    exponent = SUFFIX_EXPONENT[suffix] ?? 0;
    text = text.slice(0, -1);
  }

  // Thousands separators must sit between groups of exactly three digits.
  if (text.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(text)) return null;
    text = text.replace(/,/g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;

  const [whole = '', fraction = ''] = text.split('.');
  const digits = BigInt(`${whole}${fraction}` || '0');
  const { minorDigits } = getCurrency(detected ?? currency);
  const shift = minorDigits + exponent - fraction.length;

  let minor: bigint;
  if (shift >= 0) {
    minor = digits * 10n ** BigInt(shift);
  } else {
    minor = roundDiv(digits, 10n ** BigInt(-shift));
  }
  if (negative) minor = -minor;

  const amountMinor = Number(minor);
  if (!Number.isSafeInteger(amountMinor)) return null;
  return { amountMinor: amountMinor === 0 ? 0 : amountMinor, currency: detected };
}

/** Like parseMoneyDetailed but returns only the minor-unit amount. */
export function parseMoney(input: string, currency: CurrencyCode = DEFAULT_CURRENCY): number | null {
  return parseMoneyDetailed(input, currency)?.amountMinor ?? null;
}

export interface FormatOptions {
  /** Prefix with the currency symbol (default true). */
  symbol?: boolean;
  /** Group thousands with commas (default true). */
  grouping?: boolean;
  /** 'auto' shows "-" for negatives; 'always' also shows "+" for positives. */
  sign?: 'auto' | 'always' | 'never';
  /** Drop ".00" when the minor part is zero (default false). */
  trimZeroMinor?: boolean;
}

/** Format minor units for display, e.g. 125050 → "₱1,250.50". */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  options: FormatOptions = {},
): string {
  assertMinor(amountMinor, 'amountMinor');
  const { symbol = true, grouping = true, sign = 'auto', trimZeroMinor = false } = options;
  const info = getCurrency(currency);

  const body = toMajorString(Math.abs(amountMinor), info.code, { grouping, trimZeroMinor });
  const prefix = symbol ? info.symbol : '';
  let signText = '';
  if (sign !== 'never') {
    if (amountMinor < 0) signText = '-';
    else if (sign === 'always' && amountMinor > 0) signText = '+';
  }
  return `${signText}${prefix}${body}`;
}

/**
 * Minor units as a plain decimal string, e.g. 125050 → "1250.50".
 * Used to pre-fill amount inputs; parseMoney() reverses it exactly.
 */
export function toMajorString(
  amountMinor: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  options: { grouping?: boolean; trimZeroMinor?: boolean } = {},
): string {
  assertMinor(amountMinor, 'amountMinor');
  const { grouping = false, trimZeroMinor = false } = options;
  const { minorDigits } = getCurrency(currency);
  const negative = amountMinor < 0;
  const digits = String(Math.abs(amountMinor)).padStart(minorDigits + 1, '0');
  const wholeDigits = digits.slice(0, digits.length - minorDigits);
  const fraction = minorDigits > 0 ? digits.slice(-minorDigits) : '';
  const whole = grouping ? wholeDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : wholeDigits;
  const showFraction = fraction !== '' && !(trimZeroMinor && /^0+$/.test(fraction));
  return `${negative ? '-' : ''}${whole}${showFraction ? `.${fraction}` : ''}`;
}

/** Compact display for charts and badges: 1250000 → "₱12.5K". Truncates, never rounds up. */
export function formatCompact(amountMinor: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  assertMinor(amountMinor, 'amountMinor');
  const info = getCurrency(currency);
  const unit = 10 ** info.minorDigits;
  const absolute = Math.abs(amountMinor);
  const wholeUnits = Math.trunc(absolute / unit);
  const tiers: [number, string][] = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
  ];
  const sign = amountMinor < 0 ? '-' : '';
  for (const [size, label] of tiers) {
    if (wholeUnits >= size) {
      const tenths = Math.trunc((wholeUnits * 10) / size);
      const text = tenths % 10 === 0 ? String(tenths / 10) : `${Math.trunc(tenths / 10)}.${tenths % 10}`;
      return `${sign}${info.symbol}${text}${label}`;
    }
  }
  return formatMoney(amountMinor, info.code, { trimZeroMinor: true });
}
