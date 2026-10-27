import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

export function ErrorBanner({ message }: { message: string | null }) {
  const { colors, radius, spacing, scheme } = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: scheme === 'dark' ? '#3B1212' : '#FEE2E2',
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: spacing.md,
      }}>
      <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14 },
});
