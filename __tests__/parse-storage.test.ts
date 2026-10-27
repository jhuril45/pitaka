jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => (key === 'present' ? 'value' : null)),
    setItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => ['a', 'b']),
    multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, `v-${k}`])),
    removeItem: jest.fn(async () => {
      throw new Error('disk full');
    }),
  },
}));

import { parseAsyncStorage } from '@/parse/storage';

describe('parseAsyncStorage callback bridge', () => {
  it('invokes callbacks with results', async () => {
    const callback = jest.fn();
    await parseAsyncStorage.getItem('present', callback);
    expect(callback).toHaveBeenCalledWith(null, 'value');

    const keysCallback = jest.fn();
    await parseAsyncStorage.getAllKeys(keysCallback);
    expect(keysCallback).toHaveBeenCalledWith(null, ['a', 'b']);

    const multiCallback = jest.fn();
    await parseAsyncStorage.multiGet(['a'], multiCallback);
    expect(multiCallback).toHaveBeenCalledWith(null, [['a', 'v-a']]);
  });

  it('still returns promises when no callback is passed', async () => {
    await expect(parseAsyncStorage.getItem('missing')).resolves.toBeNull();
  });

  it('passes errors to the callback without rejecting', async () => {
    const callback = jest.fn();
    await expect(parseAsyncStorage.removeItem('x', callback)).resolves.toBeUndefined();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }));
  });

  it('rejects when no callback is passed', async () => {
    await expect(parseAsyncStorage.removeItem('x')).rejects.toThrow('disk full');
  });
});
