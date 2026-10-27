import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

/**
 * A uuid derived from a seed string: the same seed always gives the same uuid.
 * Used for rows that several devices might create independently (the default
 * profile and its starter categories), so they converge into one row on sync
 * instead of duplicating. Shaped as a version-4 uuid so it passes validation.
 */
export async function stableUuid(seed: string): Promise<string> {
  const hex = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `pitaka:${seed}`);
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
