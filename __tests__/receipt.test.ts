import { parseReceipt, rowsFromLines } from '@/lib/ocr/receipt';

describe('rowsFromLines (ML Kit column blocks)', () => {
  // ML Kit returns the label column and the amount column as separate blocks.
  const labels = ['SUBTOTAL', 'VATable Sales', 'VAT Amount', 'AMOUNT DUE', 'CASH', 'CHANGE'];
  const amounts = ['164.00', '146.43', '17.57', '164.00', '200.00', '36.00'];
  const lines = [
    { text: 'JOLLIBEE FOODS CORPORATION', top: 60, height: 40, left: 60 },
    ...labels.map((text, i) => ({ text, top: 500 + i * 52, height: 40, left: 60 })),
    ...amounts.map((text, i) => ({ text, top: 503 + i * 52, height: 38, left: 700 })),
  ];

  it('re-joins each label with the amount printed on its row', () => {
    const rows = rowsFromLines(lines);
    expect(rows).toContain('AMOUNT DUE  164.00');
    expect(rows).toContain('CASH  200.00');
    expect(rows[0]).toBe('JOLLIBEE FOODS CORPORATION');
  });

  it('then finds the amount due instead of the cash tendered', () => {
    expect(parseReceipt(rowsFromLines(lines).join('\n')).amountMinor).toBe(16400);
    // Without the rows, the column layout loses the label (what the emulator showed: 200.00).
    const columns = [...labels, ...amounts].join('\n');
    expect(parseReceipt(columns).amountMinor).not.toBe(16400);
  });
});

const NOW = new Date(2026, 9, 28, 15, 0, 0);
const day = (d: Date | null) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);

describe('parseReceipt', () => {
  it('reads a fast-food receipt with AMOUNT DUE, VAT and CHANGE lines', () => {
    const text = `JOLLIBEE FOODS CORPORATION
SM MEGAMALL BRANCH
VAT REG TIN 000-388-474-00001
OFFICIAL RECEIPT
10/27/2026 12:41 PM
1 Chickenjoy 1pc        99.00
1 Jolly Spaghetti       65.00
SUBTOTAL               164.00
VATable Sales          146.43
VAT Amount              17.57
AMOUNT DUE             164.00
CASH                   200.00
CHANGE                  36.00
THANK YOU!`;
    const r = parseReceipt(text, NOW);
    expect(r.amountMinor).toBe(16400);
    expect(r.merchant).toBe('Jollibee Foods Corporation');
    expect(day(r.date)).toEqual([2026, 10, 27]);
  });

  it('prefers GRAND TOTAL over TOTAL and ignores TOTAL ITEMS', () => {
    const text = `MERCURY DRUG
Biogesic 500mg x10      45.50
TOTAL ITEMS: 2
TOTAL                   91.00
Senior discount        -18.20
GRAND TOTAL             72.80
CASH                   100.00`;
    expect(parseReceipt(text, NOW).amountMinor).toBe(7280);
  });

  it('reads a total printed on the next line', () => {
    const text = `7-ELEVEN
Store #1234
Total
₱ 1,250.50
Cash
1,300.00`;
    const r = parseReceipt(text, NOW);
    expect(r.amountMinor).toBe(125050);
    expect(r.merchant).toBe('7-Eleven');
  });

  it('falls back to the largest amount when there is no total label', () => {
    expect(parseReceipt('Sari-sari store\nItem 25.00\nItem 120.00\nItem 8.50', NOW).amountMinor).toBe(12000);
  });

  it('understands other date formats and rejects future or very old dates', () => {
    expect(day(parseReceipt('Shop\nDate: 2026-10-01\nTOTAL 50.00', NOW).date)).toEqual([2026, 10, 1]);
    expect(day(parseReceipt('Shop\n27-Oct-2026\nTOTAL 50.00', NOW).date)).toEqual([2026, 10, 27]);
    expect(day(parseReceipt('Shop\nOct 20, 2026\nTOTAL 50.00', NOW).date)).toEqual([2026, 10, 20]);
    expect(parseReceipt('Shop\n12/25/2026\nTOTAL 50.00', NOW).date).toBeNull();
    expect(parseReceipt('Shop\n01/05/2019\nTOTAL 50.00', NOW).date).toBeNull();
  });

  it('skips header lines that are not the store name', () => {
    const r = parseReceipt('OFFICIAL RECEIPT\nTIN 123-456-789\nPuregold Price Club\nTOTAL 999.75', NOW);
    expect(r.merchant).toBe('Puregold Price Club');
    expect(r.amountMinor).toBe(99975);
  });

  it('returns nulls for text with nothing useful', () => {
    expect(parseReceipt('', NOW)).toEqual({ amountMinor: null, merchant: null, date: null });
  });
});
