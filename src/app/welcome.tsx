import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme';

/**
 * Landing screen for signed-out visitors. Plays the splash in three steps: the
 * logo, then the tagline, then the Login and Register buttons.
 */
export default function WelcomeScreen() {
  const { colors, spacing } = useTheme();
  // Animated values live in state (not refs) so reading them during render is allowed.
  const [logo] = useState(() => new Animated.Value(0));
  const [tagline] = useState(() => new Animated.Value(0));
  const [actions] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const appear = (value: Animated.Value) => Animated.timing(value, { toValue: 1, duration: 500, useNativeDriver: true });
    Animated.sequence([appear(logo), Animated.delay(250), appear(tagline), Animated.delay(350), appear(actions)]).start();
  }, [logo, tagline, actions]);

  const rise = (value: Animated.Value) => ({
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background, padding: spacing.xl }]}>
      <View style={[styles.center, { gap: spacing.lg, paddingTop: spacing.xl * 3 }]}>
        <Animated.View
          style={{ opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
          <Logo size={72} />
        </Animated.View>
        <Animated.Text style={[styles.title, { color: colors.text }, rise(tagline)]} accessibilityRole="header">
          Know where every{'\n'}
          <Text style={{ color: colors.primary }}>peso</Text> goes
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, { color: colors.textMuted }, rise(tagline)]}>
          Track spending, budgets and bills — even offline.
        </Animated.Text>
      </View>

      <Animated.View style={[{ gap: spacing.md, paddingBottom: spacing.xl }, rise(actions)]}>
        <Link href="/sign-in" asChild>
          <Button title="Login" variant="outline" />
        </Link>
        <Link href="/register" asChild>
          <Button title="Register" />
        </Link>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
