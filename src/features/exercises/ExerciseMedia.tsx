import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import type { Exercise } from '@/types';
import { colors, radius } from '@/theme';
import { Icon, T } from '@/components/ui';
import { exerciseImages } from '@/data/exercises';
import { EXERCISE_MEDIA } from '@/data/exerciseMedia';

/**
 * Демонстрация техники: две фазы движения (старт/конец) крупно, с плавным циклическим
 * переходом (кроссфейд + лёгкий zoom), управление ▶/⏸ и ручной выбор фазы.
 * Картинки грузятся только при открытии карточки (не в списке) и кешируются системой.
 */
export function ExerciseMedia({ exercise, height = 280 }: { exercise: Exercise; height?: number }) {
  // Локальные кадры (офлайн); для пользовательских упражнений — из сети, если есть
  const local = EXERCISE_MEDIA[exercise.id];
  const remote = exerciseImages(exercise);
  const a = local ? local[0] : remote[0] ? { uri: remote[0] } : undefined;
  const b = local ? local[1] : remote[1] ? { uri: remote[1] } : undefined;
  const [playing, setPlaying] = useState(true);
  const [phase, setPhase] = useState<0 | 1>(0);
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState(false);
  const t = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loop.current?.stop();
    if (playing && loaded >= 2) {
      loop.current = Animated.loop(
        Animated.sequence([
          Animated.delay(450),
          Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.delay(450),
          Animated.timing(t, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      loop.current.start();
    } else if (!playing) {
      Animated.timing(t, { toValue: phase, duration: 300, useNativeDriver: true }).start();
    }
    return () => loop.current?.stop();
  }, [playing, loaded, phase, t]);

  if (!a) {
    return (
      <View style={[styles.box, { height, alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="barbell-outline" size={40} color={colors.muted} />
        <T v="small">Нет демонстрации для этого упражнения</T>
      </View>
    );
  }

  const scaleA = t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const scaleB = t.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] });

  return (
    <View style={[styles.box, { height }]}>
      <View style={styles.frame}>
        <Animated.Image source={a} resizeMode="contain" style={[styles.img, { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: scaleA }] }]} onLoad={() => setLoaded((x) => x + 1)} onError={() => setError(true)} />
        <Animated.Image source={b!} resizeMode="contain" style={[styles.img, { opacity: t, transform: [{ scale: scaleB }] }]} onLoad={() => setLoaded((x) => x + 1)} onError={() => setError(true)} />
        {loaded < 2 && !error ? (
          <View style={styles.center}>
            <T v="small">Загрузка демонстрации…</T>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.center, { backgroundColor: colors.surface2 }]}>
            <Icon name="cloud-offline-outline" size={32} color={colors.muted} />
            <T v="small" style={{ textAlign: 'center', paddingHorizontal: 24 }}>
              Не удалось загрузить демонстрацию. Техника текстом и мышцы — ниже.
            </T>
          </View>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Воспроизвести'} onPress={() => setPlaying(!playing)} style={styles.play} hitSlop={6}>
          <Icon name={playing ? 'pause' : 'play'} size={20} color={colors.onAccent} />
        </Pressable>
        <View style={styles.phases}>
          {(['Старт', 'Конец'] as const).map((l, i) => {
            const active = !playing && phase === i;
            return (
              <Pressable
                key={l}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setPlaying(false);
                  setPhase(i as 0 | 1);
                }}
                style={[styles.phase, active && { backgroundColor: colors.surface3 }]}
              >
                <T v="small" color={active ? colors.text : colors.textDim} style={{ fontWeight: '700' }}>
                  {l}
                </T>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// Предзагрузка сетевых изображений (только для упражнений без встроенных кадров)
export function prefetchExerciseMedia(ex: Exercise) {
  if (EXERCISE_MEDIA[ex.id]) return;
  for (const u of exerciseImages(ex)) Image.prefetch(u).catch(() => undefined);
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  frame: { flex: 1 },
  img: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(20,22,25,0.6)' },
  controls: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  phases: { flexDirection: 'row', backgroundColor: 'rgba(10,11,13,0.82)', borderRadius: 999, padding: 3 },
  phase: { paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
