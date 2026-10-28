/**
 * Milestone 6: receipt photos queue on the device, upload on the next sync and
 * become an Attachment row that syncs; a failed upload stays queued.
 */
import { createDevice, type Device } from './helpers/device';
import { createFakeServer, type FakeServer } from './helpers/fake-server';

const USER = 'snapper';
let server: FakeServer;
let phone: Device;
let attachments: typeof import('@/features/attachments/attachments');

beforeEach(() => {
  server = createFakeServer();
  phone = createDevice(server, USER);
  attachments = phone.attachments;
});
afterEach(() => phone.engine.stopSync());

async function aTransaction() {
  const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
  const [cash] = await phone.accounts.listAccounts(profileUuid);
  const tx = await phone.transactions.saveTransaction({
    profileUuid,
    type: 'expense',
    amountMinor: 16400,
    accountUuid: cash!.uuid,
    toAccountUuid: null,
    categoryUuid: null,
    occurredAt: new Date().toISOString(),
    note: '',
    merchant: 'Jollibee',
    source: 'ocr',
    recurringRuleUuid: null,
    installmentUuid: null,
  });
  return { profileUuid, tx };
}

it('keeps a photo queued while the upload fails, then attaches it once it succeeds', async () => {
  const { profileUuid, tx } = await aTransaction();
  await attachments.queueAttachment({ profileUuid, transactionUuid: tx.uuid, base64: 'aGVsbG8=', ocrText: 'AMOUNT DUE 164.00' });
  expect(await attachments.pendingAttachments(tx.uuid)).toHaveLength(1);

  // The fake device has no file server: the upload fails and the photo waits.
  await phone.engine.syncNow();
  expect(await attachments.pendingAttachments(tx.uuid)).toHaveLength(1);
  expect(await attachments.listAttachments(profileUuid, tx.uuid)).toEqual([]);

  // Now let uploads succeed.
  const FileClass = phone.Parse.File as unknown as { prototype: Record<string, unknown> };
  const save = jest.spyOn(FileClass.prototype as { save: () => Promise<unknown> }, 'save').mockImplementation(function (this: { _name?: string; _url?: string }) {
    (this as Record<string, unknown>)._url = `https://files.example/${(this as { _name: string })._name}`;
    return Promise.resolve(this);
  });
  jest.spyOn(FileClass.prototype as { url: () => string }, 'url').mockImplementation(function (this: { _url?: string }) {
    return this._url ?? '';
  });

  await phone.engine.syncNow();
  expect(save).toHaveBeenCalledTimes(1);
  expect(await attachments.pendingAttachments(tx.uuid)).toEqual([]);
  const [row] = await attachments.listAttachments(profileUuid, tx.uuid);
  expect(row).toMatchObject({ transactionUuid: tx.uuid, mime: 'image/jpeg', ocrText: 'AMOUNT DUE 164.00' });
  expect(row!.file?.url).toMatch(/^https:\/\/files\.example\/receipt-/);

  // The Attachment row syncs like any other record (it is pushed on the next cycle).
  await phone.engine.syncNow();
  expect(server.rows(USER).filter((r) => r.className === 'Attachment')).toHaveLength(1);
});

it('remembers the mobile-data upload preference', async () => {
  expect(await attachments.getUploadOnCellular()).toBe(false);
  await attachments.setUploadOnCellular(true);
  expect(await attachments.getUploadOnCellular()).toBe(true);
});
