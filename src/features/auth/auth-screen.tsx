import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme';

/** Go back a screen, or to `fallback` when there's nothing to go back to. */
export function goBack(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * Shared layout for the sign-in, register and forgot-password screens: back
 * button, logo and heading at the top, the form, and a footer link at the bottom.
 */
export function AuthScreen({
  title,
  subtitle,
  showLogo = true,
  footer,
  children,
}: {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingBottom: spacing.lg }}
          keyboardShouldPersistTaps="handled">
          <BackButton onPress={() => goBack('/welcome')} />
          <View style={{ marginTop: spacing.xl * 1.5 }}>
            {showLogo ? <Logo size={44} /> : null}
            {title ? (
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text, marginTop: spacing.xl }]}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textMuted, marginTop: spacing.sm }]}>{subtitle}</Text>
            ) : null}
            <View style={{ marginTop: spacing.xl }}>{children}</View>
          </View>
          {footer ? <View style={[styles.footer, { paddingTop: spacing.xl }]}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Don't have an account? Register Now" style line under the form. */
export function AuthFooter({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.footerText, { color: colors.textMuted }]}>{children}</Text>;
}

/** Bold inline link style for AuthFooter. */
export function useAuthLinkStyle() {
  const { colors } = useTheme();
  return { color: colors.primary, fontWeight: '700' as const };
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={8}
      style={[styles.back, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Icon name="back" size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20 },
  footer: { flexGrow: 1, justifyContent: 'flex-end' },
  footerText: { textAlign: 'center', fontSize: 14 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
