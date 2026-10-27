import { DEFAULT_CATEGORIES } from '@shared/index';

import { normalizeMerchant, parseEntry, type ParseContext } from '@/lib/parser';

// Wednesday, 28 Oct 2026, 3 pm local time.
const NOW = new Date(2026, 9, 28, 15, 0, 0);

const accounts = [
  { uuid: 'cash', name: 'Cash', type: 'cash', templateKey: 'cash' },
  { uuid: 'gcash', name: 'GCash', type: 'ewallet', templateKey: 'gcash' },
  { uuid: 'maya', name: 'Maya', type: 'ewallet', templateKey: 'maya' },
  { uuid: 'bdo', name: 'BDO Savings', type: 'bank', templateKey: 'bdo' },
  { uuid: 'card', name: 'BPI Credit Card', type: 'credit_card', templateKey: 'credit_card' },
];
// Categories as the starter profile creates them; uuid = default key for readability.
const categories = DEFAULT_CATEGORIES.map((c) => ({ uuid: c.key, name: c.name, kind: c.kind, parentUuid: c.parentKey }));

const ctx: ParseContext = { accounts, categories, now: NOW };
const parse = (text: string, extra: Partial<ParseContext> = {}) => parseEntry(text, { ...ctx, ...extra });
const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('spec examples', () => {
  it('Starbucks 250', () => {
    const r = parse('Starbucks 250');
    expect(r).toMatchObject({ type: 'expense', amountMinor: 25000, merchant: 'Starbucks', categoryUuid: 'food.coffee', accountUuid: 'cash' });
    expect(r.occurredAt).toEqual(NOW);
  });

  it('Salary 30k → income', () => {
    expect(parse('Salary 30k')).toMatchObject({ type: 'income', amountMinor: 3000000, merchant: 'Salary', categoryUuid: 'salary' });
  });

  it('Paid credit card 5k last week → transfer to the card, a week ago', () => {
    const r = parse('Paid credit card 5k last week');
    expect(r).toMatchObject({ type: 'transfer', amountMinor: 500000, accountUuid: 'cash', toAccountUuid: 'card', categoryUuid: null });
    expect(day(r.occurredAt)).toEqual([2026, 10, 21]);
  });

  it('Grab 180 yesterday gcash', () => {
    const r = parse('Grab 180 yesterday gcash');
    expect(r).toMatchObject({ type: 'expense', amountMinor: 18000, merchant: 'Grab', accountUuid: 'gcash', categoryUuid: 'transport.ride_hailing' });
    expect(day(r.occurredAt)).toEqual([2026, 10, 27]);
    expect(r.dateText).toBe('yesterday');
  });

  it('Lunch 1,250.50', () => {
    expect(parse('Lunch 1,250.50')).toMatchObject({ amountMinor: 125050, merchant: 'Lunch', categoryUuid: 'food.dining' });
  });

  it('₱99', () => {
    expect(parse('₱99')).toMatchObject({ type: 'expense', amountMinor: 9900, merchant: '', categoryUuid: null });
  });

  it.each([
    ['Milk tea 2.5k', 250000],
    ['Laptop 1m', 100000000],
    ['Rent P8,500', 850000],
    ['php 1000 groceries', 100000],
  ])('%s → %i', (text, minor) => {
    expect(parse(text).amountMinor).toBe(minor);
  });

  it('Received 2000 from Mark → income, asks income-or-debt, finds his open debt', () => {
    const debts = [
      { uuid: 'd1', counterparty: 'mark', direction: 'owed_to_me' as const, settled: false },
      { uuid: 'd2', counterparty: 'Mark', direction: 'owed_to_me' as const, settled: true },
      { uuid: 'd3', counterparty: 'Mark', direction: 'i_owe' as const, settled: false },
      { uuid: 'd4', counterparty: 'Ana', direction: 'owed_to_me' as const, settled: false },
    ];
    const r = parse('Received 2000 from Mark', { debts });
    expect(r).toMatchObject({ type: 'income', amountMinor: 200000, merchant: 'Mark', counterparty: 'Mark', confirm: 'income-or-debt' });
    expect(r.debtMatches.map((d) => d.uuid)).toEqual(['d1']);
  });
});

describe('dates', () => {
  it.each([
    ['Taxi 300 today', [2026, 10, 28]],
    ['Taxi 300 kahapon', [2026, 10, 27]],
    ['Taxi 300 kamakalawa', [2026, 10, 26]],
    ['Taxi 300 3 days ago', [2026, 10, 25]],
    ['Taxi 300 last monday', [2026, 10, 26]],
    ['Taxi 300 monday', [2026, 10, 26]],
    ['Taxi 300 last wednesday', [2026, 10, 21]],
    ['Taxi 300 oct 5', [2026, 10, 5]],
    ['Taxi 300 5 oct', [2026, 10, 5]],
    ['Taxi 300 dec 24', [2025, 12, 24]], // not in the future → last year
    ['Taxi 300 10/5', [2026, 10, 5]],
  ])('%s', (text, expected) => {
    const r = parse(text);
    expect(day(r.occurredAt)).toEqual(expected);
    expect(r.amountMinor).toBe(30000);
  });

  it('does not read "3 days ago" as the amount', () => {
    expect(parse('Load 100 3 days ago').amountMinor).toBe(10000);
  });
});

