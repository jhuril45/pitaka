import { portfolioTotals, priceKey, valueHolding, type PriceQuote } from '@/lib/portfolio';
import { addQuantities, compareQuantities, isZeroQuantity, multiplyQuantity, normalizeQuantity } from '@/lib/quantity';

describe('quantity maths', () => {
  it('normalizes input', () => {
    expect(normalizeQuantity('1,000.50')).toBe('1000.5');
    expect(normalizeQuantity(' .25 ')).toBe('0.25');
    expect(normalizeQuantity('007')).toBe('7');
    expect(normalizeQuantity('1.0000000000001')).toBeNull(); // 13 decimals
    expect(normalizeQuantity('-1')).toBeNull();
    expect(normalizeQuantity('abc')).toBeNull();
  });

  it('multiplies exactly and rounds half up to centavos', () => {
    expect(multiplyQuantity('100', 3315)).toBe(331500);
    expect(multiplyQuantity('0.1', 3)).toBe(0); // 0.3 centavo
    expect(multiplyQuantity('0.5', 3)).toBe(2); // 1.5 → 2
    expect(multiplyQuantity('0.00012345', 581000050)).toBe(71724); // 71724.456…
    // Floats would drift here: 0.1 + 0.2 shares at ₱100.
    expect(multiplyQuantity(addQuantities('0.1', '0.2'), 10000)).toBe(3000);
    expect(multiplyQuantity('123456789.123456789012', 100)).toBe(12345678912);
  });

  it('adds and compares', () => {
    expect(addQuantities('1.25', '0.75')).toBe('2');
    expect(compareQuantities('0.10', '0.1')).toBe(0);
    expect(compareQuantities('2', '10')).toBe(-1);
    expect(isZeroQuantity('0.000')).toBe(true);
  });
});

describe('portfolio', () => {
  const meta = { profileUuid: 'p', clientUpdatedAt: '', deletedAt: null, serverUpdatedAt: null, accountUuid: 'inv' };
  const jfc = { ...meta, uuid: 'h1', symbol: 'JFC', assetClass: 'ph_stock', quantity: '100', avgCostMinor: 25000, currency: 'PHP', manualPriceMinor: null } as const;
  const btc = { ...meta, uuid: 'h2', symbol: 'BTC', assetClass: 'crypto', quantity: '0.01', avgCostMinor: 400000000, currency: 'PHP', manualPriceMinor: 300000000 } as const;
  const fund = { ...meta, uuid: 'h3', symbol: 'MYFUND', assetClass: 'ph_stock', quantity: '10', avgCostMinor: 10000, currency: 'PHP', manualPriceMinor: null } as const;
  const aapl = { ...meta, uuid: 'h4', symbol: 'AAPL', assetClass: 'us_stock', quantity: '2', avgCostMinor: 20000, currency: 'USD', manualPriceMinor: null } as const;
  const quote = (q: Partial<PriceQuote> & Pick<PriceQuote, 'symbol' | 'assetClass' | 'priceMinor'>): [string, PriceQuote] => [
    priceKey(q.assetClass, q.symbol),
    { currency: 'PHP', capturedOn: '2026-10-28', ...q },
  ];
  const prices = new Map([
    quote({ symbol: 'JFC', assetClass: 'ph_stock', priceMinor: 30000 }),
    quote({ symbol: 'AAPL', assetClass: 'us_stock', priceMinor: 23000, currency: 'USD' }),
  ]);

  it('values holdings from market prices, else the manual price', () => {
    const j = valueHolding(jfc as never, prices);
    expect([j.priceSource, j.costMinor, j.marketMinor, j.plMinor, j.plBps]).toEqual(['market', 2500000, 3000000, 500000, 2000]);
    const b = valueHolding(btc as never, prices);
    expect([b.priceSource, b.marketMinor, b.plMinor, b.plBps]).toEqual(['manual', 3000000, -1000000, -2500]);
    const f = valueHolding(fund as never, prices);
    expect([f.priceSource, f.marketMinor, f.plMinor]).toEqual(['none', null, null]);
  });

  it('totals per currency with allocation by asset class', () => {
    const totals = portfolioTotals([jfc, btc, fund, aapl].map((h) => valueHolding(h as never, prices)));
    expect(totals).toEqual([
      {
        currency: 'PHP',
        valueMinor: 3000000 + 3000000 + 100000,
        costMinor: 2500000 + 4000000 + 100000,
        plMinor: 500000 - 1000000,
        plBps: -758,
        allocation: [
          { assetClass: 'ph_stock', valueMinor: 3100000, shareBps: 5082 },
          { assetClass: 'crypto', valueMinor: 3000000, shareBps: 4918 },
        ],
      },
      { currency: 'USD', valueMinor: 46000, costMinor: 40000, plMinor: 6000, plBps: 1500, allocation: [{ assetClass: 'us_stock', valueMinor: 46000, shareBps: 10000 }] },
    ]);
  });
});
