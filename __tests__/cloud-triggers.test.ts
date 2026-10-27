/**
 * @jest-environment node
 *
 * Runs the real beforeSave / beforeDelete / beforeSaveFile handlers from
 * cloud/main.js against Parse Node SDK objects (no server needed).
 */
import { loadCloud } from './helpers/load-cloud';

const { Parse, beforeSave, beforeDelete, beforeSaveFile, functions, jobs, internals } = loadCloud();

const USER_A = 'userA000001';
const USER_B = 'userB000002';
const UUID = '3b241101-e2bb-4255-8caf-4136c566a962';
const PROFILE = '0f8fad5b-d9cb-469f-a165-70867728950e';

function owner(id: string) {
  const user = new Parse.User();
  user.id = id;
  return user;
}

function transaction(fields: Record<string, unknown> = {}) {
  const tx = new Parse.Object('Transaction');
  tx.set({ uuid: UUID, owner: owner(USER_A), profileUuid: PROFILE, type: 'expense', amountMinor: 25000, ...fields });
  return tx;
}

function save(className: string, request: Record<string, unknown>) {
  const handler = beforeSave[className];
  if (!handler) throw new Error(`no beforeSave for ${className}`);
  return () => handler({ master: true, context: {}, ...request });
}

describe('registration', () => {
  it('registers triggers for every class and the M2 functions/jobs', () => {
    const all = [
      ...internals.USER_DATA_CLASSES,
      ...internals.SERVER_OWNED_CLASSES,
      ...internals.SHARED_PUBLIC_CLASSES,
      ...internals.PRIVATE_CLASSES,
    ];
    for (const name of all) {
      expect(beforeSave[name]).toBeInstanceOf(Function);
      expect(beforeDelete[name]).toBeInstanceOf(Function);
    }
    expect(Object.keys(functions).sort()).toEqual(['bootstrap', 'deleteAccount', 'registerDevice', 'syncPull', 'syncPush']);
    expect(Object.keys(jobs).sort()).toEqual(['cleanupInvalidRows', 'seedShared', 'setupSchema']);
    expect(beforeSaveFile).toBeInstanceOf(Function);
  });
});

