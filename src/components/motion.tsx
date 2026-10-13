import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, currentTheme } from '@/theme';

/**
 * Движение интерфейса — деликатное: короткие пружины на нажатие, появление «лесенкой», живые числа и
 * прогресс, мягкое дыхание главной кнопки и фонового свечения. Всё уважает «Уменьшение движения»
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

/** Плавное появление: прозрачность + небольшой подъём; delay — для «лесенки» */
export function FadeIn({ children, delay = 0, style, from = 10 }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const [v] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>{children}</Animated.View>;
}

/** Шаг «лесенки»: i-й блок появляется на STEP мс позже предыдущего */
export const STEP = 70;
export function Appear({ i = 0, children, style, from }: { i?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; from?: number }) {
  return (
    <FadeIn delay={80 + i * STEP} style={style} from={from}>
      {children}
    </FadeIn>
  );
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

/** Живое число: плавно «досчитывает» до нового значения (на первом показе — от нуля) */
export function useCountUp(value: number, duration = 650): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduceMotion || !Number.isFinite(value)) {
      from.current = value;
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

/** Бесконечное «дыхание» 0 → 1 → 0 (для свечения и фона); при «Уменьшении движения» — стоит на месте */
function useBreath(period: number, rest = 0.5) {
  const [v] = useState(() => new Animated.Value(rest));
  useEffect(() => {
    if (reduceMotion) return;
    const half = period / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, period]);
  return v;
}

/**
 * Мягкое свечение под главной кнопкой: радиальный градиент цвета акцента, медленно «дышит».
 * Рисуется под кнопкой и не перехватывает касания.
 */
/** Уникальный id для градиентов SVG (на вебе одинаковые id на странице конфликтуют) */
const useSvgId = (p: string) => p + useId().replace(/[^a-zA-Z0-9]/g, '');

export function CtaGlow({ color = colors.accent }: { color?: string }) {
  const b = useBreath(3200);
  const id = useSvgId('cta');
  const dim = currentTheme().scheme === 'light';
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          opacity: b.interpolate({ inputRange: [0, 1], outputRange: dim ? [0.12, 0.22] : [0.32, 0.6] }),
          transform: [{ scaleX: b.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.02] }) }],
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="55%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.75} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.18} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="22" rx="50" ry="18" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Блик, который изредка мягко проходит по главной кнопке — «живое стекло», без мигания */
export function Sheen({ every = 7000 }: { every?: number }) {
  const [x] = useState(() => new Animated.Value(0));
  const [w, setW] = useState(0);
  const id = useSvgId('sheen');
  useEffect(() => {
    if (reduceMotion || !w) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: native }),
        Animated.delay(every),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x, w, every]);
  if (reduceMotion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w ? (
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 90, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-110, w + 20] }) }, { skewX: '-18deg' }] }}>
          <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.42} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="10" height="10" fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

export type AmbientTone = 'accent' | 'calm' | 'warn';

/**
 * Фоновая глубина экрана: два очень мягких пятна света вверху, медленно дрейфуют. Цвет отражает состояние дня:
 * акцент — тренировка, спокойный холодный — отдых, тёплый — стоит поберечься. Только фон, без текста поверх.
 */
export function Ambient({ tone = 'accent', height = 460 }: { tone?: AmbientTone; height?: number }) {
  const b = useBreath(14000);
  const id = useSvgId('amb');
  const light = currentTheme().scheme === 'light';
  const main = tone === 'calm' ? colors.protein : tone === 'warn' ? colors.warning : colors.accent;
  const second = tone === 'calm' ? colors.stabilizerMuscle : colors.protein;
  const k = light ? 0.45 : 1;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ambient,
        { height },
        { transform: [{ translateX: b.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] }) }, { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [-8, 6] }) }] },
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 120" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`${id}a`} cx="22%" cy="8%" rx="70%" ry="58%">
            <Stop offset="0" stopColor={main} stopOpacity={0.2 * k} />
            <Stop offset="0.5" stopColor={main} stopOpacity={0.06 * k} />
            <Stop offset="1" stopColor={main} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="92%" cy="20%" rx="55%" ry="45%">
            <Stop offset="0" stopColor={second} stopOpacity={0.1 * k} />
            <Stop offset="1" stopColor={second} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="120" fill={`url(#${id}a)`} />
        <Rect x="0" y="0" width="100" height="120" fill={`url(#${id}b)`} />
      </Svg>
    </Animated.View>
  );
}

/** Полоса прогресса, которая плавно «наливается» при появлении и при изменении значения */
export function Progress({ value, color = colors.accent, track = colors.surface3, height = 4, style }: { value: number; color?: string; track?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [a] = useState(() => new Animated.Value(reduceMotion ? p : 0));
  useEffect(() => {
    if (reduceMotion) {
      a.setValue(p);
      return;
    }
    Animated.timing(a, { toValue: p, duration: 800, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [p, a]);
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', left: -18, right: -18, top: 2, bottom: -22 },
  ambient: { position: 'absolute', left: -40, right: -40, top: 0 },
});
