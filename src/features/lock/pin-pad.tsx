import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { PIN_LENGTH } from './lock-settings';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Dots to show (the PIN length when known, else the max). */
  length?: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** Number pad with dots, for entering a PIN. */
export function PinPad({ value, onChange, length = PIN_LENGTH.max }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg, alignItems: 'center' }}>
      <View style={[styles.row, { gap: spacing.md }]} accessible accessibilityLabel={`${value.length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={[styles.dot, { borderColor: colors.primary, backgroundColor: i < value.length ? colors.primary : 'transparent' }]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, i) =>
          key ? (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={key === '⌫' ? 'Delete' : key}
              onPress={() => (key === '⌫' ? onChange(value.slice(0, -1)) : value.length < PIN_LENGTH.max && onChange(value + key))}
              style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}>
              <AppText variant="title">{key}</AppText>
            </Pressable>
          ) : (
            <View key={i} style={styles.key} />
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 264, justifyContent: 'center' },
  key: { width: 88, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36 },
});
