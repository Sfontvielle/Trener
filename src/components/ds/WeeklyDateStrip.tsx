import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ISODate } from '@/types';
import { colors, space, themed } from '@/theme';
import { addDays, daysBetween, formatDayLong, parseISODate, WEEKDAYS_SHORT, weekdayIndex } from '@/utils/date';
import { haptic } from '@/services/haptics';
import { IconButton, T } from '../ui';

/**
 * Выбор дня (дизайн-система §9 WeeklyDateStrip): последние 7 дней, сегодня справа. Выбранный день залит,
 * точка — в этот день есть записи. Свайп вправо — предыдущие 7 дней, влево — обратно (не дальше сегодня);
 * для VoiceOver и мыши — кнопки «‹ ›» и действия доступности.
 */
export function WeeklyDateStrip({ selected, today, onSelect, marked, style }: { selected: ISODate; today: ISODate; onSelect: (d: ISODate) => void; marked: (d: ISODate) => boolean; style?: StyleProp<ViewStyle> }) {
  // Окно — 7 дней, заканчивается на end. Выбранный день всегда виден: окно сдвигается к нему
  const [end, setEnd] = useState(() => windowEndFor(selected, today));
  const [prevSel, setPrevSel] = useState(selected);
  if (selected !== prevSel) {
    setPrevSel(selected);
    if (daysBetween(selected, end) < 0 || daysBetween(selected, end) > 6) setEnd(windowEndFor(selected, today));
  }
  const shift = (weeks: number) => {
    const next = addDays(end, weeks * 7);
    const capped = daysBetween(next, today) < 0 ? today : next;
    if (capped === end) return;
    haptic.tap();
    setEnd(capped);
  };
  const live = useRef({ shift });
  useEffect(() => {
    live.current.shift = shift;
  });
  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 40) live.current.shift(-1);
        else if (g.dx < -40) live.current.shift(1);
      },
    }),
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const atToday = end === today;
  return (
    <View
      style={[styles.wrap, style]}
      {...pan.panHandlers}
      accessible={false}
      accessibilityActions={[
        { name: 'decrement', label: 'Предыдущие 7 дней' },
        { name: 'increment', label: 'Следующие 7 дней' },
      ]}
      onAccessibilityAction={(e) => shift(e.nativeEvent.actionName === 'decrement' ? -1 : 1)}
      testID="date-strip"
    >
      <IconButton name="chevron-back" label="Предыдущие 7 дней" bg="transparent" size={18} color={colors.muted} onPress={() => shift(-1)} style={styles.arrow} />
      <View style={styles.days}>
        {days.map((d) => {
          const sel = d === selected;
          const isToday = d === today;
          const has = marked(d);
          return (
            <Pressable
              key={d}
              testID={`strip-${d}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`${formatDayLong(d)}${isToday ? ', сегодня' : ''}${has ? ', есть записи' : ''}`}
              onPress={() => {
                if (!sel) haptic.tap();
                onSelect(d);
              }}
              style={styles.day}
            >
              <T v="caption" color={sel || isToday ? colors.text : colors.textDim}>
                {WEEKDAYS_SHORT[weekdayIndex(d)]}
              </T>
              <View style={[styles.num, sel && { backgroundColor: colors.text }]}>
                <T v="bodyStrong" color={sel ? colors.bg : isToday ? colors.accent : colors.text} style={{ fontVariant: ['tabular-nums'] }}>
                  {parseISODate(d).getDate()}
                </T>
              </View>
              <View style={[styles.mark, has && { backgroundColor: sel ? colors.text : colors.muted }]} />
            </Pressable>
          );
        })}
      </View>
      <IconButton name="chevron-forward" label="Следующие 7 дней" bg="transparent" size={18} color={colors.muted} disabled={atToday} onPress={() => shift(1)} style={styles.arrow} />
    </View>
  );
}

function windowEndFor(selected: ISODate, today: ISODate): ISODate {
  const back = daysBetween(selected, today);
  if (back <= 6) return today;
  // Целыми неделями от сегодня: выбранный день — внутри окна
  return addDays(today, -Math.floor(back / 7) * 7);
}

const styles = themed({
  wrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -space.sm },
  arrow: { width: 28, height: 44 },
  days: { flex: 1, flexDirection: 'row' },
  day: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, minHeight: 44 },
  num: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
});
