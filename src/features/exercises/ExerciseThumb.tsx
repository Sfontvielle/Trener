import React, { memo } from 'react';
import { Image, View } from 'react-native';
import type { Exercise } from '@/types';
import { colors, radius, themed } from '@/theme';
import { EXERCISE_ANIMATIONS } from '@/data/exerciseAnimations';
import { MiniFigure } from './Anatomy';
import { mediaFor } from './ExerciseAnimation';
import { useProfile } from '@/stores/profile';

/** Постер 3D-рендера (середина амплитуды) — только для упражнений, у которых есть своя 3D-петля */
function Poster({ src, size }: { src: number; size: number }) {
  return <Image source={src} style={[styles.thumb, styles.poster, { width: size, height: size }]} resizeMode="cover" accessibilityIgnoresInvertColors />;
}

/**
 * Миниатюра упражнения в списках: постер своей 3D-петли, иначе нейтральная схема мышц —
 * сторона фигуры с основными мышцами (без фото атлета и без чужих петель).
 */
export const ExerciseThumb = memo(function ExerciseThumb({ ex, size = 64 }: { ex: Exercise; size?: number }) {
  const sex = useProfile((s) => s.profile?.sex);
  const anim = EXERCISE_ANIMATIONS[ex.id];
  if (anim) return <Poster src={mediaFor(anim, sex).poster} size={size} />;
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
  poster: { backgroundColor: '#0B0D0F' },
  map: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
