import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './text';

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Coloured dot / badge on the left. */
  color?: string;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  indent?: boolean;
  accessibilityLabel?: string;
}

/** Tappable row used in lists and pickers. */
export function ListRow({ title, subtitle, color, right, onPress, onLongPress, indent, accessibilityLabel }: ListRowProps) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: spacing.md, paddingLeft: indent ? spacing.xl : 0, gap: spacing.md },
        pressed && onPress ? { opacity: 0.6 } : null,
      ]}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <View style={styles.text}>
        <AppText numberOfLines={1}>{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { flex: 1 },
  divider: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
