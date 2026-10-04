import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { T } from './ui';
import { haptic } from '@/services/haptics';

const ITEM = 40;
const VISIBLE = 5;

/**
 * Колесо выбора в стиле iOS (UIPickerView) на обычном ScrollView со snap: работает в Expo Go,
 * дев-сборке и вебе без нативных зависимостей. Значение фиксируется после остановки прокрутки;
 * при переходе через деление — лёгкий тактильный отклик. Поддерживает VoiceOver (adjustable).
 */
export function Wheel({ values, value, onChange, format = String, width = 84, label, testID }: { values: number[]; value: number; onChange: (v: number) => void; format?: (v: number) => string; width?: number; label: string; testID?: string }) {
  const ref = useRef<ScrollView>(null);
  const live = useRef({ idx: Math.max(0, values.indexOf(value)), timer: 0 as unknown as ReturnType<typeof setTimeout>, dragging: false });
  const [shown, setShown] = useState(Math.max(0, values.indexOf(value)));

  // Внешнее изменение (например, подстановка из Apple Health) — прокручиваем колесо
  useEffect(() => {
    const i = values.indexOf(value);
    if (i >= 0 && i !== live.current.idx) {
      live.current.idx = i;
      setShown(i);
      ref.current?.scrollTo({ y: i * ITEM, animated: true });
    }
  }, [value, values]);

  useEffect(() => () => clearTimeout(live.current.timer), []);

  const settle = (i: number) => {
    ref.current?.scrollTo({ y: i * ITEM, animated: true });
    if (values[i] !== value) onChange(values[i]);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM)));
    if (i !== live.current.idx) {
      live.current.idx = i;
      setShown(i);
      haptic.tap();
    }
    // В вебе нет onMomentumScrollEnd — фиксируем значение после паузы прокрутки
    clearTimeout(live.current.timer);
    live.current.timer = setTimeout(() => settle(live.current.idx), 140);
  };

  const step = (d: number) => {
    const i = Math.max(0, Math.min(values.length - 1, live.current.idx + d));
    live.current.idx = i;
    setShown(i);
    settle(i);
  };

  return (
    <View
      style={[styles.wheel, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(values[shown]) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      testID={testID}
    >
      <View pointerEvents="none" style={styles.band} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={() => ref.current?.scrollTo({ y: Math.max(0, values.indexOf(value)) * ITEM, animated: false })}
        contentContainerStyle={{ paddingVertical: ((VISIBLE - 1) / 2) * ITEM }}
        nestedScrollEnabled
      >
        {values.map((v, i) => {
          const dist = Math.abs(i - shown);
          return (
            <View key={v} style={styles.item}>
              <T v="h3" style={{ fontVariant: ['tabular-nums'], opacity: dist === 0 ? 1 : dist === 1 ? 0.5 : 0.25, fontSize: dist === 0 ? 22 : 18 }} color={dist === 0 ? colors.text : colors.textDim}>
                {format(v)}
              </T>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const HOURS = Array.from({ length: 15 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** Длительность «часы + минуты» с точностью до минуты; значение хранится в минутах */
export function DurationWheel({ minutes, onChange, testID }: { minutes: number; onChange: (m: number) => void; testID?: string }) {
  const h = Math.min(14, Math.floor(minutes / 60));
  const m = Math.round(minutes - h * 60) % 60;
  return (
    <View style={styles.row} testID={testID}>
      <Wheel label="Часы" values={HOURS} value={h} onChange={(v) => onChange(v * 60 + m)} testID={testID ? `${testID}-h` : undefined} />
      <T v="body" color={colors.textDim}>
        ч
      </T>
      <Wheel label="Минуты" values={MINUTES} value={m} onChange={(v) => onChange(h * 60 + v)} format={(v) => String(v).padStart(2, '0')} testID={testID ? `${testID}-m` : undefined} />
      <T v="body" color={colors.textDim}>
        мин
      </T>
    </View>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  wheel: { height: ITEM * VISIBLE, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, top: ((VISIBLE - 1) / 2) * ITEM, height: ITEM, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
});
