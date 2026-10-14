import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { haptic } from '@/services/haptics';

/**
 * Заставка при запуске — продолжение нативного splash (тот же знак RYNJI на том же фоне, без скачка):
 *   1. «загрузка»: кольцо прогресса дорисовывается до полного круга, столбики внутри «качаются»;
 *   2. кольцо вспыхивает мягким светом, столбики уходят;
 *   3. в центре пружиной «напрягается» бицепс, от него расходится волна;
 *   4. заставка растворяется с лёгким приближением — открывается приложение.
 * ~2 с, один раз за запуск. «Уменьшение движения» — короткое растворение; автотесты в браузере — без заставки.
 */
const SPLASH_BG = '#0A0B0D';
const LIME = '#C8F53C';
const SIZE = 160; // как imageWidth нативного splash
const R = SIZE * 0.33 - (SIZE * 0.075) / 2; // радиус по центру линии кольца
const STROKE = SIZE * 0.075;
const C = 2 * Math.PI * R;
const native = Platform.OS !== 'web';
const automation = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as { webdriver?: boolean }).webdriver;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

let shown = false;

export function IntroSplash({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(() => !shown && !automation);
  const [a] = useState(() => ({
    arc: new Animated.Value(0.75), // доля кольца: как на иконке (270°) → полный круг
    bars: new Animated.Value(0), // «качание» столбиков 0 → 1 → 0
    barsOut: new Animated.Value(1),
    glow: new Animated.Value(0),
    arm: new Animated.Value(0),
    wave: new Animated.Value(0),
    exit: new Animated.Value(0),
  }));
  const [minDone, setMinDone] = useState(false);

  useEffect(() => {
    if (!visible) return;
    shown = true;
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
        setMinDone(true);
        return;
      }
      const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.cubic), delay = 0) => Animated.timing(v, { toValue, duration, easing, delay, useNativeDriver: native && v !== a.arc });
      Animated.sequence([
        // 1. загрузка
        Animated.parallel([
          Animated.timing(a.arc, { toValue: 1, duration: 640, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.sequence([t(a.bars, 1, 220, Easing.out(Easing.quad)), t(a.bars, 0, 210, Easing.in(Easing.quad)), t(a.bars, 1, 210, Easing.out(Easing.quad))]),
        ]),
        // 2. вспышка кольца, столбики уходят
        Animated.parallel([t(a.glow, 1, 260), t(a.barsOut, 0, 200, Easing.in(Easing.cubic))]),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        haptic.light();
        // 3. бицепс и волна
        Animated.parallel([
          Animated.spring(a.arm, { toValue: 1, useNativeDriver: native, speed: 9, bounciness: 13 }),
          t(a.wave, 1, 640, Easing.out(Easing.cubic)),
          t(a.glow, 0.55, 700, Easing.inOut(Easing.cubic), 200),
        ]).start(() => {
          if (!cancelled) setTimeout(() => setMinDone(true), 200);
        });
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, a]);

  // 4. уходим, когда анимация показана и данные загружены
  useEffect(() => {
    if (!visible || !minDone || !ready) return;
    Animated.timing(a.exit, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }).start(() => setVisible(false));
  }, [visible, minDone, ready, a]);

  if (!visible) return null;
  const barH = [0.13, 0.2, 0.28].map((h) => h * SIZE);
  const bw = SIZE * 0.072;
  const gap = SIZE * 0.04;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: a.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      <Animated.View style={{ width: SIZE * 2.4, height: SIZE * 2.4, alignItems: 'center', justifyContent: 'center', transform: [{ scale: a.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
        {/* Мягкий свет за знаком */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: a.glow, transform: [{ scale: a.glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="introGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor={LIME} stopOpacity={0.42} />
                <Stop offset="0.45" stopColor={LIME} stopOpacity={0.12} />
                <Stop offset="1" stopColor={LIME} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#introGlow)" />
          </Svg>
        </Animated.View>
        {/* Волна от бицепса */}
        <Animated.View
          style={[
            styles.wave,
            {
              opacity: a.wave.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.7, 0] }),
              transform: [{ scale: a.wave.interpolate({ inputRange: [0, 1], outputRange: [0.85, 2.1] }) }],
            },
          ]}
        />
        {/* Кольцо: дорожка + дуга прогресса (как на иконке), дорисовывается до круга */}
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={LIME} strokeOpacity={0.24} strokeWidth={STROKE} fill="none" />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={LIME}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${C} ${C}`}
              strokeDashoffset={a.arc.interpolate({ inputRange: [0, 1], outputRange: [C, 0] })}
            />
          </Svg>
          {/* Три столбика — «качаются», потом уходят */}
          <Animated.View style={[styles.bars, { opacity: a.barsOut, transform: [{ scale: a.barsOut.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
            {barH.map((h, i) => (
              <Animated.View
                key={i}
                style={{
                  width: bw,
                  height: h,
                  marginLeft: i ? gap : 0,
                  borderRadius: bw / 2,
                  backgroundColor: LIME,
                  transformOrigin: 'bottom',
                  transform: [{ scaleY: a.bars.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + 0.18 * (i + 1)] }) }],
                }}
              />
            ))}
          </Animated.View>
          {/* Бицепс — пружиной из центра, с «напряжением» (поворот) */}
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
            <MaterialCommunityIcons name="arm-flex" size={SIZE * 0.42} color={LIME} />
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: SPLASH_BG, alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  wave: { position: 'absolute', width: SIZE * 0.9, height: SIZE * 0.9, borderRadius: SIZE, borderWidth: 2, borderColor: LIME },
  bars: { position: 'absolute', left: 0, right: 0, top: SIZE / 2 + SIZE * 0.12 - SIZE * 0.28, height: SIZE * 0.28, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
});
