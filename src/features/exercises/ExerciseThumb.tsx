import React, { memo } from 'react';
import { View } from 'react-native';
import type { Exercise } from '@/types';
import { colors, radius, themed } from '@/theme';
import { MiniFigure } from './Anatomy';

/**
 * Миниатюра упражнения в списках: схема мышц — сторона фигуры с основными мышцами, кадр по ним
 * (без фото атлета и без 3D).
 */
export const ExerciseThumb = memo(function ExerciseThumb({ ex, size = 64 }: { ex: Exercise; size?: number }) {
  return (
    <View style={[styles.thumb, styles.map, { width: size, height: size }]} accessible={false}>
      <MiniFigure primary={ex.primary} secondary={ex.secondary} size={size} exerciseId={ex.id} />
    </View>
  );
});

/** Раньше здесь была «гифка» из двух фото; теперь списки показывают ту же миниатюру (без анимации в каждой строке) */
export const ExerciseLoop = memo(function ExerciseLoop({ ex, size = 64 }: { ex: Exercise; size?: number; delay?: number }) {
  return <ExerciseThumb ex={ex} size={size} />;
});

const styles = themed({
  thumb: { borderRadius: radius.md, overflow: 'hidden' },
  map: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
