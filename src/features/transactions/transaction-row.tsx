import { router } from 'expo-router';
import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { AccountRecord, CategoryRecord, TransactionRecord } from '@shared/index';

import { MoneyText } from '@/components/money-text';
import { AppText } from '@/components/ui/text';
import { categoryLabel } from '@/data/repos/categories';
import { removeTransaction } from '@/data/repos/transactions';
import { useTheme } from '@/theme';

interface Props {
  tx: TransactionRecord;
  accounts: AccountRecord[];
  categories: CategoryRecord[];
}

/** One transaction; tap to edit, swipe left for Edit / Delete. */
export function TransactionRow({ tx, accounts, categories }: Props) {
  const { colors, spacing } = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const account = accounts.find((a) => a.uuid === tx.accountUuid);
  const to = accounts.find((a) => a.uuid === tx.toAccountUuid);
  const category = categories.find((c) => c.uuid === tx.categoryUuid);
  const title =
    tx.merchant || (tx.type === 'transfer' ? `Transfer to ${to?.name ?? 'account'}` : categoryLabel(categories, tx.categoryUuid));
  const subtitle =
    tx.type === 'transfer'
      ? `${account?.name ?? '?'} → ${to?.name ?? '?'}`
      : `${categoryLabel(categories, tx.categoryUuid)} · ${account?.name ?? 'Deleted account'}`;
  const signed = tx.type === 'expense' ? -tx.amountMinor : tx.amountMinor;
  const edit = () => router.push({ pathname: '/transaction/[id]', params: { id: tx.uuid } });

  function confirmDelete() {
    swipe.current?.close();
    Alert.alert('Delete transaction?', `${title} will be removed from all your devices.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeTransaction(tx.uuid) },
    ]);
  }

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${title}`}
            onPress={() => {
              swipe.current?.close();
              edit();
            }}
            style={[styles.action, { backgroundColor: colors.primary }]}>
            <AppText style={{ color: colors.onPrimary }} variant="label">
              Edit
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${title}`}
            onPress={confirmDelete}
            style={[styles.action, { backgroundColor: colors.danger }]}>
            <AppText style={{ color: colors.onPrimary }} variant="label">
              Delete
            </AppText>
          </Pressable>
        </View>
      )}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Swipe left for more actions"
        onPress={edit}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
          pressed && { opacity: 0.7 },
        ]}>
        <View style={[styles.dot, { backgroundColor: category?.color ?? (tx.type === 'transfer' ? colors.textMuted : colors.border) }]} />
        <View style={styles.text}>
          <AppText numberOfLines={1}>{title}</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        </View>
        <MoneyText
          amountMinor={signed}
          currency={account?.currency}
          tone={tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'muted'}
          options={{ sign: tx.type === 'transfer' ? 'never' : 'always' }}
        />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { flex: 1 },
  actions: { flexDirection: 'row' },
  action: { width: 76, alignItems: 'center', justifyContent: 'center' },
});
