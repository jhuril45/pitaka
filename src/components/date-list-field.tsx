import { addDays, format, isSameDay, isToday, isTomorrow, startOfDay } from 'date-fns';
import { useState } from 'react';

import { useTheme } from '@/theme';

import { SelectField } from './ui/field';
import { Icon } from './ui/icon';
import { ListRow } from './ui/list-row';
import { PickerSheet } from './ui/picker-sheet';
import { AppText } from './ui/text';

interface Props {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  /** Offer "No date" at the top. */
  optional?: boolean;
  /** First day offered, relative to today (negative for past days). */
  fromDays?: number;
  days?: number;
}

const describe = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE, MMM d, yyyy'));

/** Pick a day from a scrollable list (due dates, start dates), defaulting to the next 60 days. */
export function DateListField({ label, value, onChange, optional, fromDays = 0, days = 60 }: Props) {
  const [open, setOpen] = useState(false);
  const { colors, spacing } = useTheme();
  const today = startOfDay(new Date());
  const all = Array.from({ length: days }, (_, i) => addDays(today, fromDays + i));
  // Today and the days after it first; earlier days below, most recent first.
  const upcoming = all.filter((d) => d >= today);
  const earlier = all.filter((d) => d < today).reverse();
  const row = (d: Date) => (
    <ListRow
      key={d.toISOString()}
      title={describe(d)}
      right={value && isSameDay(value, d) ? <Icon name="check" size={20} color={colors.primary} /> : undefined}
      onPress={() => {
        onChange(d);
        setOpen(false);
      }}
    />
  );
  return (
    <>
      <SelectField label={label} value={value ? describe(value) : optional ? 'No date' : undefined} placeholder="Choose a day" onPress={() => setOpen(true)} />
      <PickerSheet visible={open} title={label} onClose={() => setOpen(false)}>
        {optional ? (
          <ListRow
            title="No date"
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        ) : null}
        {upcoming.map(row)}
        {earlier.length ? (
          <AppText variant="label" tone="muted" style={{ paddingTop: spacing.lg, paddingBottom: spacing.xs }}>
            Earlier
          </AppText>
        ) : null}
        {earlier.map(row)}
      </PickerSheet>
    </>
  );
}
