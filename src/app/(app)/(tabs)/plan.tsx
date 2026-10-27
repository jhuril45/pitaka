import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';

const SECTIONS = ['Budgets', 'Goals', 'Debts', 'Installments', 'Recurring', 'Cashflow forecast'];

export default function PlanScreen() {
  return (
    <Screen title="Plan">
      {SECTIONS.map((section) => (
        <Card key={section}>
          <AppText variant="heading">{section}</AppText>
          <AppText variant="caption" tone="muted">
            Coming in a later milestone.
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}
