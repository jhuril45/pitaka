import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { AuthFooter, AuthScreen, useAuthLinkStyle } from '@/features/auth/auth-screen';
import { useTheme } from '@/theme';

/**
 * Asks Back4App to email a link for choosing a new password, then confirms
 * it was sent. The new password is set on Back4App's reset page.
 */
export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const { colors, spacing } = useTheme();
  const linkStyle = useAuthLinkStyle();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit() {
    if (!email.trim()) return;
    setError(null);
    setSending(true);
    try {
      await requestPasswordReset(email);
      setSentTo(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reset email.');
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <AuthScreen showLogo={false}>
        <View style={[styles.sent, { marginTop: spacing.xl * 3, gap: spacing.sm }]}>
          <View style={[styles.badge, { backgroundColor: colors.primaryMuted }]}>
            <Icon name="check" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.sentTitle, { color: colors.text, marginTop: spacing.lg }]}>Check your email</Text>
          <Text style={[styles.sentText, { color: colors.textMuted }]}>
            If an account uses {sentTo}, we&apos;ve sent it a link to choose a new password. Then log in with the new
            one.
          </Text>
          <Button
            title="Back to Login"
            onPress={() => router.dismissTo('/sign-in')}
            style={{ alignSelf: 'stretch', marginTop: spacing.xl }}
          />
          <Button title="Use a different email" variant="ghost" onPress={() => setSentTo(null)} />
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      showLogo={false}
      title="Forgot Password?"
      subtitle="Don't worry! It happens. Please enter the email address linked with your account."
      footer={
        <AuthFooter>
          Remember Password?{' '}
          <Link href="/sign-in" dismissTo style={linkStyle}>
            Login
          </Link>
        </AuthFooter>
      }>
      <ErrorBanner message={error} />
      <TextField
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="Email"
        onSubmitEditing={onSubmit}
      />
      <Button
        title="Send Reset Link"
        onPress={onSubmit}
        loading={sending}
        disabled={!email.trim()}
        style={{ marginTop: spacing.md }}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  sent: { alignItems: 'center' },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  sentTitle: { fontSize: 22, fontWeight: '700' },
  sentText: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
});
