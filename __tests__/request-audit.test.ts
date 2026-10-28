/**
 * Request-count audit: local writes never cost one request each. 450 changes
 * made offline go up in ⌈450 / 200⌉ = 3 syncPush requests once back online.
 */
import { createDevice } from './helpers/device';
import { createFakeServer } from './helpers/fake-server';

const USER = 'auditUser001';

it('batches offline changes into ≤ 200-row pushes', async () => {
  const server = createFakeServer();
  const push = jest.spyOn(server, 'push');
  const pull = jest.spyOn(server, 'pull');
  const phone = createDevice(server, USER);
  phone.online = false;

  const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
  const [cash] = await phone.accounts.listAccounts(profileUuid);
  const starter = await phone.outbox.outboxSize();
  for (let i = 0; i < 450 - starter; i += 1) {
    await phone.transactions.saveTransaction({
      profileUuid,
      type: 'expense',
      amountMinor: 100 + i,
      accountUuid: cash!.uuid,
      toAccountUuid: null,
      categoryUuid: null,
      occurredAt: new Date().toISOString(),
      note: '',
      merchant: `Shop ${i}`,
      source: 'manual',
      recurringRuleUuid: null,
      installmentUuid: null,
    });
  }
  expect(push).not.toHaveBeenCalled();

  phone.online = true;
  await phone.engine.syncNow('audit');
  expect(push).toHaveBeenCalledTimes(3);
  expect(push.mock.calls.every(([, changes]) => changes.length <= 200)).toBe(true);
  expect(push.mock.calls.reduce((n, [, changes]) => n + changes.length, 0)).toBe(450);
  // Pulls page by 300+ rows, not per object.
  expect(pull.mock.calls.length).toBeLessThanOrEqual(3);
});
