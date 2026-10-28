import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DateListField } from '@/components/date-list-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { removeNote, saveNote, toggleNote, useNotes } from '@/data/repos/notes';
import { confirm } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const dueLabel = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : isPast(d) ? `Overdue · ${format(d, 'MMM d')}` : format(d, 'EEE, MMM d');
};

/** Quick notes and to-dos about money ("Pay Meralco", "Ask Ana about the ₱500"). */
export default function NotesScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, radius, spacing } = useTheme();
  const { data: notes } = useNotes(profileUuid);
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState<Date | null>(null);

  async function onAdd() {
    if (!body.trim()) return;
    await saveNote({ profileUuid, body: body.trim(), dueAt: dueAt?.toISOString() ?? null, done: false });
    setBody('');
    setDueAt(null);
  }

  if (!notes) return null;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <Card>
        <TextField label="New note" value={body} onChangeText={setBody} placeholder="e.g. Pay Meralco before Friday" multiline maxLength={2000} />
        <DateListField label="Due" value={dueAt} onChange={setDueAt} optional />
        <Button title="Add note" disabled={!body.trim()} onPress={() => void onAdd()} />
      </Card>
      {notes.length === 0 ? <AppText tone="muted">No notes yet.</AppText> : null}
      {notes.map((note) => (
        <View key={note.uuid} style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.md, borderColor: colors.border }]}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: note.done }}
            accessibilityLabel={note.body}
            hitSlop={10}
            onPress={() => {
              haptics.select();
              void toggleNote(note);
            }}
            style={[styles.box, { borderColor: note.done ? colors.primary : colors.border, backgroundColor: note.done ? colors.primary : 'transparent' }]}>
            {note.done ? <Icon name="check" size={16} color={colors.background} /> : null}
          </Pressable>
          <View style={styles.flex}>
            <AppText tone={note.done ? 'muted' : 'default'} style={note.done ? styles.struck : undefined}>
              {note.body}
            </AppText>
            {note.dueAt && !note.done ? (
              <AppText variant="caption" tone={isPast(new Date(note.dueAt)) && !isToday(new Date(note.dueAt)) ? 'danger' : 'muted'}>
                {dueLabel(note.dueAt)}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete note: ${note.body}`}
            hitSlop={10}
            onPress={() =>
              void confirm({ title: 'Delete note?', message: note.body, confirmText: 'Delete', destructive: true }).then((ok) => (ok ? removeNote(note.uuid) : undefined))
            }>
            <Icon name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  struck: { textDecorationLine: 'line-through' },
});
