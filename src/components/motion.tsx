import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Анимации интерфейса. Уважают системную настройку «Уменьшение движения» (iOS → Универсальный доступ):
 * при ней карточки появляются сразу, без сдвига.
 */
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => {
    reduceMotion = v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
  reduceMotion = v;
});

export const prefersReducedMotion = () => reduceMotion;

/** Плавное появление: прозрачность + небольшой подъём; delay — для «лесенки» карточек */
export function FadeIn({ children, delay = 0, style, from = 10 }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const [v] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.timing(v, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>{children}</Animated.View>;
}
