import React, { useEffect, useState } from 'react';
import { Animated, Easing, Image, Platform, View } from 'react-native';
import type { Exercise } from '@/types';
import { colors, themed } from '@/theme';
import { T } from '@/components/ui';
import { prefersReducedMotion } from '@/components/motion';
import { CATEGORY_LABEL, exerciseImages } from '@/data/exercises';
import { EXERCISE_MEDIA } from '@/data/exerciseMedia';

const NATIVE = Platform.OS !== 'web';

function frames(ex: Exercise) {
  const local = EXERCISE_MEDIA[ex.id];
  const remote = exerciseImages(ex);
  if (local) return [local[0], local[1]] as const;
  if (remote[0]) return [{ uri: remote[0] }, remote[1] ? { uri: remote[1] } : undefined] as const;
  return null;
}

function Fallback({ ex, size }: { ex: Exercise; size: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3 }]}>
      <T v="small" color={colors.textDim} style={{ fontWeight: '800', fontSize: 11 }}>
        {CATEGORY_LABEL[ex.category].slice(0, 3).toUpperCase()}
      </T>
    </View>
  );
}

/** Миниатюра: конечная фаза движения (по ней понятнее, что за упражнение) */
export function ExerciseThumb({ ex, size = 64 }: { ex: Exercise; size?: number }) {
  const f = frames(ex);
  if (!f) return <Fallback ex={ex} size={size} />;
  return <Image source={f[1] ?? f[0]} style={[styles.thumb, { width: size, height: size }]} resizeMode="cover" accessibilityIgnoresInvertColors />;
}

/**
 * «Гифка» упражнения: старт и конец движения плавно сменяют друг друга по кругу — сразу видно, как оно делается.
 * Кадры встроены в приложение (офлайн). «Уменьшение движения» — статичная конечная фаза.
 */
export function ExerciseLoop({ ex, size = 64, delay = 0 }: { ex: Exercise; size?: number; delay?: number }) {
  const f = frames(ex);
  const [t] = useState(() => new Animated.Value(0));
  const animate = !!f?.[1] && !prefersReducedMotion();
  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500 + delay),
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.delay(500),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, t, delay]);
  if (!f) return <Fallback ex={ex} size={size} />;
  if (!animate) return <ExerciseThumb ex={ex} size={size} />;
  const box = [styles.thumb, { width: size, height: size }];
  return (
    <View style={box} accessibilityIgnoresInvertColors>
      <Image source={f[0]} style={[styles.layer, { width: size, height: size }]} resizeMode="cover" />
      <Animated.Image source={f[1]!} style={[styles.layer, { width: size, height: size, opacity: t }]} resizeMode="cover" />
    </View>
  );
}

const styles = themed({
  thumb: { borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  layer: { position: 'absolute', left: 0, top: 0 },
});