describe('amounts', () => {
  it('ignores digits glued to words like 7-Eleven', () => {
    expect(parse('7-Eleven 85')).toMatchObject({ amountMinor: 8500, merchant: '7-Eleven' });
  });

  it('prefers a marked amount over a plain number', () => {
    expect(parse('2 tickets ₱500').amountMinor).toBe(50000);
  });

  it('returns a null amount when there is none', () => {
    expect(parse('Coffee').amountMinor).toBeNull();
  });

  it('reports a named foreign currency', () => {
    expect(parse('Netflix $15.99')).toMatchObject({ amountMinor: 1599, currency: 'USD' });
  });
});

describe('accounts and transfers', () => {
  it('fuzzy-matches an account name with one typo', () => {
    expect(parse('Jollibee 199 gcsh').accountUuid).toBe('gcash');
  });

  it('understands aliases like paymaya', () => {
    expect(parse('Shopee 450 paymaya').accountUuid).toBe('maya');
  });

  it('gcash to bdo 1000 → transfer', () => {
    expect(parse('gcash to bdo 1000')).toMatchObject({ type: 'transfer', accountUuid: 'gcash', toAccountUuid: 'bdo', amountMinor: 100000 });
  });

  it('transfer 1000 from bdo to gcash', () => {
    expect(parse('transfer 1000 from bdo to gcash')).toMatchObject({ type: 'transfer', accountUuid: 'bdo', toAccountUuid: 'gcash' });
  });

  it('transfer 500 to maya uses the default account as the source', () => {
    expect(parse('transfer 500 to maya')).toMatchObject({ type: 'transfer', accountUuid: 'cash', toAccountUuid: 'maya' });
  });

  it('paid card 3k from bdo → transfer bdo → card', () => {
    expect(parse('paid card 3k from bdo')).toMatchObject({ type: 'transfer', accountUuid: 'bdo', toAccountUuid: 'card' });
  });

  it('a Taglish "sa" between two accounts is not a transfer by itself', () => {
    expect(parse('Groceries 1500 sa SM bdo').type).toBe('expense');
  });

  it('falls back to the cash account when none is named', () => {
    expect(parse('Merienda 80').accountUuid).toBe('cash');
  });
});

describe('Taglish and categories', () => {
  it.each([
    ['Sweldo 25k', 'income', 'salary'],
    ['sahod 18000', 'income', 'salary'],
    ['Pamasahe 50', 'expense', 'transport.commute'],
    ['kape 120', 'expense', 'food.coffee'],
    ['Meralco 2,345.60', 'expense', 'bills.electricity'],
    ['load globe 100', 'expense', 'bills.mobile'],
    ['gamot 350 mercury drug', 'expense', 'health'],
    ['Freelance 8000', 'income', 'freelance'],
    ['Petron 1500', 'expense', 'transport.fuel'],
    ['Netflix 549', 'expense', 'entertainment'],
  ])('%s → %s / %s', (text, type, category) => {
    expect(parse(text)).toMatchObject({ type, categoryUuid: category });
  });

  it('uses a learned merchant mapping first', () => {
    const r = parse('Starbucks 250', { mappings: [{ merchantNormalized: 'starbucks', categoryUuid: 'food.dining' }] });
    expect(r).toMatchObject({ categoryUuid: 'food.dining', categorySource: 'mapping' });
  });

  it('then the shared merchant dictionary', () => {
    const r = parse('Uniqlo 1999', { dictionary: [{ merchantNormalized: 'uniqlo', suggestedCategoryKey: 'shopping' }] });
    expect(r).toMatchObject({ categoryUuid: 'shopping', categorySource: 'dictionary' });
    const unknown = parse('Kenny Rogers 400', { dictionary: [{ merchantNormalized: 'kenny rogers', suggestedCategoryKey: 'no.such.key' }] });
    expect(unknown.categorySource).not.toBe('dictionary');
  });

  it('ignores a mapping to a deleted category', () => {
    const r = parse('Starbucks 250', { mappings: [{ merchantNormalized: 'starbucks', categoryUuid: 'gone' }] });
    expect(r).toMatchObject({ categoryUuid: 'food.coffee', categorySource: 'keyword' });
  });

  it('matches the user’s own category names', () => {
    const own = [...categories, { uuid: 'pets', name: 'Pets', kind: 'expense' as const, parentUuid: null }];
    expect(parse('pets 600', { categories: own })).toMatchObject({ categoryUuid: 'pets', categorySource: 'name' });
  });
});

describe('normalizeMerchant', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeMerchant("  Mang  Inasal - SM Megamall ")).toBe('mang inasal sm megamall');
    expect(normalizeMerchant("Bo's Coffee")).toBe('bos coffee');
    expect(normalizeMerchant('Café Niño')).toBe('cafe nino');
  });
});
