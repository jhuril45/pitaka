import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './text';

/** Label + tappable value box (opens a picker); shows an error under it. */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  error,
  left,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  error?: string;
  left?: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        onPress={onPress}
        style={[
          styles.box,
          {
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            borderColor: error ? colors.danger : 'transparent',
            gap: spacing.sm,
          },
        ]}>
        {left}
        <AppText tone={value ? 'default' : 'muted'} numberOfLines={1} style={styles.value}>
          {value ?? placeholder}
        </AppText>
        <AppText tone="muted">▾</AppText>
      </Pressable>
      {error ? (
        <AppText variant="caption" tone="danger" style={{ marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  value: { flex: 1 },
});
