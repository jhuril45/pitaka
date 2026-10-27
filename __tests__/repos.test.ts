/**
 * Milestone 4 repositories: starter profile, accounts, categories and
 * transactions on top of the sync engine.
 */
import { DEFAULT_CATEGORIES } from '@shared/index';

import { createDevice, tick, type Device } from './helpers/device';
import { createFakeServer, type FakeServer } from './helpers/fake-server';

const USER = 'user-42';
let server: FakeServer;
let devices: Device[];

function device(): Device {
  const d = createDevice(server, USER);
  devices.push(d);
  return d;
}

beforeEach(() => {
  server = createFakeServer();
  devices = [];
});

afterEach(() => {
  for (const d of devices) d.engine.stopSync();
});

describe('starter profile', () => {
  it('creates Personal (PHP) with the default categories and a Cash account, once', async () => {
    const phone = device();
    const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
    expect(await phone.profiles.ensureDefaultProfile(USER)).toBe(profileUuid);

    const profiles = await phone.profiles.listProfiles();
    expect(profiles).toEqual([expect.objectContaining({ uuid: profileUuid, name: 'Personal', baseCurrency: 'PHP' })]);

    const categories = await phone.categories.listCategories(profileUuid);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    const coffee = categories.find((c) => c.name === 'Coffee')!;
    expect(categories.find((c) => c.uuid === coffee.parentUuid)?.name).toBe('Food');

    const accounts = await phone.accounts.listAccounts(profileUuid);
    expect(accounts).toEqual([expect.objectContaining({ name: 'Cash', type: 'cash', currency: 'PHP' })]);
  });

  it('two devices creating it independently converge on the same rows', async () => {
    const a = device();
    const b = device();
    a.online = false;
    b.online = false;
    const pa = await a.profiles.ensureDefaultProfile(USER);
    const pb = await b.profiles.ensureDefaultProfile(USER);
    expect(pa).toBe(pb);

    a.online = true;
    b.online = true;
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    const rows = server.rows(USER);
    expect(rows.filter((r) => r.className === 'Profile')).toHaveLength(1);
    expect(rows.filter((r) => r.className === 'Category')).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(rows.filter((r) => r.className === 'Account')).toHaveLength(1);
  });

  it('never overwrites a profile renamed elsewhere, and logs no sync issue for it', async () => {
    const a = device();
    const profileUuid = await a.profiles.ensureDefaultProfile(USER);
    await a.engine.syncNow();
    const original = (await a.profiles.listProfiles())[0]!;
    await tick();
    await a.repo.saveRecord('Profile', { ...original, name: 'Mine' });
    await a.engine.syncNow();

    // A new phone that couldn't sync first creates the starter rows offline…
    const b = device();
    b.online = false;
    expect(await b.profiles.ensureDefaultProfile(USER)).toBe(profileUuid);
    b.online = true;
    await b.engine.syncNow();

    // …but the real data wins.
    expect((await b.profiles.listProfiles())[0]!.name).toBe('Mine');
    expect(server.rows(USER).find((r) => r.className === 'Profile')!.record.name).toBe('Mine');
    expect(await b.issues.listIssues()).toEqual([]);
  });
});

describe('transactions', () => {
  it('saves, filters, edits and soft-deletes', async () => {
    const phone = device();
    const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
    const [cash] = await phone.accounts.listAccounts(profileUuid);
    const categories = await phone.categories.listCategories(profileUuid);
    const coffee = categories.find((c) => c.name === 'Coffee')!;
    const base = {
      profileUuid,
      accountUuid: cash!.uuid,
      toAccountUuid: null,
      note: '',
      source: 'manual' as const,
      recurringRuleUuid: null,
      installmentUuid: null,
    };

    const latte = await phone.transactions.saveTransaction({
      ...base,
      type: 'expense',
      amountMinor: 18000,
      categoryUuid: coffee.uuid,
      merchant: 'Starbucks',
      occurredAt: new Date().toISOString(),
    });
    await tick();
    await phone.transactions.saveTransaction({
      ...base,
      type: 'income',
      amountMinor: 3000000,
      categoryUuid: categories.find((c) => c.name === 'Salary')!.uuid,
      merchant: 'Payroll',
      occurredAt: new Date().toISOString(),
    });

    const all = await phone.transactions.listTransactions(profileUuid);
    expect(all.map((t) => t.merchant)).toEqual(['Payroll', 'Starbucks']); // newest first
    expect((await phone.transactions.listTransactions(profileUuid, { search: 'starb' })).map((t) => t.uuid)).toEqual([latte.uuid]);
    expect(await phone.transactions.listTransactions(profileUuid, { type: 'income' })).toHaveLength(1);
    expect(await phone.transactions.listTransactions(profileUuid, { categoryUuids: [coffee.uuid] })).toHaveLength(1);

    await phone.transactions.saveTransaction({ ...latte, amountMinor: 20000 });
    expect((await phone.transactions.getTransaction(latte.uuid))?.amountMinor).toBe(20000);

    await phone.transactions.removeTransaction(latte.uuid);
    expect(await phone.transactions.getTransaction(latte.uuid)).toBeNull();
    expect(await phone.transactions.listTransactions(profileUuid)).toHaveLength(1);
  });
});

describe('categories', () => {
  it('builds the tree per kind and deletes children with their parent', async () => {
    const phone = device();
    const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
    const categories = await phone.categories.listCategories(profileUuid);
    const tree = phone.categories.categoryTree(categories, 'expense');
    const food = tree.find((n) => n.name === 'Food')!;
    expect(food.children.map((c) => c.name)).toEqual(['Groceries', 'Dining', 'Coffee']);
    expect(phone.categories.categoryTree(categories, 'income').every((n) => n.kind === 'income')).toBe(true);
    expect(phone.categories.categoryLabel(categories, food.children[2]!.uuid)).toBe('Food › Coffee');

    await phone.categories.removeCategory(categories, food.uuid);
    const after = await phone.categories.listCategories(profileUuid);
    expect(after.find((c) => c.name === 'Food' || c.name === 'Coffee')).toBeUndefined();
  });
});
