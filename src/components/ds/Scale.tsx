import React, { useEffect, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';
import { prefersReducedMotion } from '../motion';
import { scaleFill } from './logic';

const TICKS = [0.25, 0.5, 0.75];

/**
 * Калиброванная шкала Precision Performance: дорожка 4 pt с делениями 25 / 50 / 75 %, конец шкалы — цель.
 * Перебор цели показывается меткой предупреждения на конце, а не «переливом» за край.
 * Заполнение меняется за 220 мс только при изменении значения; первый показ — сразу на месте.
 */
export function Scale({
  value,
  target,
  color = colors.accent,
  onSurface = true,
  accessibilityLabel,
  style,
}: {
  value: number;
  target: number;
  color?: string;
  /** Шкала лежит на карточке (деления цвета поверхности) или прямо на фоне экрана */
  onSurface?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { fill, over } = scaleFill(value, target);
  const [a] = useState(() => new Animated.Value(fill));
  useEffect(() => {
    if (prefersReducedMotion()) {
      a.setValue(fill);
      return;
    }
    const t = Animated.timing(a, { toValue: fill, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false });
    t.start();
    return () => t.stop();
  }, [fill, a]);
  const notch = onSurface ? colors.surface : colors.bg;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100) }}
      style={[{ height: 10, justifyContent: 'center' }, style]}
    >
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface3, overflow: 'hidden' }}>
        <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
      {TICKS.map((t) => (
        <View key={t} pointerEvents="none" style={{ position: 'absolute', top: 0, left: `${t * 100}%`, marginLeft: -1, width: 2, height: 10, backgroundColor: notch }} />
      ))}
      {over ? <View pointerEvents="none" style={{ position: 'absolute', right: -1, top: 0, width: 3, height: 10, borderRadius: 1.5, backgroundColor: colors.warning }} /> : null}
    </View>
  );
}
