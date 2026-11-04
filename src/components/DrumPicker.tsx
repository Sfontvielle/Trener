import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { Icon, T } from './ui';
import { haptic } from '@/services/haptics';
import { prefersReducedMotion } from './motion';

const ROW = 48;
const VISIBLE = 5;

/**
 * Барабан выбора числа (возраст и т. п.): «+» сверху, «−» снизу, значение ведётся пальцем вверх-вниз,
 * как линейка роста — без прокрутки ScrollView, поэтому не дёргается при остановке. Большие значения — выше.
 * Пока значение не выбрано, показывается стартовое приглушённо, а «Продолжить» у экрана остаётся неактивным.
 */
export function DrumPicker({
  values,
  value,
  start,
  onChange,
  format = String,
  label,
  testID,
}: {
  values: number[];
  value: number | undefined;
  /** Что стоит в центре, пока ничего не выбрано */
  start: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
  testID?: string;
}) {
  const picked = value !== undefined;
  const cur = Math.max(0, values.indexOf(value ?? start));
  const [offset] = useState(() => new Animated.Value(0));
  const live = useRef({ cur, values, onChange });
  useEffect(() => {
    live.current = { cur, values, onChange };
  });

  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const drag = { from: 0, last: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        offset.stopAnimation();
        drag.from = live.current.cur;
        drag.last = drag.from;
      },
      onPanResponderMove: (_, g) => {
        const L = live.current;
        // палец вниз — сверху приходят большие значения
        const raw = drag.from + g.dy / ROW;
        const i = Math.max(0, Math.min(L.values.length - 1, Math.round(raw)));
        if (i !== drag.last) {
          haptic.tap();
          drag.last = i;
          L.onChange(L.values[i]);
        }
        // Остаток смещения внутри строки — для плавности; у краёв списка не тянем дальше
        const frac = Math.max(-0.5, Math.min(0.5, raw - i));
        offset.setValue(i === 0 && frac < 0 ? 0 : i === L.values.length - 1 && frac > 0 ? 0 : frac * ROW);
      },
      onPanResponderRelease: () => {
        if (prefersReducedMotion()) offset.setValue(0);
        else Animated.spring(offset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      },
      onPanResponderTerminate: () => offset.setValue(0),
    });
  });

  const step = (d: number) => {
    const i = Math.max(0, Math.min(values.length - 1, picked ? cur + d : cur + d));
    haptic.tap();
    onChange(values[i]);
  };

  const rows: number[] = [];
  for (let k = -(VISIBLE - 1) / 2 - 1; k <= (VISIBLE - 1) / 2 + 1; k++) rows.push(k);

  return (
    <View style={styles.wrap} testID={testID}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: больше`} onPress={() => step(1)} disabled={picked && cur >= values.length - 1} hitSlop={8} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]} testID={testID ? `${testID}-plus` : undefined}>
        <Icon name="add" size={26} color={colors.text} />
      </Pressable>
      <View
        style={styles.drum}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: picked ? format(values[cur]) : 'не выбрано' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        {...pan.panHandlers}
      >
        <View pointerEvents="none" style={styles.band} />
        <Animated.View style={{ transform: [{ translateY: offset }] }}>
          {rows.map((k) => {
            // большие значения — выше центра
            const i = cur - k;
            const v = values[i];
            const dist = Math.abs(k);
            return (
              <View key={k} style={styles.row}>
                {v !== undefined ? (
                  <T v="title2" color={dist === 0 && picked ? colors.text : colors.textDim} style={{ fontVariant: ['tabular-nums'], opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : 0.25 }} testID={dist === 0 && testID ? `${testID}-value` : undefined}>
                    {dist === 0 && picked ? format(v) : String(v)}
                  </T>
                ) : null}
              </View>
            );
          })}
        </Animated.View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: меньше`} onPress={() => step(-1)} disabled={picked && cur <= 0} hitSlop={8} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]} testID={testID ? `${testID}-minus` : undefined}>
        <Icon name="remove" size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = themed({
  wrap: { alignItems: 'center', gap: 8 },
  btn: { width: 56, height: 44, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  // Видно 5 строк: крайние «половинки» сверху и снизу обрезаются
  drum: { width: 220, height: ROW * VISIBLE, overflow: 'hidden', justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, top: ((VISIBLE - 1) / 2) * ROW, height: ROW, borderRadius: radius.md, backgroundColor: colors.surface2 },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
});
