/**
 * @jest-environment node
 *
 * Price providers, decimal parsing and getPrices in cloud/main.js (HTTP and
 * Parse queries stubbed).
 */
import { loadCloud } from './helpers/load-cloud';

const { Parse, functions, internals } = loadCloud();

describe('decimalToMinor', () => {
  it('parses provider prices into centavos without float maths', () => {
    expect(internals.decimalToMinor(30.5)).toBe(3050);
    expect(internals.decimalToMinor('5810000.125')).toBe(581000013);
    expect(internals.decimalToMinor(0.004)).toBe(0);
    expect(internals.decimalToMinor(0.005)).toBe(1);
    expect(internals.decimalToMinor('abc')).toBeNull();
    expect(internals.decimalToMinor(-1)).toBeNull();
  });
});

describe('price providers', () => {
  const http = jest.fn();
  beforeEach(() => {
    http.mockReset();
    (Parse.Cloud as any).httpRequest = http;
    delete process.env.FINNHUB_API_KEY;
  });

  it('crypto: known tickers go straight to CoinGecko in PHP', async () => {
    http.mockResolvedValueOnce({ data: { bitcoin: { php: 5810000.5 } } });
    await expect(internals.PRICE_PROVIDERS.crypto('BTC')).resolves.toEqual({ priceMinor: 581000050, currency: 'PHP' });
    expect(http.mock.calls[0][0].url).toContain('ids=bitcoin');
  });

  it('crypto: other tickers are looked up first', async () => {
    http.mockResolvedValueOnce({ data: { coins: [{ id: 'fake', symbol: 'nope' }, { id: 'pepe', symbol: 'pepe' }] } });
    http.mockResolvedValueOnce({ data: { pepe: { php: 0.0007 } } });
    await expect(internals.PRICE_PROVIDERS.crypto('PEPE')).resolves.toEqual({ priceMinor: 0, currency: 'PHP' });
  });

  it('PSE stocks via Phisix', async () => {
    http.mockResolvedValueOnce({ data: { stock: [{ price: { currency: 'PHP', amount: 33.15 } }] } });
    await expect(internals.PRICE_PROVIDERS.ph_stock('JFC')).resolves.toEqual({ priceMinor: 3315, currency: 'PHP' });
  });

  it('US stocks only with a Finnhub key', async () => {
    await expect(internals.PRICE_PROVIDERS.us_stock('AAPL')).resolves.toBeNull();
    expect(http).not.toHaveBeenCalled();
    process.env.FINNHUB_API_KEY = 'k';
    http.mockResolvedValueOnce({ data: { c: 231.4 } });
    await expect(internals.PRICE_PROVIDERS.us_stock('AAPL')).resolves.toEqual({ priceMinor: 23140, currency: 'USD' });
  });
});

describe('getPrices', () => {
  const user = new Parse.User();
  user.id = 'userA000001';
  afterEach(() => jest.restoreAllMocks());

  it('validates the symbol list', async () => {
    await expect(functions.getPrices!({ params: { symbols: [] } })).rejects.toThrow(/sign in/i);
    await expect(functions.getPrices!({ user, params: { symbols: [{ symbol: 'aapl!', assetClass: 'us_stock' }] } })).rejects.toThrow(/valid symbol/);
    await expect(functions.getPrices!({ user, params: { symbols: [{ symbol: 'AAPL', assetClass: 'bonds' }] } })).rejects.toThrow(/valid symbol/);
  });

  it('returns the latest snapshot per symbol', async () => {
    jest.spyOn(Parse.Query.prototype, 'first').mockImplementation(async function (this: any) {
      if (this.className !== 'PriceSnapshot') return undefined;
      const row = new Parse.Object('PriceSnapshot');
      row.set({ priceMinor: 3315, currency: 'PHP', capturedOn: '2026-10-28' });
      return row;
    } as never);
    await expect(functions.getPrices!({ user, params: { symbols: [{ symbol: 'JFC', assetClass: 'ph_stock' }] } })).resolves.toEqual({
      prices: [{ symbol: 'JFC', assetClass: 'ph_stock', priceMinor: 3315, currency: 'PHP', capturedOn: '2026-10-28' }],
    });
  });
});
