/**
 * Holding quantities are decimal strings ("0.05", "12.345678") so fractional
 * shares and crypto are exact. Maths here uses BigInt on the scaled digits,
 * never floats; results in money are integer minor units, rounded half up.
 */

export const MAX_QUANTITY_DECIMALS = 12;
const QUANTITY = /^\d+(\.\d{1,12})?$/;

interface Scaled {
  units: bigint;
  scale: number;
}

const TEN = BigInt(10);
const ZERO = BigInt(0);

function pow10(n: number): bigint {
  let out = BigInt(1);
  for (let i = 0; i < n; i += 1) out *= TEN;
  return out;
}

function parse(quantity: string): Scaled {
  if (!QUANTITY.test(quantity)) throw new Error(`Invalid quantity: ${quantity}`);
  const [whole, frac = ''] = quantity.split('.');
  return { units: BigInt(whole! + frac), scale: frac.length };
}

function format({ units, scale }: Scaled): string {
  const digits = units.toString().padStart(scale + 1, '0');
  if (!scale) return digits;
  const whole = digits.slice(0, digits.length - scale);
  const frac = digits.slice(digits.length - scale).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** Clean user input ("1,000.50", " .5 ") into a quantity string, or null if invalid. */
export function normalizeQuantity(input: string): string | null {
  const text = input.replace(/[,\s]/g, '');
  const withZero = text.startsWith('.') ? `0${text}` : text;
  if (!QUANTITY.test(withZero)) return null;
  return format(parse(withZero));
}

export function isZeroQuantity(quantity: string): boolean {
  return parse(quantity).units === ZERO;
}

/** quantity × per-unit amount (minor units), rounded half up to whole minor units. */
export function multiplyQuantity(quantity: string, perUnitMinor: number): number {
  if (!Number.isSafeInteger(perUnitMinor)) throw new Error('perUnitMinor must be an integer');
  const { units, scale } = parse(quantity);
  const product = units * BigInt(perUnitMinor);
  const divisor = pow10(scale);
  const negative = product < ZERO;
  const abs = negative ? -product : product;
  let result = abs / divisor;
  if ((abs % divisor) * BigInt(2) >= divisor) result += BigInt(1);
  const value = Number(negative ? -result : result);
  if (!Number.isSafeInteger(value)) throw new Error('Amount too large');
  return value;
}

export function addQuantities(a: string, b: string): string {
  const x = parse(a);
  const y = parse(b);
  const scale = Math.max(x.scale, y.scale);
  return format({ units: x.units * pow10(scale - x.scale) + y.units * pow10(scale - y.scale), scale });
}

/** Compare two quantities: -1, 0 or 1. */
export function compareQuantities(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  const scale = Math.max(x.scale, y.scale);
  const left = x.units * pow10(scale - x.scale);
  const right = y.units * pow10(scale - y.scale);
  return left === right ? 0 : left < right ? -1 : 1;
}
