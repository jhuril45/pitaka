import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { AppText } from '@/components/ui/text';
import { useProfileSetup } from '@/data/repos/use-profile-setup';
// Registers the receipt uploader with the sync engine.
import '@/features/attachments/attachments';
import { Toast } from '@/features/feedback/toast';
import { LockGate } from '@/features/lock/lock-gate';
import { useChores } from '@/features/reminders/use-chores';
import { useSyncTriggers } from '@/sync/use-sync-triggers';
import { useTheme } from '@/theme';

export default function AppLayout() {
  // Sync on start, foreground and reconnect while signed in.
  useSyncTriggers();
  const profileUuid = useProfileSetup();

  if (!profileUuid) {
    return <SetupScreen />;
  }
  return <SignedInStack profileUuid={profileUuid} />;
}

function SetupScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.setup, { backgroundColor: colors.background }]}>
      <Logo size={56} />
      <ActivityIndicator color={colors.primary} />
      <AppText tone="muted">Setting up your wallet…</AppText>
    </View>
  );
}

function SignedInStack({ profileUuid }: { profileUuid: string }) {
  // Post due bills/installments and keep reminders current.
  useChores(profileUuid);

  return (
    <LockGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quick-add" options={{ presentation: 'modal', headerShown: true, title: 'Quick add' }} />
        <Stack.Screen name="smart-add" options={{ presentation: 'modal', headerShown: true, title: 'Smart entry' }} />
        <Stack.Screen name="scan-receipt" options={{ presentation: 'modal', headerShown: true, title: 'Scan receipt' }} />
        <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Transaction' }} />
        <Stack.Screen name="accounts/index" options={{ headerShown: true, title: 'Accounts' }} />
        <Stack.Screen name="accounts/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Account' }} />
        <Stack.Screen name="categories/index" options={{ headerShown: true, title: 'Categories' }} />
        <Stack.Screen name="categories/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Category' }} />
        <Stack.Screen name="budgets/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Budget' }} />
        <Stack.Screen name="goals/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Goal' }} />
        <Stack.Screen name="debts/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Debt' }} />
        <Stack.Screen name="installments/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Installment' }} />
        <Stack.Screen name="recurring/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Recurring' }} />
        <Stack.Screen name="forecast" options={{ headerShown: true, title: 'Cashflow forecast' }} />
        <Stack.Screen name="investments/index" options={{ headerShown: true, title: 'Investments' }} />
        <Stack.Screen name="holdings/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Holding' }} />
        <Stack.Screen name="profiles" options={{ headerShown: true, title: 'Profiles' }} />
        <Stack.Screen name="notes" options={{ headerShown: true, title: 'Notes' }} />
        <Stack.Screen name="data" options={{ headerShown: true, title: 'Export & import' }} />
        <Stack.Screen name="app-lock" options={{ headerShown: true, title: 'App lock' }} />
        <Stack.Screen name="history" options={{ headerShown: true, title: 'Older history' }} />
        <Stack.Screen name="statistics" options={{ headerShown: true, title: 'Statistics' }} />
        <Stack.Screen name="sync-issues" options={{ headerShown: true, title: 'Sync issues' }} />
      </Stack>
      {/* Feedback after saving, above every screen. */}
      <Toast />
    </LockGate>
  );
}

const styles = StyleSheet.create({
  setup: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
