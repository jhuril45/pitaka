import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { AppText } from '@/components/ui/text';
import { useTheme } from '@/theme';

interface ToastState {
  message: string | null;
  /** Bumped per show, so the same text twice restarts the timer. */
  id: number;
  show: (message: string) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  id: 0,
  show: (message) => set((s) => ({ message, id: s.id + 1 })),
  hide: () => set({ message: null }),
}));

const SHOW_MS = 4500;

/** A short message above the tab bar (e.g. feedback after saving). Tap to dismiss. */
export function Toast() {
  const { message, id, hide } = useToastStore();
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message, id, hide]);

  if (!message) return null;
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityHint="Tap to dismiss"
      onPress={hide}
      style={[
        styles.toast,
        { bottom: insets.bottom + 96, left: spacing.lg, right: spacing.lg, backgroundColor: colors.text, borderRadius: radius.md, padding: spacing.md },
      ]}>
      <AppText style={{ color: colors.background }}>{message}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', maxWidth: 480, alignSelf: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
});
