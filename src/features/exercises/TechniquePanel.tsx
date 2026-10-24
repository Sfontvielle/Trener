import React from 'react';
import { View } from 'react-native';
import type { Exercise, Sex } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Icon, T } from '@/components/ui';
import { TechniqueView } from './TechniqueView';

/**
 * Нижний сворачиваемый раздел экрана тренировки: техника выполнения (кадры движения, мышцы, подсказки)
 * и место под 3D-анимацию. Библиотека 3D появится отдельным этапом — сюда она встанет без перестройки экрана.
 */
export function TechniquePanel({ ex, sex }: { ex: Exercise; sex?: Sex }) {
  return (
    <View style={{ gap: space.md }}>
      <Model3DSlot ex={ex} />
      <TechniqueView ex={ex} sex={sex} mediaHeight={180} />
    </View>
  );
}

/** Точка расширения для 3D-модели движения. Пока моделей нет — честно говорим об этом, ничего не изображаем */
export function Model3DSlot({ ex }: { ex: Exercise }) {
  return (
    <View style={styles.slot} accessible accessibilityLabel={`3D-анимация упражнения «${ex.name}» появится в следующих обновлениях`} testID="technique-3d-slot">
      <Icon name="cube-outline" size={18} color={colors.textDim} />
      <T v="small" style={{ flex: 1 }}>
        3D-анимация движения появится в следующих обновлениях
      </T>
    </View>
  );
}

const styles = themed({
  slot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
});
