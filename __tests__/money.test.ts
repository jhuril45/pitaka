import {
  abs,
  add,
  allocate,
  assertMinor,
  formatCompact,
  formatMoney,
  getCurrency,
  multiply,
  negate,
  parseMoney,
  parseMoneyDetailed,
  ratioBps,
  subtract,
  sum,
  toMajorString,
} from '@/lib/money';

describe('parseMoney', () => {
  it.each([
    ['250', 25000],
    ['0', 0],
    ['1,250.50', 125050],
    ['1,234,567.89', 123456789],
    ['₱99', 9900],
    ['P500', 50000],
    ['PHP 1,000', 100000],
    ['99php', 9900],
    ['2.5k', 250000],
    ['30k', 3000000],
    ['1m', 100000000],
    ['1.25M', 125000000],
    ['3b', 300000000000],
    ['.5', 50],
    ['12.', 1200],
    ['12.3', 1230],
    ['  45  ', 4500],
    ['-50', -5000],
    ['-₱50', -5000],
    ['₱-50', -5000],
  ])('parses %s → %i', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it('rounds extra precision half away from zero, without floats', () => {
    expect(parseMoney('1.005')).toBe(101);
    expect(parseMoney('1.004')).toBe(100);
    expect(parseMoney('-1.005')).toBe(-101);
    // Classic float trap: 0.1 + 0.2 and 1.15 * 100 are never computed here.
    expect(parseMoney('1.15')).toBe(115);
    expect(parseMoney('4.35')).toBe(435);
  });

  it('uses the target currency minor digits', () => {
    expect(parseMoney('1500', 'JPY')).toBe(1500);
    expect(parseMoney('1.5k', 'JPY')).toBe(1500);
    expect(parseMoney('19.99', 'USD')).toBe(1999);
  });

  it('reports a currency named in the text', () => {
    expect(parseMoneyDetailed('$20')).toEqual({ amountMinor: 2000, currency: 'USD' });
    expect(parseMoneyDetailed('¥500')).toEqual({ amountMinor: 500, currency: 'JPY' });
    expect(parseMoneyDetailed('20')).toEqual({ amountMinor: 2000, currency: undefined });
  });

  it.each(['', 'abc', '1,25', '12,34.5', '1.2.3', 'k', '--5', '5kk', '1,2345', 'NaN', 'Infinity', '1e5'])(
    'rejects %p',
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );

  it('rejects amounts beyond the safe integer range', () => {
    expect(parseMoney('999999999999999999')).toBeNull();
  });

  it('round-trips through toMajorString', () => {
    for (const minor of [0, 1, 9, 10, 99, 100, 125050, -125050, 123456789]) {
      expect(parseMoney(toMajorString(minor))).toBe(minor);
    }
  });
});

describe('formatMoney', () => {
  it('formats PHP with symbol and grouping', () => {
    expect(formatMoney(125050)).toBe('₱1,250.50');
    expect(formatMoney(0)).toBe('₱0.00');
    expect(formatMoney(5)).toBe('₱0.05');
    expect(formatMoney(123456789)).toBe('₱1,234,567.89');
    expect(formatMoney(-9900)).toBe('-₱99.00');
  });

  it('supports sign, symbol and trimming options', () => {
    expect(formatMoney(9900, 'PHP', { sign: 'always' })).toBe('+₱99.00');
    expect(formatMoney(-9900, 'PHP', { sign: 'never' })).toBe('₱99.00');
    expect(formatMoney(9900, 'PHP', { symbol: false })).toBe('99.00');
    expect(formatMoney(9900, 'PHP', { trimZeroMinor: true })).toBe('₱99');
    expect(formatMoney(9950, 'PHP', { trimZeroMinor: true })).toBe('₱99.50');
    expect(formatMoney(123456789, 'PHP', { grouping: false })).toBe('₱1234567.89');
  });

  it('respects zero-decimal currencies and unknown codes', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
    expect(formatMoney(1999, 'USD')).toBe('$19.99');
    expect(formatMoney(1999, 'MYR')).toBe('MYR 19.99');
  });

  it('rejects non-integer input', () => {
    expect(() => formatMoney(12.5)).toThrow(TypeError);
    expect(() => formatMoney(Number.NaN)).toThrow(TypeError);
  });
});

describe('formatCompact', () => {
  it('abbreviates large amounts by truncating', () => {
    expect(formatCompact(1250000)).toBe('₱12.5K');
    expect(formatCompact(100000000)).toBe('₱1M');
    expect(formatCompact(129999)).toBe('₱1.2K');
    expect(formatCompact(-250000)).toBe('-₱2.5K');
    expect(formatCompact(99950)).toBe('₱999.50');
  });
});

describe('arithmetic', () => {
  it('adds, subtracts, sums and negates integers', () => {
    expect(add(10, 20)).toBe(30);
    expect(subtract(10, 25)).toBe(-15);
    expect(sum([100, 200, -50])).toBe(250);
    expect(sum([])).toBe(0);
    expect(negate(5)).toBe(-5);
    expect(Object.is(negate(0), 0)).toBe(true);
    expect(abs(-7)).toBe(7);
    expect(multiply(12500, 12)).toBe(150000);
  });

  it('throws on floats and overflow', () => {
    expect(() => add(0.1, 0.2)).toThrow(TypeError);
    expect(() => sum([1, 2.5])).toThrow(TypeError);
    expect(() => multiply(100, 1.5)).toThrow(TypeError);
    expect(() => add(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(() => assertMinor('100')).toThrow(TypeError);
  });

  it('allocates without losing centavos', () => {
    expect(allocate(1000, 3)).toEqual([334, 333, 333]);
    expect(allocate(-1000, 3)).toEqual([-334, -333, -333]);
    expect(allocate(0, 2)).toEqual([0, 0]);
    expect(sum(allocate(9999999, 7))).toBe(9999999);
    expect(() => allocate(100, 0)).toThrow(RangeError);
  });

  it('computes ratios in basis points', () => {
    expect(ratioBps(7200, 10000)).toBe(7200);
    expect(ratioBps(1, 3)).toBe(3333);
    expect(ratioBps(2, 3)).toBe(6667);
    expect(ratioBps(15000, 10000)).toBe(15000);
    expect(ratioBps(5, 0)).toBe(0);
  });
});

describe('getCurrency', () => {
  it('defaults to PHP and validates codes', () => {
    expect(getCurrency()).toMatchObject({ code: 'PHP', symbol: '₱', minorDigits: 2 });
    expect(getCurrency('php').code).toBe('PHP');
    expect(() => getCurrency('PESO')).toThrow(RangeError);
  });
});
