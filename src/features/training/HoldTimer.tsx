import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { Icon, T } from '@/components/ui';
import { fmtSec } from '@/utils/format';
import { haptic } from '@/services/haptics';

/**
 * Таймер подхода на время (планка, прогулка фермера). Идёт от старта, цель — подсвечена;
 * на цели — вибрация, дальше считает сверх цели. «Стоп» записывает фактические секунды в подход.
 * Время считается от startedAt, поэтому не сбивается при перерисовках.
 */
export function HoldTimer({ startedAt, target, onStop, onCancel }: { startedAt: number; target: number; onStop: (sec: number) => void; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const reached = target > 0 && sec >= target;
  useEffect(() => {
    if (!reached || fired.current) return;
    fired.current = true;
    haptic.timerEnd();
    Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: true })]).start();
  }, [reached, pulse]);
  const progress = target > 0 ? Math.min(1, sec / target) : 0;
  return (
    <Animated.View testID="hold-timer" style={[styles.bar, reached && { borderColor: colors.accent }, { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
      <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Отменить таймер" onPress={() => { haptic.tap(); onCancel(); }} style={styles.side} hitSlop={6}>
        <Icon name="close" size={20} color={colors.textDim} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }} accessibilityLiveRegion="polite">
        <T v="caption" style={{ fontSize: 10 }}>
          {reached ? 'Цель есть — держи или стоп' : `Цель ${fmtSec(target)}`}
        </T>
        <T v="num" style={{ fontSize: 30, color: reached ? colors.accent : colors.text }}>
          {fmtSec(sec)}
        </T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Стоп — записать время" onPress={() => { haptic.setDone(); onStop(Math.max(1, sec)); }} style={styles.stop} hitSlop={6}>
        <Icon name="stop" size={18} color={colors.onAccent} />
        <T v="small" color={colors.onAccent} style={{ fontWeight: '800' }}>
          Стоп
        </T>
      </Pressable>
    </Animated.View>
  );
}

const styles = themed({
  bar: { height: 76, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, overflow: 'hidden', boxShadow: '0px 8px 24px rgba(0,0,0,0.5)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accentDim },
  side: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  stop: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
