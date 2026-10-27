import { addDays, format, isSameDay, startOfDay, subDays } from 'date-fns';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './ui/icon';
import { AppText } from './ui/text';

/** Pick a day: Today / Yesterday chips plus ‹ › to step one day. Keeps the time of day. */
export function DayStepper({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const { colors, radius, spacing } = useTheme();
  const today = startOfDay(new Date());
  const isToday = isSameDay(value, today);
  const isYesterday = isSameDay(value, subDays(today, 1));
  const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : format(value, 'EEE, MMM d, yyyy');
  const atDay = (day: Date) => {
    const next = new Date(day);
    next.setHours(value.getHours(), value.getMinutes(), value.getSeconds(), 0);
    onChange(next);
  };
  const canGoForward = !isToday;

  return (
    <View style={{ marginBottom: spacing.md, gap: spacing.xs }}>
      <AppText variant="label">Date</AppText>
      <View style={[styles.row, { backgroundColor: colors.surfaceMuted, borderRadius: radius.md }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => atDay(subDays(value, 1))} style={styles.arrow}>
          <Icon name="back" size={18} color={colors.text} />
        </Pressable>
        <AppText style={styles.label} accessibilityLiveRegion="polite">
          {label}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: !canGoForward }}
          disabled={!canGoForward}
          onPress={() => atDay(addDays(value, 1))}
          style={[styles.arrow, { transform: [{ rotate: '180deg' }], opacity: canGoForward ? 1 : 0.3 }]}>
          <Icon name="back" size={18} color={colors.text} />
        </Pressable>
      </View>
      <View style={[styles.chips, { gap: spacing.sm }]}>
        {[
          { label: 'Today', day: today, on: isToday },
          { label: 'Yesterday', day: subDays(today, 1), on: isYesterday },
        ].map((chip) => (
          <Pressable
            key={chip.label}
            accessibilityRole="button"
            accessibilityState={{ selected: chip.on }}
            onPress={() => atDay(chip.day)}
            style={[
              styles.chip,
              { borderRadius: radius.pill, borderColor: chip.on ? colors.primary : colors.border, backgroundColor: chip.on ? colors.primaryMuted : 'transparent' },
            ]}>
            <AppText variant="caption" style={{ color: chip.on ? colors.primary : colors.textMuted }}>
              {chip.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50 },
  arrow: { width: 48, height: 50, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, textAlign: 'center', fontWeight: '600' },
  chips: { flexDirection: 'row' },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
});
