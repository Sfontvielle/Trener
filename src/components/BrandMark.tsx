import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { haptic } from '@/services/haptics';

/**
 * Знак RYNJI — кольцо прогресса с бицепсом (оригинальный логотип из заставки).
 * С `animate` знак «собирается», как раньше при запуске:
 *   1. кольцо дорисовывается до полного круга, столбики внутри «качаются»;
 *   2. столбики уходят, в центре пружиной «напрягается» бицепс;
 *   3. двойной зелёный импульс: две волны и вспышка света подряд («тук-тук»).
 * «Уменьшение движения» и автотесты в браузере — сразу готовый знак. onDone — когда знак собран.
 */
export const BRAND_LIME = '#C8F53C';
const automation = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as { webdriver?: boolean }).webdriver;
const native = Platform.OS !== 'web';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function BrandMark({ size = 160, animate = false, onDone }: { size?: number; animate?: boolean; onDone?: () => void }) {
  const play = animate && !automation;
  const [a] = useState(() => ({
    arc: new Animated.Value(play ? 0.75 : 1), // доля кольца: как на иконке (270°) → полный круг
    bars: new Animated.Value(0),
    barsOut: new Animated.Value(play ? 1 : 0),
    arm: new Animated.Value(play ? 0 : 1),
    glow: new Animated.Value(play ? 0 : 0.45),
    wave1: new Animated.Value(0),
    wave2: new Animated.Value(0),
  }));

  useEffect(() => {
    if (!play) {
      onDone?.();
      return;
    }
    let cancelled = false;
    const run = async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled?.().catch(() => false);
      // Шрифт иконок — заранее, чтобы бицепс не «мигнул» пустым квадратом
      await Promise.race([Font.loadAsync(MaterialCommunityIcons.font).catch(() => undefined), new Promise((r) => setTimeout(r, 600))]);
      if (cancelled) return;
      if (reduce) {
        a.arc.setValue(1);
        a.barsOut.setValue(0);
        a.arm.setValue(1);
        a.glow.setValue(0.45);
        onDone?.();
        return;
      }
      const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.cubic), delay = 0) => Animated.timing(v, { toValue, duration, easing, delay, useNativeDriver: native });
      const pulse = (wave: Animated.Value, peak: number) =>
        Animated.parallel([t(wave, 1, 760, Easing.out(Easing.cubic)), Animated.sequence([t(a.glow, peak, 140, Easing.out(Easing.quad)), t(a.glow, 0.4, 420, Easing.inOut(Easing.cubic))])]);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(a.arc, { toValue: 1, duration: 640, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.sequence([t(a.bars, 1, 220, Easing.out(Easing.quad)), t(a.bars, 0, 210, Easing.in(Easing.quad)), t(a.bars, 1, 210, Easing.out(Easing.quad))]),
        ]),
        Animated.parallel([t(a.barsOut, 0, 200, Easing.in(Easing.cubic)), Animated.spring(a.arm, { toValue: 1, useNativeDriver: native, speed: 9, bounciness: 13 })]),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        // Двойной импульс: второй — чуть слабее и сразу за первым
        haptic.light();
        pulse(a.wave1, 1).start();
        setTimeout(() => {
          if (cancelled) return;
          haptic.light();
          pulse(a.wave2, 0.8).start(() => !cancelled && onDone?.());
        }, 230);
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
    // onDone намеренно не в зависимостях: анимация проигрывается один раз
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, a]);

  const R = size * 0.33 - (size * 0.075) / 2;
  const STROKE = size * 0.075;
  const C = 2 * Math.PI * R;
  const barH = [0.13, 0.2, 0.28].map((h) => h * size);
  const bw = size * 0.072;
  const gap = size * 0.04;
  const wave = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.75, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.2] }) }],
  });

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="RYNJI" style={{ width: size * 2.4, height: size * 2.4, alignItems: 'center', justifyContent: 'center' }}>
      {/* Мягкий свет за знаком — пульсирует вместе с волнами */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: a.glow, transform: [{ scale: a.glow.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="brandGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={BRAND_LIME} stopOpacity={0.42} />
              <Stop offset="0.45" stopColor={BRAND_LIME} stopOpacity={0.12} />
              <Stop offset="1" stopColor={BRAND_LIME} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#brandGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.wave, { width: size * 0.9, height: size * 0.9, borderRadius: size }, wave(a.wave1)]} />
      <Animated.View pointerEvents="none" style={[styles.wave, { width: size * 0.9, height: size * 0.9, borderRadius: size }, wave(a.wave2)]} />
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={R} stroke={BRAND_LIME} strokeOpacity={0.24} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={R}
            stroke={BRAND_LIME}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={a.arc.interpolate({ inputRange: [0, 1], outputRange: [C, 0] })}
          />
        </Svg>
        <Animated.View
          style={[
            styles.bars,
            { top: size / 2 + size * 0.12 - size * 0.28, height: size * 0.28, opacity: a.barsOut, transform: [{ scale: a.barsOut.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}
        >
          {barH.map((h, i) => (
            <Animated.View
              key={i}
              style={{
                width: bw,
                height: h,
                marginLeft: i ? gap : 0,
                borderRadius: bw / 2,
                backgroundColor: BRAND_LIME,
                transformOrigin: 'bottom',
                transform: [{ scaleY: a.bars.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + 0.18 * (i + 1)] }) }],
              }}
            />
          ))}
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
              opacity: a.arm.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
              transform: [{ scale: a.arm.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }, { rotate: a.arm.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) }],
            },
          ]}
        >
          <MaterialCommunityIcons name="arm-flex" size={size * 0.42} color={BRAND_LIME} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wave: { position: 'absolute', borderWidth: 2, borderColor: BRAND_LIME },
  bars: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
});
