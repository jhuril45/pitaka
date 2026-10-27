import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { categoryTree, useCategories } from '@/data/repos/categories';
import { useCurrentProfileUuid } from '@/stores/profile-store';

export default function CategoriesScreen() {
  const profileUuid = useCurrentProfileUuid();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const { data: categories } = useCategories(profileUuid);
  const tree = categories ? categoryTree(categories, kind) : [];
  const open = (id: string) => router.push({ pathname: '/categories/[id]', params: { id, kind } });

  return (
    <Screen>
      <Segmented
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Button title={`Add ${kind} category`} onPress={() => open('new')} />
      <Card>
        {tree.map((node) => (
          <View key={node.uuid}>
            <ListRow title={node.name} color={node.color} onPress={() => open(node.uuid)} />
            {node.children.map((child) => (
              <ListRow key={child.uuid} title={child.name} indent onPress={() => open(child.uuid)} />
            ))}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
