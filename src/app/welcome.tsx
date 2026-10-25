import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { space } from '@/theme';
import { Button, T } from '@/components/ui';
import { BRAND_LIME } from '@/components/BrandMark';
import { useAccount } from '@/stores/account';
import { entryRoute } from '@/features/account/route';
import { BRAND } from '@/config/brand';
import { haptic } from '@/services/haptics';

const native = Platform.OS !== 'web';
const automation = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as { webdriver?: boolean }).webdriver;
const HERO = require('../../assets/art/welcome.webp');
const ENERGY = require('../../assets/art/energy.webp');
const RATIO = 1350 / 1080;
/** Точка, откуда расходится энергия: между лопаток атлета (доли кадра иллюстрации) */
const ORIGIN = { x: 0.5, y: 0.36 };

/**
 * Приветствие (эталон onboarding/01_welcome, тексты — по ТЗ). Только при первом запуске.
 * Двойной энергетический импульс один раз: искра → первая волна (проявляется атлет) → вторая волна →
 * бицепс → RYNJI → текст и «Начать». Около 1,6 с, ничего не ждёт искусственно. «Уменьшение движения» и
 * автотесты — сразу итоговый кадр. Изображения — собственный 3D-рендер (tools/anim), права наши.
 */
export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [a] = useState(() => ({
    spark: new Animated.Value(0),
    wave1: new Animated.Value(0),
    wave2: new Animated.Value(0),
    hero: new Animated.Value(automation ? 1 : 0),
    energy: new Animated.Value(automation ? 0.75 : 0),
    mark: new Animated.Value(automation ? 1 : 0),
    word: new Animated.Value(automation ? 1 : 0),
    text: new Animated.Value(automation ? 1 : 0),
  }));
  const [ready, setReady] = useState(automation);

  useEffect(() => {
    if (automation) return;
    let cancelled = false;
    void (async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled?.().catch(() => false);
      if (cancelled) return;
      if (reduce) {
        a.hero.setValue(1);
        a.energy.setValue(0.75);
        a.mark.setValue(1);
        a.word.setValue(1);
        a.text.setValue(1);
        setReady(true);
        return;
      }
      const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.cubic)) => Animated.timing(v, { toValue, duration, easing, useNativeDriver: native });
      // Вторая волна перехватывает свечение (energy) у первой: без stopTogether: false остановка одной анимации
      // в parallel замораживала бы и волну, и проявление атлета на полпути
      const loose = { stopTogether: false };
      const pulse = (wave: Animated.Value, peak: number, rest: number) =>
        Animated.parallel([t(wave, 1, 820), Animated.sequence([t(a.energy, peak, 120, Easing.out(Easing.quad)), t(a.energy, rest, 520, Easing.inOut(Easing.cubic))])], loose);
      Animated.sequence([
        // искра
        Animated.sequence([t(a.spark, 1, 220, Easing.out(Easing.back(2))), Animated.delay(60)]),
        // первая волна — атлет проявляется в её свете
        Animated.parallel([pulse(a.wave1, 1, 0.55), t(a.hero, 1, 520), t(a.spark, 0, 400)], loose),
      ]).start();
      setTimeout(() => !cancelled && haptic.light(), 280);
      setTimeout(() => {
        if (cancelled) return;
        haptic.light();
        // вторая волна, следом — бицепс, словесный знак, текст и кнопка
        Animated.parallel([pulse(a.wave2, 0.95, 0.75), Animated.sequence([Animated.delay(160), Animated.spring(a.mark, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: native })])], loose).start();
        setTimeout(() => !cancelled && t(a.word, 1, 360).start(), 420);
        setTimeout(() => {
          if (cancelled) return;
          setReady(true);
          t(a.text, 1, 420).start();
        }, 700);
      }, 560);
    })();
    return () => {
      cancelled = true;
    };
  }, [a]);

  const start = () => {
    const acc = useAccount.getState();
    acc.setWelcomeSeen();
    const next = entryRoute({ hasProfile: false, welcomeSeen: true, linked: !!acc.apple, authSkipped: acc.authSkipped });
    router.replace(next === 'auth' ? '/auth' : '/onboarding');
  };

  // кадр иллюстрации — во всю ширину, сверху под логотипом
  const artW = width;
  const artH = Math.min(artW * RATIO, height * 0.78);
  const artTop = insets.top + 40;
  const ox = artW * ORIGIN.x;
  const oy = artTop + artH * ORIGIN.y;
  const ring = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.85, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.15, 7] }) }],
  });

  return (
    <View style={styles.root}>
      {/* мягкое зелёное свечение за атлетом — вспыхивает вместе с энергией */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: a.energy }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="wGlow" cx={ox} cy={oy} r={width * 0.9} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={BRAND_LIME} stopOpacity={0.28} />
              <Stop offset="0.45" stopColor={BRAND_LIME} stopOpacity={0.08} />
              <Stop offset="1" stopColor={BRAND_LIME} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#wGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: artTop, left: 0, width: artW, height: artH, opacity: a.energy }}>
        <Image source={ENERGY} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" accessible={false} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: artTop, left: 0, width: artW, height: artH, opacity: a.hero, transform: [{ scale: a.hero.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1] }) }] }}
      >
        <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" accessibilityLabel="Атлет со спины в зелёном свете" />
        {/* низ иллюстрации растворяется в фоне — без жёсткого края */}
        <View style={[StyleSheet.absoluteFill, { top: artH * 0.55 }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="wFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#050607" stopOpacity={0} />
                <Stop offset="1" stopColor="#050607" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#wFade)" />
          </Svg>
        </View>
      </Animated.View>
      {/* искра и две волны */}
      <Animated.View pointerEvents="none" style={[styles.spark, { left: ox - 9, top: oy - 9, opacity: a.spark, transform: [{ scale: a.spark.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.6] }) }] }]} />
      <Animated.View pointerEvents="none" style={[styles.ring, { left: ox - 40, top: oy - 40 }, ring(a.wave1)]} />
      <Animated.View pointerEvents="none" style={[styles.ring, { left: ox - 40, top: oy - 40 }, ring(a.wave2)]} />
      {/* затемнение снизу — под текст */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: height * 0.42 }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="wShade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#050607" stopOpacity={0} />
              <Stop offset="0.45" stopColor="#050607" stopOpacity={0.82} />
              <Stop offset="1" stopColor="#050607" stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#wShade)" />
        </Svg>
      </View>

      {/* знак: бицепс + RYNJI */}
      <View style={[styles.logo, { top: insets.top + 18 }]} accessible accessibilityRole="header" accessibilityLabel={BRAND}>
        <Animated.View style={{ opacity: a.mark, transform: [{ scale: a.mark.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: a.mark.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '0deg'] }) }] }}>
          <MaterialCommunityIcons name="arm-flex" size={38} color={BRAND_LIME} />
        </Animated.View>
        <Animated.View style={{ opacity: a.word, transform: [{ translateX: a.word.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>
          <T v="display" color="#FFFFFF" style={styles.word}>
            {BRAND}
          </T>
        </Animated.View>
      </View>

      <Animated.View style={[styles.bottom, { paddingBottom: insets.bottom + 18, opacity: a.text, transform: [{ translateY: a.text.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]} pointerEvents={ready ? 'auto' : 'none'}>
        <T v="display" color="#FFFFFF" style={styles.title} accessibilityRole="header">
          Тренировки под твои цели.
        </T>
        <T v="body" color="rgba(255,255,255,0.78)" style={styles.sub}>
          Персональная программа, питание и восстановление — в одной системе.
        </T>
        <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
          <Button title="Начать" size="lg" live onPress={start} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050607' },
  logo: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  word: { fontSize: 40, lineHeight: 46, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1.5 },
  spark: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#F2FFD6', shadowColor: BRAND_LIME, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  ring: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: BRAND_LIME },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, alignItems: 'center', gap: 12 },
  title: { fontSize: 32, lineHeight: 38, textAlign: 'center' },
  sub: { fontSize: 17, lineHeight: 24, textAlign: 'center', maxWidth: 340 },
});
