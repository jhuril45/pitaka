import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/** App mark: a peso sign in a rounded wallet-shaped tile. */
export function Logo({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Pitaka logo"
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.primary },
      ]}>
      <View
        style={[
          styles.flap,
          { height: size * 0.18, borderTopLeftRadius: size * 0.28, borderTopRightRadius: size * 0.28, backgroundColor: colors.accent },
        ]}
      />
      <Text style={[styles.glyph, { fontSize: size * 0.5, color: colors.onPrimary }]}>₱</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flap: { position: 'absolute', top: 0, left: 0, right: 0 },
  glyph: { fontWeight: '800', marginTop: '12%' },
});
