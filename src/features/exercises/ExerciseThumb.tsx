import React from 'react';
import { Image, View } from 'react-native';
import type { Exercise } from '@/types';
import { colors, themed } from '@/theme';
import { T } from '@/components/ui';
import { CATEGORY_LABEL, exerciseImages } from '@/data/exercises';
import { EXERCISE_MEDIA } from '@/data/exerciseMedia';

/** Миниатюра: конечная фаза движения (по ней понятнее, что за упражнение) */
export function ExerciseThumb({ ex, size = 64 }: { ex: Exercise; size?: number }) {
  const local = EXERCISE_MEDIA[ex.id];
  const remote = exerciseImages(ex);
  const src = local ? local[1] ?? local[0] : remote[1] ? { uri: remote[1] } : remote[0] ? { uri: remote[0] } : null;
  if (!src) {
    return (
      <View style={[styles.thumb, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <T v="small" color={colors.textDim} style={{ fontWeight: '800', fontSize: 11 }}>
          {CATEGORY_LABEL[ex.category].slice(0, 3).toUpperCase()}
        </T>
      </View>
    );
  }
  return <Image source={src} style={[styles.thumb, { width: size, height: size }]} resizeMode="cover" accessibilityIgnoresInvertColors />;
}


const styles = themed({
  thumb: { borderRadius: 12, backgroundColor: '#FFFFFF' },
});
