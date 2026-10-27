import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { syncLabel } from '@/components/sync-indicator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-context';
import { deleteAccount } from '@/parse/cloud';
import { readParseConfig } from '@/parse/config';
import { checkLocalDatastore, type DatastoreCheckResult } from '@/parse/self-check';
import { useSyncStore } from '@/stores/sync-store';
import { stopSync, syncNow } from '@/sync/engine';
import { useTheme } from '@/theme';

export default function MoreScreen() {
  return (
    <Screen title="More">
      <AccountCard />
      <Card>
        <AppText variant="heading">Money</AppText>
        <ListRow title="Accounts" subtitle="Banks, e-wallets, cash and cards" onPress={() => router.push('/accounts')} />
        <ListRow title="Categories" subtitle="Expense and income categories" onPress={() => router.push('/categories')} />
      </Card>
      <SyncCard />
      <DiagnosticsCard />
    </Screen>
  );
}

function AccountCard() {
  const auth = useAuth();
  const { spacing } = useTheme();
  const [busy, setBusy] = useState<'logout' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function logoutNow() {
    setBusy('logout');
    stopSync();
    await auth.logout();
  }

  async function onLogout() {
    // Logging out clears this device's data, so try to send pending changes first.
    if (useSyncStore.getState().pending > 0) await syncNow('logout');
    const pending = useSyncStore.getState().pending;
    if (!pending) return logoutNow();
    Alert.alert(
      'Changes not synced',
      `${pending} change${pending === 1 ? '' : 's'} on this device haven’t reached the server yet and will be lost if you log out now.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out anyway', style: 'destructive', onPress: () => void logoutNow() },
      ],
    );
  }

  function onDelete() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all of its data from every device. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setBusy('delete');
            try {
              await deleteAccount();
              await auth.logout();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete the account.');
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  if (auth.status !== 'account') return null;

  return (
    <Card>
      <AppText variant="heading">{auth.account.name || 'Account'}</AppText>
      <AppText tone="muted">{auth.account.email}</AppText>
      <ErrorBanner message={error} />
      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        <Button title="Log out" variant="secondary" loading={busy === 'logout'} disabled={!!busy} onPress={onLogout} />
        <Button title="Delete account" variant="ghost" loading={busy === 'delete'} disabled={!!busy} onPress={onDelete} />
      </View>
    </Card>
  );
}

function SyncCard() {
  const { spacing } = useTheme();
  const { status, pending, lastSyncedAt, error } = useSyncStore();
  return (
    <Card>
      <AppText variant="heading">Sync</AppText>
      <AppText tone={status === 'error' ? 'danger' : 'muted'}>{syncLabel(status, pending, lastSyncedAt)}</AppText>
      {status === 'error' && error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        <Button
          title="Sync now"
          variant="secondary"
          loading={status === 'syncing'}
          onPress={() => void syncNow('manual')}
        />
        <Button title="Sync issues" variant="ghost" onPress={() => router.push('/sync-issues')} />
      </View>
    </Card>
  );
}

function DiagnosticsCard() {
  const auth = useAuth();
  const { colors } = useTheme();
  const [result, setResult] = useState<DatastoreCheckResult | null>(null);
  const [running, setRunning] = useState(false);
  const config = readParseConfig();
  const userId = auth.status === 'account' ? auth.account.id : null;

  async function runCheck() {
    setRunning(true);
    setResult(await checkLocalDatastore());
    setRunning(false);
  }

  return (
    <Card>
      <AppText variant="heading">Diagnostics</AppText>
      <AppText variant="caption" tone="muted">
        Server: {config?.serverURL ?? 'not configured'}
      </AppText>
      <AppText variant="caption" tone="muted">
        User: {userId ?? 'not created yet'}
      </AppText>
      <Button title="Check local datastore" variant="secondary" loading={running} onPress={runCheck} />
      {result ? (
        <AppText style={{ color: result.ok ? colors.income : colors.danger }}>
          {result.ok
            ? `Local datastore OK — pin ${result.pinMs} ms, query ${result.queryMs} ms`
            : `Local datastore failed: ${result.error ?? 'object not found after pin'}`}
        </AppText>
      ) : null}
    </Card>
  );
}
