import * as Haptics from 'expo-haptics';

/** Small, purposeful vibrations. Never throw: haptics are a nicety. */
export const haptics = {
  /** Something was saved. */
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  /** Something went wrong (e.g. a wrong PIN). */
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
  /** A toggle or choice changed. */
  select: () => void Haptics.selectionAsync().catch(() => undefined),
};
