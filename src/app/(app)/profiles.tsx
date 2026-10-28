import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { ProfileRecord } from '@shared/index';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { Segmented } from '@/components/ui/segmented';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { createProfile, renameProfile, saveCurrentProfile, useProfiles } from '@/data/repos/profiles';
import { useCurrentProfileUuid, useProfileStore } from '@/stores/profile-store';
import { currentUserId } from '@/sync/session';
import { useTheme } from '@/theme';

type ProfileType = ProfileRecord['type'];

const TYPE_LABEL: Record<ProfileType, string> = { personal: 'Personal', family: 'Family', business: 'Business' };
const CURRENCIES = ['PHP', 'USD'] as const;

/**
 * Profiles keep separate money: their own accounts, categories, budgets and
 * transactions. Switching shows another profile's data (all on this device).
 */
export default function ProfilesScreen() {
  const currentUuid = useCurrentProfileUuid();
  const setProfileUuid = useProfileStore((s) => s.setProfileUuid);
  const { colors, spacing } = useTheme();
  const { data: profiles } = useProfiles();
  const [name, setName] = useState('');
  const [type, setType] = useState<ProfileType>('family');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('PHP');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function switchTo(uuid: string) {
    const userId = await currentUserId();
    if (!userId) return;
    await saveCurrentProfile(userId, uuid);
    setProfileUuid(uuid);
    router.dismissTo('/');
  }

  async function onCreate() {
    if (!name.trim()) return setError('Give the profile a name, like Family or My store.');
    const userId = await currentUserId();
    if (!userId) return;
    setError(null);
    setBusy(true);
    try {
      const uuid = await createProfile(userId, { name: name.trim(), type, baseCurrency: currency });
      setName('');
      await switchTo(uuid);
    } finally {
      setBusy(false);
    }
  }

  async function onRename(profile: ProfileRecord) {
    if (!newName.trim()) return setError('The name can’t be empty.');
    setError(null);
    await renameProfile(profile, newName.trim());
    setRenaming(null);
  }

  if (!profiles) return null;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      <Card>
        {profiles.map((p) =>
          renaming === p.uuid ? (
            <View key={p.uuid} style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
              <TextField label="Profile name" value={newName} onChangeText={setNewName} autoFocus />
              <Button title="Save name" onPress={() => void onRename(p)} />
              <Button title="Cancel" variant="ghost" onPress={() => setRenaming(null)} />
            </View>
          ) : (
            <ListRow
              key={p.uuid}
              title={p.name}
              subtitle={`${TYPE_LABEL[p.type]} · ${p.baseCurrency}${p.uuid === currentUuid ? ' · showing now' : ''}`}
              color={p.color}
              onPress={() => (p.uuid === currentUuid ? undefined : void switchTo(p.uuid))}
              onLongPress={() => {
                setNewName(p.name);
                setRenaming(p.uuid);
              }}
              accessibilityHint="Long-press to rename"
              right={p.uuid === currentUuid ? <Icon name="check" size={22} color={colors.primary} /> : undefined}
            />
          ),
        )}
        <AppText variant="caption" tone="muted">
          Tap to switch. Long-press to rename.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">New profile</AppText>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Family, Sari-sari store" />
        <AppText variant="label" style={{ marginBottom: spacing.xs }}>
          Kind
        </AppText>
        <Segmented<ProfileType>
          options={(['personal', 'family', 'business'] as const).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          value={type}
          onChange={setType}
        />
        <View style={{ height: spacing.md }} />
        <AppText variant="label" style={{ marginBottom: spacing.xs }}>
          Main currency
        </AppText>
        <Segmented<(typeof CURRENCIES)[number]> options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={currency} onChange={setCurrency} />
        <AppText variant="caption" tone="muted" style={{ marginVertical: spacing.sm }}>
          Starts with the usual categories and a Cash account.
        </AppText>
        <Button title="Create and switch" loading={busy} onPress={() => void onCreate()} />
      </Card>
    </ScrollView>
  );
}
