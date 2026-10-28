/** Browsers have no secure storage for a PIN: the app lock is phone-only. */

export const PIN_LENGTH = { min: 4, max: 6 };
export const LOCK_SUPPORTED = false;

export async function isLockEnabled(): Promise<boolean> {
  return false;
}

export async function enableLock(_pin: string): Promise<void> {
  throw new Error('App lock is available in the phone app.');
}

export async function clearLock(): Promise<void> {}

export async function getPinLength(): Promise<number> {
  return PIN_LENGTH.max;
}

export async function verifyPin(_pin: string): Promise<boolean> {
  return false;
}

export async function biometricsAvailable(): Promise<boolean> {
  return false;
}

export async function unlockWithBiometrics(): Promise<boolean> {
  return false;
}
