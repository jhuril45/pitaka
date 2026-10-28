import { View } from 'react-native';

import type { CategoryRecord } from '@shared/index';

import { categoryTree } from '@/data/repos/categories';

import { ListRow } from './ui/list-row';
import { PickerSheet } from './ui/picker-sheet';

interface Props {
  visible: boolean;
  title: string;
  categories: CategoryRecord[];
  type: 'expense' | 'income';
  noneLabel: string;
  onPick: (uuid: string | null) => void;
  onClose: () => void;
}

/** Category tree in a sheet, with a "none" row at the top. */
export function CategoryPickerSheet({ visible, title, categories, type, noneLabel, onPick, onClose }: Props) {
  const pick = (uuid: string | null) => {
    onPick(uuid);
    onClose();
  };
  return (
    <PickerSheet visible={visible} title={title} onClose={onClose}>
      <ListRow title={noneLabel} onPress={() => pick(null)} />
      {categoryTree(categories, type).map((node) => (
        <View key={node.uuid}>
          <ListRow title={node.name} color={node.color} onPress={() => pick(node.uuid)} />
          {node.children.map((child) => (
            <ListRow key={child.uuid} title={child.name} indent onPress={() => pick(child.uuid)} />
          ))}
        </View>
      ))}
    </PickerSheet>
  );
}
