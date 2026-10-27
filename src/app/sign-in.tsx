import { Link } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { AuthFooter, AuthScreen, useAuthLinkStyle } from '@/features/auth/auth-screen';
import { useTheme } from '@/theme';

export default function SignInScreen() {
  const { login } = useAuth();
  const { colors, spacing } = useTheme();
  const linkStyle = useAuthLinkStyle();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!email || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      // On success the root layout's guard swaps to the app automatically.
      await login({ email, password });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Welcome back! Glad to see you again!"
      footer={
        <AuthFooter>
          Don&apos;t have an account?{' '}
          <Link href="/register" replace style={linkStyle}>
            Register Now
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
        placeholder="Enter your email"
      />
      <TextField
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        placeholder="Enter your password"
        onSubmitEditing={onSubmit}
      />
      <Link
        href="/forgot-password"
        style={{
          alignSelf: 'flex-end',
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: '500',
          marginTop: -spacing.xs,
          marginBottom: spacing.xl,
        }}>
        Forgot Password?
      </Link>
      <Button title="Login" onPress={onSubmit} loading={submitting} disabled={!email || !password} />
    </AuthScreen>
  );
}
