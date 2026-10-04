import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { Button, Icon, IconButton, T } from './ui';
import { Sheet } from './Sheet';
import { haptic } from '@/services/haptics';
import { today } from '@/utils/date';
import { formatDateRu, iso, monthGrid, WD } from '@/utils/calendar';

export { formatDateRu, monthGrid };

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
/**
 * Поле даты: тап открывает календарь (месяцы листаются, будущее по умолчанию недоступно).
 * Без нативных зависимостей — работает в любой сборке. value/onChange — ISO 'YYYY-MM-DD' ('' — не выбрано).
 */
export function DateField({ label, value, onChange, placeholder = 'Выбрать дату', allowFuture = false, optional = false, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; allowFuture?: boolean; optional?: boolean; testID?: string }) {
  const [open, setOpen] = useState(false);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today();
  const [ym, setYm] = useState(() => ({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }));
  const max = today();
  const shift = (k: number) => setYm(({ y, m }) => ({ y: m + k < 0 ? y - 1 : m + k > 11 ? y + 1 : y, m: (m + k + 12) % 12 }));
  const nextDisabled = !allowFuture && iso(ym.y, ym.m, 1) > iso(Number(max.slice(0, 4)), Number(max.slice(5, 7)) - 1, 1);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <T v="caption">{label}</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDateRu(value) : 'не выбрано'}. Выбрать дату`}
        testID={testID}
        onPress={() => {
          const b = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today();
          setYm({ y: Number(b.slice(0, 4)), m: Number(b.slice(5, 7)) - 1 });
          setOpen(true);
        }}
        style={styles.field}
      >
        <Icon name="calendar-outline" size={18} color={colors.accent} />
        <T v="body" style={{ flex: 1, fontWeight: '600' }} color={value ? colors.text : colors.muted} numberOfLines={1}>
          {value ? formatDateRu(value) : placeholder}
        </T>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton name="chevron-back" label="Предыдущий месяц" onPress={() => shift(-1)} />
            <T v="h3" style={{ flex: 1, textAlign: 'center' }} accessibilityRole="header">
              {MONTHS[ym.m]} {ym.y}
            </T>
            <IconButton name="chevron-forward" label="Следующий месяц" onPress={() => shift(1)} disabled={nextDisabled} />
          </View>
          <View style={styles.row}>
            {WD.map((w) => (
              <T key={w} v="small" style={styles.wd}>
                {w}
              </T>
            ))}
          </View>
          <View style={styles.grid}>
            {monthGrid(ym.y, ym.m).map((d, i) => {
              if (d === null) return <View key={`e${i}`} style={styles.cell} />;
              const v = iso(ym.y, ym.m, d);
              const disabled = !allowFuture && v > max;
              const sel = v === value;
              const isToday = v === max;
              return (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityLabel={formatDateRu(v)}
                  accessibilityState={{ selected: sel, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    haptic.tap();
                    onChange(v);
                    setOpen(false);
                  }}
                  style={[styles.cell, styles.day, sel && { backgroundColor: colors.accent }, isToday && !sel && { borderColor: colors.accent, borderWidth: 1 }]}
                >
                  <T v="body" style={{ fontWeight: sel ? '800' : '500', fontVariant: ['tabular-nums'] }} color={sel ? colors.onAccent : disabled ? colors.muted : colors.text}>
                    {d}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Сегодня" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => { onChange(max); setOpen(false); }} />
            {optional && value ? <Button title="Очистить" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => { onChange(''); setOpen(false); }} /> : null}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = themed({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  row: { flexDirection: 'row' },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
});
