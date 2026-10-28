import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { syncLabel } from '@/components/sync-indicator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { getUploadOnCellular, setUploadOnCellular } from '@/features/attachments/attachments';
import { useAuth } from '@/features/auth/auth-context';
import { clearLock } from '@/features/lock/lock-settings';
import { SHARE_MERCHANT_DATA, setAccountSetting, useAccountSetting } from '@/data/repos/settings';
import { deleteAccount } from '@/parse/cloud';
import { readParseConfig } from '@/parse/config';
import { checkLocalDatastore, type DatastoreCheckResult } from '@/parse/self-check';
import { confirm } from '@/lib/confirm';
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
        <ListRow title="Profiles" subtitle="Personal, family or business money, kept apart" onPress={() => router.push('/profiles')} />
        <ListRow title="Notes" subtitle="Quick money notes and to-dos" onPress={() => router.push('/notes')} />
        <ListRow title="Investments" subtitle="Stocks and crypto" onPress={() => router.push('/investments')} />
      </Card>
      <Card>
        <AppText variant="heading">Your data</AppText>
        <ListRow title="Export & import" subtitle="Back up to a file, or bring data back in" onPress={() => router.push('/data')} />
        <ListRow title="App lock" subtitle="Ask for your PIN or fingerprint when opening Pitaka" onPress={() => router.push('/app-lock')} />
        <ListRow title="Older history" subtitle="Transactions from more than 12 months ago" onPress={() => router.push('/history')} />
        <ShareMerchantsRow />
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
    await clearLock();
    await auth.logout();
  }

  async function onLogout() {
    // Logging out clears this device's data, so try to send pending changes first.
    if (useSyncStore.getState().pending > 0) await syncNow('logout');
    const pending = useSyncStore.getState().pending;
    if (!pending) return logoutNow();
    const ok = await confirm({
      title: 'Changes not synced',
      message: `${pending} change${pending === 1 ? '' : 's'} on this device haven’t reached the server yet and will be lost if you log out now.`,
      confirmText: 'Log out anyway',
      destructive: true,
    });
    if (ok) await logoutNow();
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete account?',
      message: 'This permanently deletes your account and all of its data from every device. This can’t be undone.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBusy('delete');
    try {
      await deleteAccount();
      await clearLock();
      await auth.logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account.');
      setBusy(null);
    }
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

/** Opt-in: contribute merchant → category choices (no amounts or dates) to everyone's suggestions. */
function ShareMerchantsRow() {
  const auth = useAuth();
  const { colors, spacing } = useTheme();
  const { data: setting } = useAccountSetting(SHARE_MERCHANT_DATA);
  const on = setting?.value === true;
  if (auth.status !== 'account') return null;
  const userId = auth.account.id;
  return (
    <View style={[styles.switchRow, { gap: spacing.md, paddingVertical: spacing.sm }]}>
      <View style={styles.flex}>
        <AppText>Improve suggestions for everyone</AppText>
        <AppText variant="caption" tone="muted">
          Share which category you pick for each merchant — only the merchant name and category, never amounts or dates.
        </AppText>
      </View>
      <Switch
        accessibilityLabel="Share merchant categories"
        value={on}
        disabled={setting === undefined}
        trackColor={{ true: colors.primary }}
        onValueChange={(next) => void setAccountSetting(userId, SHARE_MERCHANT_DATA, next)}
      />
    </View>
  );
}

function SyncCard() {
  const { colors, spacing } = useTheme();
  const { status, pending, lastSyncedAt, error } = useSyncStore();
  const [cellular, setCellular] = useState<boolean | null>(null);

  useEffect(() => {
    void getUploadOnCellular().then(setCellular);
  }, []);

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
      <View style={[styles.switchRow, { gap: spacing.md, marginTop: spacing.xs }]}>
        <View style={styles.flex}>
          <AppText>Upload receipts on mobile data</AppText>
          <AppText variant="caption" tone="muted">
            Off: receipt photos wait for Wi-Fi.
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Upload receipts on mobile data"
          value={!!cellular}
          disabled={cellular === null}
          trackColor={{ true: colors.primary }}
          onValueChange={(next) => {
            setCellular(next);
            void setUploadOnCellular(next);
          }}
        />
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
