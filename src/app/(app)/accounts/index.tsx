import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useAccountBalances } from '@/data/repos/use-balances';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const TYPE_LABEL: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  ewallet: 'E-wallet',
  credit_card: 'Credit card',
  investment: 'Investment',
  loan: 'Loan',
};

export default function AccountsScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { spacing } = useTheme();
  const [showArchived, setShowArchived] = useState(false);
  const { accounts, balances } = useAccountBalances(profileUuid, { includeArchived: true });
  const visible = accounts?.filter((a) => showArchived || !a.archived) ?? [];
  const archivedCount = accounts?.filter((a) => a.archived).length ?? 0;

  return (
    <Screen>
      <Button title="Add account" onPress={() => router.push('/accounts/new')} />
      <Card>
        {visible.length === 0 ? <AppText tone="muted">No accounts yet.</AppText> : null}
        {visible.map((account) => (
          <ListRow
            key={account.uuid}
            title={account.archived ? `${account.name} (archived)` : account.name}
            subtitle={TYPE_LABEL[account.type]}
            color={account.color}
            onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: account.uuid } })}
            right={
              balances ? (
                <MoneyText
                  amountMinor={balances.get(account.uuid) ?? 0}
                  currency={account.currency}
                  tone={(balances.get(account.uuid) ?? 0) < 0 ? 'expense' : 'default'}
                />
              ) : null
            }
          />
        ))}
      </Card>
      {archivedCount ? (
        <View style={{ marginTop: -spacing.sm }}>
          <Button
            title={showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            variant="ghost"
            onPress={() => setShowArchived((v) => !v)}
          />
        </View>
      ) : null}
      <AppText variant="caption" tone="muted">
        Balances are worked out from your opening balance and every transaction on this device (the last 12 months).
      </AppText>
    </Screen>
  );
}
