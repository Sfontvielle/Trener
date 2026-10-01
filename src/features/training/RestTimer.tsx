import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useWorkouts } from '@/stores/workouts';
import { colors, radius, space } from '@/theme';
import { Icon, T } from '@/components/ui';
import { formatDuration } from '@/utils/date';
import { haptic } from '@/services/haptics';

/** Плавающий таймер отдыха. Время считается от endsAt, поэтому таймер переживает сворачивание приложения. */
export function RestTimerBar({ bottom }: { bottom: number }) {
  const rest = useWorkouts((s) => s.rest);
  const adjust = useWorkouts((s) => s.adjustRest);
  const stop = useWorkouts((s) => s.stopRest);
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<number | null>(null);
  const pulse = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rest]);

  const left = rest ? Math.max(0, Math.round((rest.endsAt - now) / 1000)) : 0;
  const done = !!rest && left === 0;

  useEffect(() => {
    if (done && rest && firedFor.current !== rest.endsAt) {
      firedFor.current = rest.endsAt;
      haptic.timerEnd();
      Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: true })]).start();
    }
  }, [done, rest, pulse]);

  if (!rest) return null;
  const progress = rest.duration ? 1 - left / rest.duration : 1;
  return (
    <Animated.View style={[styles.bar, { bottom, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }, done && { borderColor: colors.accent }]}>
      <View style={[styles.fill, { width: `${Math.min(100, progress * 100)}%` }]} />
      <Pressable accessibilityLabel="Минус 15 секунд" onPress={() => adjust(-15)} style={styles.adj} hitSlop={6}>
        <T v="small" style={{ fontWeight: '800' }}>−15</T>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <T v="caption" numberOfLines={1} style={{ fontSize: 10 }}>
          {done ? 'Отдых закончен' : `Отдых · ${rest.label}`}
        </T>
        <T v="num" style={{ fontSize: 26, color: done ? colors.accent : colors.text }}>
          {formatDuration(left)}
        </T>
      </View>
      <Pressable accessibilityLabel="Плюс 15 секунд" onPress={() => adjust(15)} style={styles.adj} hitSlop={6}>
        <T v="small" style={{ fontWeight: '800' }}>+15</T>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={done ? 'Закрыть таймер' : 'Пропустить отдых'} onPress={() => { haptic.tap(); stop(); }} style={[styles.skip, done && { backgroundColor: colors.accent }]} hitSlop={6}>
        {done ? <Icon name="checkmark" size={20} color={colors.onAccent} /> : <T v="small" style={{ fontWeight: '800' }}>Пропустить</T>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    height: 68,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(0,0,0,0.5)',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accentDim },
  skip: { paddingHorizontal: 12, minWidth: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  adj: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
});
