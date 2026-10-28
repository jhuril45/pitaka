import { parseMoney } from '@/lib/money';

/**
 * Pull the total, merchant and date out of OCR'd receipt text (on-device ML
 * Kit output). Philippine receipts typically print the store name first, a
 * TIN / VAT REG line, then items, SUBTOTAL, VAT lines, TOTAL or AMOUNT DUE,
 * CASH and CHANGE. Everything here is a suggestion for the user to confirm.
 */

export interface ReceiptGuess {
  amountMinor: number | null;
  merchant: string | null;
  date: Date | null;
}

/** Ranked total labels: earlier = more trustworthy. */
const TOTAL_LABELS: RegExp[] = [
  /amount\s*due/i,
  /grand\s*total/i,
  /total\s*amount(?!\s*of\s*items)/i,
  /total\s*due/i,
  /net\s*(amount|total)/i,
  /total\s*sales/i,
  /^\s*total\b/i,
  /\btotal\b/i,
];

/** Lines that contain "total"-like words but are not the amount paid. */
const NOT_TOTAL = /sub\s*-?\s*total|total\s*(items?|qty|quantity|pcs|discount|savings)|vatable|vat\s*(able|amount|exempt|zero)|\bvat\b|cash|change|tender|card\b|points|no\.?\s*of/i;

/** Money with two decimals ("1,250.50", "₱ 99.00", "P250.00"). */
const AMOUNT = /(?:php|₱|p)?\s*(\d{1,3}(?:[,\s]\d{3})*\.\d{2}|\d+\.\d{2})(?!\d)/gi;

const NOT_MERCHANT =
  /official\s*receipt|sales\s*invoice|\binvoice\b|receipt|\btin\b|vat\s*reg|non-?vat|tel\.?|telephone|\bst\.?\b|street|brgy|barangay|city|address|\bpos\b|\bmin\b|serial|permit|cashier|date|time|thank|welcome|www\.|\.com/i;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const minor = parseMoney(m[1]!.replace(/\s/g, ''));
    if (minor !== null && minor > 0) out.push(minor);
  }
  return out;
}

export function findReceiptTotal(lines: string[]): number | null {
  for (const label of TOTAL_LABELS) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (!label.test(line) || NOT_TOTAL.test(line)) continue;
      // Amount on the same line, else on the next line (two-column layouts).
      const here = amountsIn(line);
      if (here.length) return here[here.length - 1]!;
      const next = lines[i + 1] ? amountsIn(lines[i + 1]!) : [];
      if (next.length && !NOT_TOTAL.test(lines[i + 1]!)) return next[0]!;
    }
  }
  // No label found: the largest two-decimal amount that isn't cash or change.
  const candidates = lines.filter((l) => !NOT_TOTAL.test(l)).flatMap(amountsIn);
  return candidates.length ? Math.max(...candidates) : null;
}

export function findReceiptMerchant(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.trim();
    const letters = line.replace(/[^\p{L}]/gu, '');
    if (letters.length < 3 || NOT_MERCHANT.test(line) || amountsIn(line).length) continue;
    if (/^\d/.test(line) && letters.length < 5) continue;
    // Title-case shouty receipt headers: "JOLLIBEE FOODS CORP" → "Jollibee Foods Corp".
    const tidy = line.replace(/\s+/g, ' ');
    return tidy === tidy.toUpperCase() ? tidy.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : tidy;
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function findReceiptDate(text: string, now: Date): Date | null {
  const make = (y: number, m: number, d: number) => {
    const year = y < 100 ? 2000 + y : y;
    const date = new Date(year, m, d, 12, 0, 0, 0);
    if (date.getMonth() !== m || date.getDate() !== d) return null;
    // A receipt can't be from the future or more than ~2 years old.
    if (date.getTime() > now.getTime() + 24 * 3600 * 1000) return null;
    if (date.getTime() < now.getTime() - 2 * 366 * 24 * 3600 * 1000) return null;
    return date;
  };
  let m = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (m) return make(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // MM/DD/YYYY or MM-DD-YY (Philippine receipts print month first).
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
  if (m) return make(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  m = /\b(\d{1,2})[-\s]([a-z]{3})[a-z]*[-\s,]+(\d{2,4})\b/i.exec(text);
  if (m && MONTHS.includes(m[2]!.toLowerCase())) return make(Number(m[3]), MONTHS.indexOf(m[2]!.toLowerCase()), Number(m[1]));
  m = /\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(text);
  if (m && MONTHS.includes(m[1]!.toLowerCase())) return make(Number(m[3]), MONTHS.indexOf(m[1]!.toLowerCase()), Number(m[2]));
  return null;
}

export interface PositionedLine {
  text: string;
  top: number;
  height: number;
  left: number;
}

/**
 * Rebuild printed rows from OCR lines with positions. ML Kit returns a
 * two-column receipt as separate blocks ("AMOUNT DUE" in one, "164.00" in
 * another), so labels lose their amounts; lines whose vertical centres line
 * up are joined left-to-right into one row again.
 */
export function rowsFromLines(lines: PositionedLine[]): string[] {
  const sorted = [...lines].filter((l) => l.text.trim()).sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2));
  const rows: { center: number; height: number; parts: PositionedLine[] }[] = [];
  for (const line of sorted) {
    const center = line.top + line.height / 2;
    const row = rows.find((r) => Math.abs(r.center - center) <= Math.max(r.height, line.height) * 0.5);
    if (row) {
      row.parts.push(line);
      row.center = (row.center * (row.parts.length - 1) + center) / row.parts.length;
    } else {
      rows.push({ center, height: line.height, parts: [line] });
    }
  }
  return rows
    .sort((a, b) => a.center - b.center)
    .map((r) =>
      r.parts
        .sort((a, b) => a.left - b.left)
        .map((p) => p.text.trim())
        .join('  '),
    );
}

export function parseReceipt(text: string, now = new Date()): ReceiptGuess {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    amountMinor: findReceiptTotal(lines),
    merchant: findReceiptMerchant(lines),
    date: findReceiptDate(text, now),
  };
}
