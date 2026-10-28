import { createDevice, tick } from './helpers/device';
import { createFakeServer } from './helpers/fake-server';

const USER = 'userBackup01';

describe('backups', () => {
  it('round-trips a profile into a fresh device, and importing again changes nothing', async () => {
    const server = createFakeServer();
    const phone = createDevice(server, USER);
    const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
    const [cash] = await phone.accounts.listAccounts(profileUuid);
    await phone.transactions.saveTransaction({
      profileUuid,
      type: 'expense',
      amountMinor: 25050,
      accountUuid: cash!.uuid,
      toAccountUuid: null,
      categoryUuid: null,
      occurredAt: new Date().toISOString(),
      note: 'with "quotes", commas',
      merchant: 'Jollibee',
      source: 'manual',
      recurringRuleUuid: null,
      installmentUuid: null,
    });
    const backup = await phone.backup.collectBackup(profileUuid);
    expect(backup.records.Transaction).toHaveLength(1);
    expect(backup.records.Category!.length).toBeGreaterThan(10);

    const other = createDevice(createFakeServer(), 'someoneElse01');
    const parsed = other.backup.parseBackup(JSON.stringify(backup));
    expect(parsed.invalid).toBe(0);
    const first = await other.backup.importBackup(parsed);
    expect(first.skipped).toBe(0);
    expect(await other.transactions.listTransactions(profileUuid)).toHaveLength(1);
    // Parents first: every category's parent exists locally.
    const cats = await other.categories.listCategories(profileUuid);
    expect(cats.every((c) => !c.parentUuid || cats.some((p) => p.uuid === c.parentUuid))).toBe(true);

    await tick();
    const again = await other.backup.importBackup(parsed);
    expect(again.restored).toBe(0);
    expect(again.skipped).toBe(first.restored);
  });

  it('keeps newer local edits and rejects files that are not backups', async () => {
    const phone = createDevice(createFakeServer(), USER);
    const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
    const backup = await phone.backup.collectBackup(profileUuid);
    const [cash] = await phone.accounts.listAccounts(profileUuid);
    await tick();
    await phone.repo.saveRecord('Account', { ...cash!, name: 'Wallet' });
    await phone.backup.importBackup(phone.backup.parseBackup(JSON.stringify(backup)));
    expect((await phone.accounts.listAccounts(profileUuid))[0]!.name).toBe('Wallet');

    expect(() => phone.backup.parseBackup('nope')).toThrow(/isn’t JSON/);
    expect(() => phone.backup.parseBackup('{"format":"other"}')).toThrow(/isn’t a Pitaka backup/);
    expect(() => phone.backup.parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow(/newer version/);
  });

  it('writes transactions as CSV with quoting and plain decimals', () => {
    const phone = createDevice(createFakeServer(), USER);
    const csv = phone.backup.transactionsCsv(
      [{ occurredAt: '2026-10-01T01:00:00.000Z', type: 'expense', amountMinor: 123456, accountUuid: 'a', toAccountUuid: null, categoryUuid: 'c', merchant: 'Jollibee', note: 'say "hi", ok' } as never],
      [{ uuid: 'a', name: 'Cash', currency: 'PHP' } as never],
      [{ uuid: 'c', name: 'Food' } as never],
    );
    expect(csv).toBe('date,type,amount,currency,account,to_account,category,merchant,note\n2026-10-01T01:00:00.000Z,expense,1234.56,PHP,Cash,,Food,Jollibee,"say ""hi"", ok"\n');
  });
});
