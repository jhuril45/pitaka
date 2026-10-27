import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CategoryRecord } from '@shared/index';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { SelectField } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { PickerSheet } from '@/components/ui/picker-sheet';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { listCategories, removeCategory, saveCategory } from '@/data/repos/categories';
import { confirm } from '@/lib/confirm';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { useTheme } from '@/theme';

const COLORS = ['#F97316', '#3B82F6', '#8B5CF6', '#0EA5E9', '#EC4899', '#EF4444', '#A855F7', '#14B8A6', '#F59E0B', '#16A34A', '#64748B', '#E11D48'];

export default function CategoryScreen() {
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: 'expense' | 'income' }>();
  const profileUuid = useCurrentProfileUuid();
  const { colors, radius, spacing } = useTheme();
  const isNew = id === 'new';
  const [all, setAll] = useState<CategoryRecord[] | null>(null);
  const [name, setName] = useState('');
  const [parentUuid, setParentUuid] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [pickParent, setPickParent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listCategories(profileUuid).then((categories) => {
      setAll(categories);
      const existing = categories.find((c) => c.uuid === id);
      if (existing) {
        setName(existing.name);
        setParentUuid(existing.parentUuid);
        setColor(existing.color);
      }
    });
  }, [id, profileUuid]);

  if (!all) return null;
  const existing = all.find((c) => c.uuid === id) ?? null;
  const kind = existing?.kind ?? kindParam ?? 'expense';
  const hasChildren = !!existing && all.some((c) => c.parentUuid === existing.uuid);
  // Only top-level categories can be parents (two levels), and never itself.
  const parents = all.filter((c) => c.kind === kind && !c.parentUuid && c.uuid !== existing?.uuid);

  async function onSave() {
    if (!name.trim()) return setError('Enter a name.');
    setError(null);
    setSaving(true);
    try {
      await saveCategory({
        uuid: existing?.uuid,
        profileUuid,
        parentUuid: hasChildren ? null : parentUuid,
        name: name.trim(),
        kind,
        icon: existing?.icon ?? 'other',
        color,
        sortOrder: existing?.sortOrder ?? all!.length * 10,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete category?',
      message: hasChildren
        ? 'Its subcategories are deleted too. Their transactions become uncategorized.'
        : 'Its transactions become uncategorized.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await removeCategory(all!, existing!.uuid);
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} />
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
        {kind === 'income' ? 'Income' : 'Expense'} category
      </AppText>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Milk tea" autoFocus={isNew} />
      {hasChildren ? null : (
        <SelectField
          label="Inside"
          value={parentUuid ? parents.find((p) => p.uuid === parentUuid)?.name : 'Top level'}
          placeholder="Top level"
          onPress={() => setPickParent(true)}
        />
      )}
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        Color
      </AppText>
      <View style={[styles.swatches, { gap: spacing.sm, marginBottom: spacing.lg }]}>
        {COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={`Color ${c}`}
            accessibilityState={{ selected: c === color }}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c, borderRadius: radius.pill, borderColor: c === color ? colors.text : 'transparent' }]}
          />
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button title={isNew ? 'Add category' : 'Save changes'} onPress={onSave} loading={saving} />
        {existing ? <Button title="Delete category" variant="ghost" onPress={onDelete} /> : null}
      </View>

      <PickerSheet visible={pickParent} title="Inside" onClose={() => setPickParent(false)}>
        <ListRow
          title="Top level"
          onPress={() => {
            setParentUuid(null);
            setPickParent(false);
          }}
        />
        {parents.map((p) => (
          <ListRow
            key={p.uuid}
            title={p.name}
            color={p.color}
            onPress={() => {
              setParentUuid(p.uuid);
              setPickParent(false);
            }}
          />
        ))}
      </PickerSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderWidth: 3 },
});
