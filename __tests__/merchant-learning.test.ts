/**
 * Milestone 5: merchant learning, the cached merchant dictionary, and the
 * server's normalizeMerchant staying identical to the app's.
 */
import { normalizeMerchant } from '@/lib/parser';

import { createDevice, tick, type Device } from './helpers/device';
import { createFakeServer, type FakeServer } from './helpers/fake-server';
import { loadCloud } from './helpers/load-cloud';

describe('normalizeMerchant parity (app ↔ cloud/main.js)', () => {
  const cloud = loadCloud().internals;
  it.each(['Starbucks', '  Mang  Inasal - SM Megamall ', "Bo's Coffee", 'Café Niño', '7-ELEVEN #1234', 'Jollibee (Ayala)', 'Ñ & Co.', ''])(
    '%p',
    (text) => {
      expect(cloud.normalizeMerchant(text)).toBe(normalizeMerchant(text));
    },
  );
});

describe('merchant learning and dictionary', () => {
  const USER = 'learner';
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

  it('keeps one mapping per merchant, updates it on a new correction and skips no-op saves', async () => {
    const phone = device();
    const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
    const categories = await phone.categories.listCategories(profileUuid);
    const dining = categories.find((c) => c.name === 'Dining')!;
    const coffee = categories.find((c) => c.name === 'Coffee')!;
    const { learnMerchantCategory, listMerchantMappings } = phone.merchantMappings;

    expect(await learnMerchantCategory(profileUuid, 'Starbucks', dining.uuid)).toBe(true);
    expect(await learnMerchantCategory(profileUuid, '  STARBUCKS ', dining.uuid)).toBe(false);
    await tick();
    expect(await learnMerchantCategory(profileUuid, 'starbucks', coffee.uuid)).toBe(true);
    expect(await learnMerchantCategory(profileUuid, '   ', coffee.uuid)).toBe(false);

    expect(await listMerchantMappings(profileUuid)).toEqual([
      expect.objectContaining({ merchantNormalized: 'starbucks', categoryUuid: coffee.uuid }),
    ]);
    await phone.engine.syncNow();
    expect(server.rows(USER).filter((r) => r.className === 'MerchantMapping')).toHaveLength(1);
  });

  it('a correction learned on one phone reaches the other and wins there', async () => {
    const a = device();
    const profileUuid = await a.profiles.ensureDefaultProfile(USER);
    const categories = await a.categories.listCategories(profileUuid);
    const dining = categories.find((c) => c.name === 'Dining')!;
    await a.merchantMappings.learnMerchantCategory(profileUuid, 'Starbucks', dining.uuid);
    await a.engine.syncNow();

    const b = device();
    await b.engine.syncNow();
    expect(await b.merchantMappings.listMerchantMappings(profileUuid)).toEqual([
      expect.objectContaining({ merchantNormalized: 'starbucks', categoryUuid: dining.uuid }),
    ]);
  });

  it('caches the shared merchant dictionary from bootstrap', async () => {
    server.merchantDictionary.push({ merchantNormalized: 'uniqlo', suggestedCategoryKey: 'shopping', confidenceBps: 9100 });
    const phone = device();
    expect(await phone.sharedCache.loadMerchantDictionary()).toEqual([]);
    await phone.engine.syncNow();
    expect(await phone.sharedCache.loadMerchantDictionary()).toEqual([
      { merchantNormalized: 'uniqlo', suggestedCategoryKey: 'shopping', confidenceBps: 9100 },
    ]);
  });
});
