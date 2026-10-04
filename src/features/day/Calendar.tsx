import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import type { ISODate } from '@/types';
import { Icon, T } from '@/components/ui';
import { colors, radius, themed } from '@/theme';
import { haptic } from '@/services/haptics';
import { addDays, parseISODate, startOfWeek, toISODate, WEEKDAYS_SHORT } from '@/utils/date';
import { dayMarkers, type DaySources } from './summary';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** Дни сетки месяца (с понедельника, 5–6 недель) */
export function monthGrid(year: number, month: number): ISODate[] {
  const first = toISODate(new Date(year, month, 1));
  const start = startOfWeek(first);
  const last = new Date(year, month + 1, 0).getDate();
  const end = toISODate(new Date(year, month, last));
  const out: ISODate[] = [];
  for (let d = start; d <= end || out.length % 7; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Неделя с датами (сегодня подсвечено) → по шеврону или свайпу вниз раскрывается месяц.
 * Маркеры: тренировка (заливка), рекорд (звезда), день отдыха по плану (приглушён), сегодня (обводка).
 * Тап по любому дню — onSelect(date) (история дня).
 */
export function TrainingCalendar({ today: d, src, onSelect }: { today: ISODate; src: DaySources; onSelect: (date: ISODate) => void }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const t = parseISODate(d);
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [anim] = useState(() => new Animated.Value(0));
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(d), i)), [d]);
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const markers = useMemo(() => dayMarkers(open ? grid : week, src), [open, grid, week, src]);

  useEffect(() => {
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 220, useNativeDriver: false }).start();
  }, [open, anim]);

  // Вертикальный свайп по календарю: вниз — раскрыть, вверх — свернуть; горизонтальный по месяцу — листать
  const live = useRef({ open, shift: (_n: number) => {} });
  useEffect(() => {
    live.current.open = open;
    live.current.shift = (n: number) => setCursor((c) => {
      const dt = new Date(c.y, c.m + n, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });
  }, [open]);
  // eslint-disable-next-line react-hooks/refs -- ref читается только в обработчиках жеста
  const [pan] = useState(() =>
    PanResponder.create({
      // Захватываем только «свой» жест, чтобы не мешать прокрутке списка: закрыт — тянем вниз; открыт — вверх или вбок
      onMoveShouldSetPanResponder: (_e, g) => (live.current.open ? g.dy < -12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5 : g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5) || (live.current.open && Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5),
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dy) > Math.abs(g.dx)) {
          if (g.dy > 24 && !live.current.open) {
            haptic.tap();
            setOpen(true);
          } else if (g.dy < -24 && live.current.open) {
            haptic.tap();
            setOpen(false);
          }
        } else if (live.current.open && Math.abs(g.dx) > 40) {
          haptic.tap();
          live.current.shift(g.dx < 0 ? 1 : -1);
        }
      },
    }),
  );

  const toggle = () => {
    haptic.tap();
    if (!open) {
      const t = parseISODate(d);
      setCursor({ y: t.getFullYear(), m: t.getMonth() });
    }
    setOpen((x) => !x);
  };

  const shift = (n: number) => {
    const dt = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  return (
    <View {...pan.panHandlers} style={{ gap: 8 }} testID="training-calendar">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {open ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}>
            <Pressable onPress={() => shift(-1)} accessibilityLabel="Предыдущий месяц" hitSlop={8} style={styles.nav}>
              <Icon name="chevron-back" size={18} color={colors.textDim} />
            </Pressable>
            <T v="h3" style={{ fontSize: 16, minWidth: 130, textAlign: 'center' }}>
              {MONTHS[cursor.m]} {cursor.y}
            </T>
            <Pressable onPress={() => shift(1)} accessibilityLabel="Следующий месяц" hitSlop={8} style={styles.nav}>
              <Icon name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
          </View>
        ) : (
          <T v="caption" style={{ flex: 1 }}>
            Эта неделя
          </T>
        )}
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={open ? 'Свернуть календарь' : 'Открыть календарь месяца'} hitSlop={8} style={styles.nav}>
          <Animated.View style={{ transform: [{ rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Icon name="chevron-down" size={20} color={colors.accent} />
          </Animated.View>
        </Pressable>
      </View>

      {open ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row' }}>
            {WEEKDAYS_SHORT.map((w) => (
              <T key={w} v="small" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
                {w}
              </T>
            ))}
          </View>
          {Array.from({ length: grid.length / 7 }, (_, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {grid.slice(r * 7, r * 7 + 7).map((day) => (
                <DayCell key={day} date={day} today={d} m={markers[day]} dim={parseISODate(day).getMonth() !== cursor.m} onPress={() => onSelect(day)} compact />
              ))}
            </View>
          ))}
          <View style={styles.legend}>
            <Legend color={colors.accent} label="тренировка" />
            <Legend color={colors.warning} label="рекорд" star />
            <Legend color={colors.surface3} label="отдых" />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {week.map((day, i) => (
            <DayCell key={day} date={day} today={d} m={markers[day]} label={WEEKDAYS_SHORT[i]} onPress={() => onSelect(day)} />
          ))}
        </View>
      )}
    </View>
  );
}

function DayCell({ date, today: t, m, label, dim, compact, onPress }: { date: ISODate; today: ISODate; m?: { trained: boolean; record: boolean; rest: boolean; data: boolean }; label?: string; dim?: boolean; compact?: boolean; onPress: () => void }) {
  const isToday = date === t;
  const num = parseISODate(date).getDate();
  const trained = !!m?.trained;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${num}${isToday ? ', сегодня' : ''}${trained ? ', тренировка' : m?.rest ? ', отдых' : ''}${m?.record ? ', рекорд' : ''}`}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      testID={`day-${date}`}
      style={({ pressed }) => [compact ? styles.cellCompact : styles.cell, isToday && styles.today, pressed && { opacity: 0.6 }, dim && { opacity: 0.35 }]}
    >
      {label ? (
        <T v="small" style={{ fontSize: 11 }} color={isToday ? colors.accent : colors.textDim}>
          {label}
        </T>
      ) : null}
      <View style={[styles.num, trained ? { backgroundColor: colors.accent } : m?.rest ? { backgroundColor: colors.surface2 } : null]}>
        <T v="body" style={{ fontSize: 14, fontWeight: isToday || trained ? '800' : '600', fontVariant: ['tabular-nums'] }} color={trained ? colors.onAccent : isToday ? colors.accent : colors.text}>
          {num}
        </T>
      </View>
      <View style={{ height: 6, flexDirection: 'row', gap: 2 }}>
        {m?.record ? <Icon name="star" size={7} color={colors.warning} /> : m?.data && !trained ? <View style={styles.dot} /> : null}
      </View>
    </Pressable>
  );
}

function Legend({ color, label, star }: { color: string; label: string; star?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {star ? <Icon name="star" size={10} color={color} /> : <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />}
      <T v="small" style={{ fontSize: 11 }}>
        {label}
      </T>
    </View>
  );
}

const styles = themed({
  cell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: colors.surface },
  cellCompact: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1.5, borderColor: 'transparent' },
  today: { borderColor: colors.accent },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted },
  nav: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 4 },
});
