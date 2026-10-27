import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useTheme } from '@/theme';

interface Mode {
  title: string;
  description: string;
  /** Route to open; null while the feature isn't built yet. */
  onPress: (() => void) | null;
  comingIn?: string;
}

const MODES: Mode[] = [
  {
    title: 'Form',
    description: 'Amount, account, category and date.',
    onPress: () => router.replace('/transaction/new'),
  },
  { title: 'Smart text', description: 'Type “Starbucks 250” or “Salary 30k”.', onPress: null, comingIn: 'Milestone 5' },
  { title: 'Voice', description: 'Say it instead of typing.', onPress: null, comingIn: 'Milestone 6' },
  { title: 'Scan receipt', description: 'Read the total from a photo.', onPress: null, comingIn: 'Milestone 6' },
];

export default function QuickAddScreen() {
  const { colors, spacing } = useTheme();
  return (
    <Screen>
      {MODES.map((mode) => {
        const enabled = !!mode.onPress;
        return (
          <Pressable
            key={mode.title}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            disabled={!enabled}
            onPress={mode.onPress ?? undefined}
            style={({ pressed }) => [{ opacity: enabled ? (pressed ? 0.7 : 1) : 0.55 }]}>
            <Card style={enabled ? { borderColor: colors.primary } : undefined}>
              <View style={[styles.title, { gap: spacing.sm }]}>
                <AppText variant="heading">{mode.title}</AppText>
                {!enabled ? (
                  <AppText variant="caption" tone="muted">
                    · {mode.comingIn}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="caption" tone="muted">
                {mode.description}
              </AppText>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'baseline' },
});
