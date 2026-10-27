import { formatDistanceToNowStrict } from 'date-fns';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSyncStore, type SyncStatus } from '@/stores/sync-store';
import { syncNow } from '@/sync/engine';
import { useTheme } from '@/theme';

import { Icon, type IconName } from './ui/icon';
import { AppText } from './ui/text';

const ICON: Record<SyncStatus, IconName> = {
  idle: 'synced',
  synced: 'synced',
  syncing: 'syncing',
  offline: 'offline',
  error: 'error',
};

export function syncLabel(status: SyncStatus, pending: number, lastSyncedAt: string | null): string {
  switch (status) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return pending ? `Offline · ${pending} to sync` : 'Offline';
    case 'error':
      return 'Sync failed';
    default:
      if (pending) return `${pending} to sync`;
      return lastSyncedAt ? `Synced ${formatDistanceToNowStrict(new Date(lastSyncedAt))} ago` : 'Synced';
  }
}

/** Small status pill; tap to sync now. */
export function SyncIndicator() {
  const { colors, radius, spacing } = useTheme();
  const { status, pending, lastSyncedAt } = useSyncStore();
  const tint = status === 'error' ? colors.danger : status === 'offline' ? colors.warning : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${syncLabel(status, pending, lastSyncedAt)}. Tap to sync now.`}
      onPress={() => void syncNow('indicator')}
      hitSlop={8}>
      <View
        style={[
          styles.pill,
          { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: spacing.md, gap: spacing.xs },
        ]}>
        <Icon name={ICON[status]} size={14} color={tint} />
        <AppText variant="caption" style={{ color: tint }}>
          {syncLabel(status, pending, lastSyncedAt)}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 },
});
