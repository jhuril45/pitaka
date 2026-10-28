import { format } from 'date-fns';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { AppText } from '@/components/ui/text';
import { listAccounts } from '@/data/repos/accounts';
import { listCategories } from '@/data/repos/categories';
import { useProfile } from '@/data/repos/profiles';
import { listTransactions } from '@/data/repos/transactions';
import { collectBackup, importBackup, parseBackup, transactionsCsv } from '@/features/data/backup';
import { pickTextFile, shareTextFile } from '@/features/data/files';
import { confirm } from '@/lib/confirm';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';

/** Back up the current profile to a file, export transactions as CSV, or restore a backup. */
export default function DataScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, spacing } = useTheme();
  const { data: profile } = useProfile(profileUuid);
  const [busy, setBusy] = useState<'json' | 'csv' | 'import' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'json' | 'csv' | 'import', task: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      setMessage(await task());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  const stamp = format(new Date(), 'yyyy-MM-dd');
  const name = slug(profile?.name ?? 'profile');

  const exportJson = () =>
    run('json', async () => {
      const backup = await collectBackup(profileUuid);
      await shareTextFile(`pitaka-${name}-${stamp}.json`, 'application/json', JSON.stringify(backup));
      const count = Object.values(backup.records).reduce((n, rows) => n + (rows?.length ?? 0), 0);
      return `Backup ready: ${count} records.`;
    });

  const exportCsv = () =>
    run('csv', async () => {
      const [transactions, accounts, categories] = await Promise.all([listTransactions(profileUuid), listAccounts(profileUuid, { includeArchived: true }), listCategories(profileUuid)]);
      await shareTextFile(`pitaka-${name}-transactions-${stamp}.csv`, 'text/csv', transactionsCsv(transactions, accounts, categories));
      return `Exported ${transactions.length} transactions.`;
    });

  const importFile = () =>
    run('import', async () => {
      const text = await pickTextFile();
      if (text === null) return null;
      const parsed = parseBackup(text);
      const ok = await confirm({
        title: `Import “${String(parsed.backup.profile.name)}”?`,
        message: `${parsed.rows.length} records from ${format(new Date(parsed.backup.exportedAt), 'MMM d, yyyy')}. Anything newer on this device is kept.`,
        confirmText: 'Import',
      });
      if (!ok) return null;
      const result = await importBackup(parsed);
      return `Imported ${result.restored} records${result.skipped ? `, kept ${result.skipped} newer ones` : ''}${parsed.invalid ? `, skipped ${parsed.invalid} damaged ones` : ''}.${
        parsed.backup.profile.uuid !== profileUuid ? ' Switch to that profile in Profiles to see it.' : ''
      }`;
    });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <ErrorBanner message={error} />
      {message ? <AppText style={{ color: colors.income }}>{message}</AppText> : null}
      <Card>
        <AppText variant="heading">Back up</AppText>
        <AppText tone="muted">
          Saves {profile?.name ?? 'this profile'} — accounts, categories, budgets, goals, debts, bills, notes, holdings and the last 12 months of
          transactions — to a file you keep. Your data is also always synced to your account.
        </AppText>
        <Button title="Export backup (JSON)" loading={busy === 'json'} disabled={!!busy} onPress={() => void exportJson()} />
        <Button title="Export transactions (CSV)" variant="outline" loading={busy === 'csv'} disabled={!!busy} onPress={() => void exportCsv()} />
      </Card>
      <Card>
        <AppText variant="heading">Restore</AppText>
        <AppText tone="muted">Bring a backup back in. Records already here are only replaced by newer ones, so importing twice is safe.</AppText>
        <Button title="Import a backup" variant="outline" loading={busy === 'import'} disabled={!!busy} onPress={() => void importFile()} />
      </Card>
    </ScrollView>
  );
}
