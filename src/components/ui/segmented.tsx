import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { colors, radius } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.row, { backgroundColor: colors.surfaceMuted, borderRadius: radius.md }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.item, { borderRadius: radius.md - 2 }, selected && { backgroundColor: colors.surface }]}>
            <Text style={[styles.label, { color: selected ? colors.primary : colors.textMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 3 },
  item: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  label: { fontSize: 14, fontWeight: '600' },
});