describe('user-data beforeSave', () => {
  it('refuses client (non-master) writes', () => {
    expect(save('Transaction', { master: false, object: transaction() })).toThrow(/only be changed through sync/);
  });

  it('forces an owner-only ACL and stamps serverUpdatedAt', () => {
    const tx = transaction();
    const before = Date.now();
    save('Transaction', { object: tx })();
    const acl = tx.getACL()!;
    expect(acl.getReadAccess(USER_A)).toBe(true);
    expect(acl.getWriteAccess(USER_A)).toBe(true);
    expect(acl.getPublicReadAccess()).toBe(false);
    expect(acl.getReadAccess(USER_B)).toBe(false);
    expect((tx.get('serverUpdatedAt') as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('replaces a wider ACL the caller tried to set', () => {
    const tx = transaction();
    const open = new Parse.ACL();
    open.setPublicReadAccess(true);
    tx.setACL(open);
    save('Transaction', { object: tx })();
    expect(tx.getACL()!.getPublicReadAccess()).toBe(false);
  });

  it.each([
    ['float', 250.5],
    ['string', '250'],
    ['NaN', Number.NaN],
    ['unsafe', 2 ** 60],
  ])('rejects %s money', (_label, amount) => {
    expect(save('Transaction', { object: transaction({ amountMinor: amount }) })).toThrow(/whole number of centavos/);
  });

  it('accepts null optional money and checks nested template money', () => {
    const account = new Parse.Object('Account');
    account.set({ uuid: UUID, owner: owner(USER_A), profileUuid: PROFILE, openingBalanceMinor: 0, creditLimitMinor: null });
    expect(save('Account', { object: account })).not.toThrow();

    const rule = new Parse.Object('RecurringRule');
    rule.set({ uuid: UUID, owner: owner(USER_A), profileUuid: PROFILE, template: { amountMinor: 549.5 } });
    expect(save('RecurringRule', { object: rule })).toThrow(/template.amountMinor/);
  });

  it('requires owner, uuid and profileUuid', () => {
    expect(save('Transaction', { object: transaction({ owner: undefined }) })).toThrow(/needs an owner/);
    const noOwner = transaction();
    noOwner.unset('owner');
    expect(save('Transaction', { object: noOwner })).toThrow(/needs an owner/);
    expect(save('Transaction', { object: transaction({ uuid: 'not-a-uuid' }) })).toThrow(/valid uuid/);
    expect(save('Transaction', { object: transaction({ profileUuid: null }) })).toThrow(/valid profileUuid/);
  });

  it('lets profile-less and account-wide rows skip profileUuid', () => {
    const profile = new Parse.Object('Profile');
    profile.set({ uuid: UUID, owner: owner(USER_A) });
    expect(save('Profile', { object: profile })).not.toThrow();

    const setting = new Parse.Object('Setting');
    setting.set({ uuid: UUID, owner: owner(USER_A), profileUuid: null, key: 'theme', valueJson: '"dark"' });
    expect(save('Setting', { object: setting })).not.toThrow();
  });

  it('forbids changing uuid or owner on update', () => {
    const original = transaction();
    expect(save('Transaction', { object: transaction({ uuid: '16fd2706-8baf-433b-82eb-8c7fada847da' }), original })).toThrow(
      /uuid cannot change/,
    );
    expect(save('Transaction', { object: transaction({ owner: owner(USER_B) }), original })).toThrow(/owner cannot change/);
  });

  it('allows re-owning only with the reown context (claimAnonymousData)', () => {
    const original = transaction();
    const moved = transaction({ owner: owner(USER_B) });
    save('Transaction', { object: moved, original, context: { reown: true } })();
    expect(moved.getACL()!.getReadAccess(USER_B)).toBe(true);
    expect(moved.getACL()!.getReadAccess(USER_A)).toBe(false);
  });
});

describe('server and shared classes', () => {
  it('refuse client writes and deletes', () => {
    for (const name of ['MonthlySummary', 'Insight', 'BankTemplate', 'PriceSnapshot', 'TrackedSymbol']) {
      expect(() => beforeSave[name]!({ master: false, object: new Parse.Object(name) })).toThrow(/maintained by the server/);
      expect(() => beforeDelete[name]!({ master: false, object: new Parse.Object(name) })).toThrow(/deleted by the server/);
    }
    expect(() => beforeDelete.Transaction!({ master: false, object: transaction() })).toThrow(/deleted by the server/);
  });

  it('gives shared rows a public read-only ACL', () => {
    const bank = new Parse.Object('BankTemplate');
    beforeSave.BankTemplate!({ master: true, object: bank });
    expect(bank.getACL()!.getPublicReadAccess()).toBe(true);
    expect(bank.getACL()!.getPublicWriteAccess()).toBe(false);
  });

  it('gives server-owned rows an owner-only ACL', () => {
    const summary = new Parse.Object('MonthlySummary');
    summary.set('owner', owner(USER_A));
    beforeSave.MonthlySummary!({ master: true, object: summary });
    expect(summary.getACL()!.getReadAccess(USER_A)).toBe(true);
    expect(summary.getACL()!.getPublicReadAccess()).toBe(false);
  });
});

describe('class-level permissions', () => {
  const defs: { className: string; clp: Record<string, any>; fields: Record<string, any>; indexes: Record<string, any> }[] =
    internals.classDefinitions();
  const byName = Object.fromEntries(defs.map((d) => [d.className, d]));

  it('lets owners read user data via pointer permission and blocks all client writes', () => {
    for (const name of internals.USER_DATA_CLASSES) {
      const { clp, fields, indexes } = byName[name]!;
      expect(clp.readUserFields).toEqual(['owner']);
      for (const op of ['get', 'find', 'count', 'create', 'update', 'delete', 'addField']) {
        expect(clp[op]).toEqual({});
      }
      expect(fields.owner).toEqual({ type: 'Pointer', targetClass: '_User' });
      expect(indexes.owner_uuid).toEqual({ _p_owner: 1, uuid: 1 });
      expect(indexes.owner_serverUpdatedAt).toEqual({ _p_owner: 1, serverUpdatedAt: 1 });
    }
    expect(byName.Transaction!.indexes.owner_profile_occurredAt).toEqual({ _p_owner: 1, profileUuid: 1, occurredAt: -1 });
  });

  it('makes shared classes public-read, server-write', () => {
    for (const name of ['PriceSnapshot', 'MerchantDictionary', 'BankTemplate', 'DefaultCategorySet']) {
      const { clp } = byName[name]!;
      expect(clp.find).toEqual({ '*': true });
      expect(clp.get).toEqual({ '*': true });
      expect(clp.create).toEqual({});
      expect(clp.update).toEqual({});
      expect(clp.delete).toEqual({});
    }
  });

  it('hides TrackedSymbol from clients entirely', () => {
    const { clp } = byName.TrackedSymbol!;
    for (const op of ['get', 'find', 'count', 'create', 'update', 'delete']) expect(clp[op]).toEqual({});
    expect(clp.readUserFields).toBeUndefined();
  });
});

describe('file uploads', () => {
  const file = (type: string) => ({ _source: { type } });

  it('requires a signed-in user and an allowed type and size', () => {
    expect(() => beforeSaveFile!({ file: file('image/jpeg'), fileSize: 1000 })).toThrow(/Sign in/);
    expect(() => beforeSaveFile!({ user: {}, file: file('application/x-msdownload'), fileSize: 1000 })).toThrow(/JPEG/);
    expect(() => beforeSaveFile!({ user: {}, file: file('image/png'), fileSize: 11 * 1024 * 1024 })).toThrow(/10 MB/);
    expect(() => beforeSaveFile!({ user: {}, file: file('image/heic'), fileSize: 1000 })).not.toThrow();
  });

  it('lets the server save exports', () => {
    expect(() => beforeSaveFile!({ master: true, file: file('text/csv'), fileSize: 1000 })).not.toThrow();
    expect(() => beforeSaveFile!({ master: true, file: file('text/html'), fileSize: 1000 })).toThrow(/Unsupported/);
  });
});

describe('function input checks', () => {
  it('registerDevice requires a user and a valid token/platform', async () => {
    await expect(functions.registerDevice!({ params: {} })).rejects.toThrow(/sign in/i);
    await expect(
      functions.registerDevice!({ user: owner(USER_A), params: { expoPushToken: 'nope', platform: 'ios' } }),
    ).rejects.toThrow(/Expo push token/);
    await expect(
      functions.registerDevice!({
        user: owner(USER_A),
        params: { expoPushToken: 'ExponentPushToken[abc]', platform: 'windows' },
      }),
    ).rejects.toThrow(/platform/);
  });

  it('deleteAccount requires a user', async () => {
    await expect(functions.deleteAccount!({ params: {} })).rejects.toThrow(/sign in/i);
  });
});
