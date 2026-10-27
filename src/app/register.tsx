import { Link } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { AuthFooter, AuthScreen, useAuthLinkStyle } from '@/features/auth/auth-screen';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/auth-service';
import { useTheme } from '@/theme';

export default function RegisterScreen() {
  const auth = useAuth();
  const { spacing } = useTheme();
  const linkStyle = useAuthLinkStyle();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const incomplete = !name || !email || !password || !confirm;

  async function onSubmit() {
    if (incomplete) return;
    if (password !== confirm) return setError('Passwords do not match.');
    setError(null);
    setSubmitting(true);
    try {
      await auth.register({ name, email, password });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Hello! Register to get started"
      footer={
        <AuthFooter>
          Already have an account?{' '}
          <Link href="/sign-in" replace style={linkStyle}>
            Login Now
          </Link>
        </AuthFooter>
      }>
      <ErrorBanner message={error} />
      <TextField value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Name" />
      <TextField
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="Email"
      />
      <TextField
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
      />
      <TextField
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="Confirm password"
        error={mismatch ? 'Passwords do not match.' : undefined}
        onSubmitEditing={onSubmit}
      />
      <Button
        title="Register"
        onPress={onSubmit}
        loading={submitting}
        disabled={incomplete}
        style={{ marginTop: spacing.md }}
      />
    </AuthScreen>
  );
}
