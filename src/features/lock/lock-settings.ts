import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * App lock settings, kept in the device's secure storage (Keychain/Keystore).
 * The PIN is stored only as a salted SHA-256 hash. Device-only: never synced.
 */

const ENABLED = 'pitaka.lock.enabled';
const HASH = 'pitaka.lock.pinHash';
const SALT = 'pitaka.lock.salt';
const LENGTH = 'pitaka.lock.pinLength';

export const PIN_LENGTH = { min: 4, max: 6 };
export const LOCK_SUPPORTED = true;

const hashPin = (pin: string, salt: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

export async function isLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENABLED)) === '1';
}

export async function enableLock(pin: string): Promise<void> {
  if (!/^\d+$/.test(pin) || pin.length < PIN_LENGTH.min || pin.length > PIN_LENGTH.max) throw new Error('Use 4 to 6 digits.');
  const salt = randomUUID();
  await SecureStore.setItemAsync(SALT, salt);
  await SecureStore.setItemAsync(HASH, await hashPin(pin, salt));
  await SecureStore.setItemAsync(LENGTH, String(pin.length));
  await SecureStore.setItemAsync(ENABLED, '1');
}

/** Turn the lock off and forget the PIN (also on log out, so the next user starts clean). */
export async function clearLock(): Promise<void> {
  await SecureStore.deleteItemAsync(ENABLED);
  await SecureStore.deleteItemAsync(HASH);
  await SecureStore.deleteItemAsync(SALT);
  await SecureStore.deleteItemAsync(LENGTH);
}

/** How many digits the PIN has (so the lock screen knows when it's complete). */
export async function getPinLength(): Promise<number> {
  const saved = Number(await SecureStore.getItemAsync(LENGTH));
  return saved >= PIN_LENGTH.min && saved <= PIN_LENGTH.max ? saved : PIN_LENGTH.max;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const [salt, hash] = await Promise.all([SecureStore.getItemAsync(SALT), SecureStore.getItemAsync(HASH)]);
  if (!salt || !hash) return false;
  return (await hashPin(pin, salt)) === hash;
}

/** Fingerprint or face unlock, when the phone has one set up. */
export async function biometricsAvailable(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Pitaka', cancelLabel: 'Use PIN', disableDeviceFallback: true });
  return result.success;
}
