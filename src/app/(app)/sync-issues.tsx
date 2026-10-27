import { format } from 'date-fns';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useLocalQuery } from '@/data/use-local-query';
import { clearIssues, listIssues, SYNC_ISSUE_CLASS } from '@/sync/issues';
import { useTheme } from '@/theme';

/** Changes that lost a conflict or were refused by the server, newest first. */
export default function SyncIssuesScreen() {
  const { spacing } = useTheme();
  const { data: issues } = useLocalQuery(listIssues, [SYNC_ISSUE_CLASS], []);

  return (
    <Screen>
      {issues && issues.length === 0 ? (
        <Card>
          <AppText variant="heading">No sync issues</AppText>
          <AppText tone="muted">Every change on this device made it to the server.</AppText>
        </Card>
      ) : null}
      {issues?.map((issue) => (
        <Card key={issue.id}>
          <AppText variant="label" tone={issue.kind === 'rejected' ? 'danger' : 'muted'}>
            {issue.kind === 'rejected' ? 'Refused' : 'Conflict'} · {issue.className} ·{' '}
            {format(new Date(issue.at), 'MMM d, h:mm a')}
          </AppText>
          <AppText>{issue.message}</AppText>
          {issue.discarded ? (
            <AppText variant="caption" tone="muted" numberOfLines={4}>
              Discarded: {JSON.stringify(issue.discarded)}
            </AppText>
          ) : null}
        </Card>
      ))}
      {issues?.length ? (
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Clear list" variant="secondary" onPress={() => void clearIssues()} />
        </View>
      ) : null}
    </Screen>
  );
}
