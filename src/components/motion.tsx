import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';

/**
 * Движение интерфейса — только как отклик на действие (дизайн-система §6): нажатие, смена раздела,
 * изменившееся число. Без фоновых свечений, бликов и каскадного появления при каждом открытии экрана.
 * Всё уважает «Уменьшение движения»
 * (iOS → Универсальный доступ): тогда элементы сразу на месте, без анимации. Автотесты в браузере
 * (navigator.webdriver) тоже видят итоговое состояние сразу — проверки не зависят от таймингов.
 */
let reduceMotion = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as { webdriver?: boolean }).webdriver;
const automation = reduceMotion;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => {
    reduceMotion = automation || v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
  reduceMotion = automation || v;
});

export const prefersReducedMotion = () => reduceMotion;
const native = Platform.OS !== 'web';

/** Смена содержимого по действию (раздел, шаг анкеты): прозрачность + небольшой подъём за 180 мс */
export function FadeIn({ children, delay = 0, style, from = 6 }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const [v] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.timing(v, { toValue: 1, duration: 180, delay, easing: Easing.out(Easing.quad), useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [Math.min(from, 6), 0] }) }] }]}>{children}</Animated.View>;
}

/**
 * Раньше — появление блоков «лесенкой» при каждом открытии экрана. Дизайн-система §6 его убирает:
 * экран открывается сразу целиком. Обёртка оставлена, пока экраны не переведены (фазы C–F).
 */
export function Appear({ children, style }: { i?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; from?: number }) {
  return <View style={style}>{children}</View>;
}

/** Пружина нажатия: элемент чуть «утапливается» и мягко возвращается */
export function usePressScale(to = 0.97) {
  const [s] = useState(() => new Animated.Value(1));
  const run = (v: number) => {
    if (reduceMotion) return;
    Animated.spring(s, { toValue: v, useNativeDriver: native, speed: 40, bounciness: v === 1 ? 6 : 0 }).start();
  };
  const opacity = s.interpolate({ inputRange: [to, 1], outputRange: [0.86, 1], extrapolate: 'clamp' });
  return { scale: s, opacity, onPressIn: () => run(to), onPressOut: () => run(1) };
}

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable с пружиной нажатия. style — обычный (не функция); pressedStyle — что добавить при нажатии
 * (например, лёгкая подсветка строки).
 */
export function Tap({ style, scaleTo = 0.97, children, onPressIn, onPressOut, ...rest }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; scaleTo?: number; children?: React.ReactNode }) {
  const p = usePressScale(scaleTo);
  return (
    <AnimatedPressableBase
      {...rest}
      onPressIn={(e) => {
        p.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        p.onPressOut();
        onPressOut?.(e);
      }}
      style={[style, { opacity: p.opacity, transform: [{ scale: p.scale }] }]}
    >
      {children}
    </AnimatedPressableBase>
  );
}

/** Живое число: при открытии экрана — сразу итог; после действия (добавил еду) досчитывает до нового за 220 мс */
export function useCountUp(value: number, duration = 220): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduceMotion || !Number.isFinite(value) || !Number.isFinite(from.current) || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    let raf = 0;
    let t0: number | null = null;
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const k = Math.min(1, (t - t0) / duration);
      const v = start + (value - start) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return reduceMotion || !Number.isFinite(value) ? value : shown;
}

/** Полоса прогресса: при открытии — сразу на месте, при изменении значения плавно доезжает за 220 мс */
export function Progress({ value, color = colors.accent, track = colors.surface3, height = 4, style }: { value: number; color?: string; track?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [a] = useState(() => new Animated.Value(p));
  useEffect(() => {
    if (reduceMotion) {
      a.setValue(p);
      return;
    }
    const t = Animated.timing(a, { toValue: p, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false });
    t.start();
    return () => t.stop();
  }, [p, a]);
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}
