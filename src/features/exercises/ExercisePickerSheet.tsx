import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { Exercise } from '@/types';
import { Sheet } from '@/components/Sheet';
import { ExerciseList } from './ExerciseList';

export function ExercisePickerSheet({ visible, onClose, onPick, title = 'Добавить упражнение', selectedIds, excludeIds, header }: { visible: boolean; onClose: () => void; onPick: (e: Exercise) => void; title?: string; selectedIds?: string[]; excludeIds?: string[]; header?: React.ReactElement }) {
  const { height } = useWindowDimensions();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} scroll={false} maxHeightPct={0.92}>
      <View style={{ height: height * 0.74 }}>
        {visible ? <ExerciseList onSelect={onPick} selectedIds={selectedIds} excludeIds={excludeIds} header={header} /> : null}
      </View>
    </Sheet>
  );
}
