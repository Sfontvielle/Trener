import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { Icon, T } from './ui';
import { haptic } from '@/services/haptics';
import { INPUT_MAX_SCALE, inputWidth } from './inputs';
import { parseDecimal } from '@/utils/format';

const PX = 9; // пикселей на единицу шкалы (1 см / 1 кг)

/**
 * Линейка выбора числа (эталон 03_body_parameters): крупное значение в плашке — его можно ввести с клавиатуры,
 * шкала с делениями (каждая единица, средние — через 5, подписи — через 10) тянется пальцем, «−/+» — точный шаг.
 * Пока человек ничего не выбрал, значение пустое («—»), шкала стоит на `start` и подсвеченной метки нет.
 * Рисуются только видимые деления — шкала лёгкая при любом диапазоне. VoiceOver: adjustable (± шаг).
 */
export function RulerPicker({
  value,
  onChange,
  min,
  max,
  start,
  step = 1,
  decimals = 0,
  unit,
  label,
  testID,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min: number;
  max: number;
  /** Где стоит шкала, пока значение не выбрано */
  start: number;
  /** Шаг кнопок −/+ и точность перетаскивания */
  step?: number;
  decimals?: number;
  unit: string;
  label: string;
  testID?: string;
}) {
  const [width, setWidth] = useState(320);
  const [text, setText] = useState<string | null>(null);
  const shown = value ?? start;
  const round = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const fix = (v: number) => Number(v.toFixed(decimals));
  const live = useRef({ value, onChange, start, round, fix });
  useEffect(() => {
    live.current = { value, onChange, start, round, fix };
  });

  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const drag = { from: 0, last: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        drag.from = live.current.value ?? live.current.start;
        drag.last = drag.from;
      },
      onPanResponderMove: (_, g) => {
        // палец вправо — шкала едет вправо, значение уменьшается
        const L = live.current;
        const v = L.fix(L.round(drag.from - g.dx / PX));
        if (v !== drag.last) {
          if (Math.floor(v) !== Math.floor(drag.last)) haptic.tap();
          drag.last = v;
          L.onChange(v);
        }
      },
    });
  });

  const bump = (d: number) => {
    haptic.tap();
    onChange(fix(round((value ?? start) + d)));
  };

  // видимые деления вокруг текущего значения
  const half = Math.ceil(width / 2 / PX) + 1;
  const ticks: number[] = [];
  for (let u = Math.floor(shown) - half; u <= Math.ceil(shown) + half; u++) if (u >= min && u <= max) ticks.push(u);
  const fmt = (v: number) => (decimals ? v.toFixed(decimals).replace('.', ',') : String(Math.round(v)));
  const picked = value !== undefined;

  return (
    <View style={{ gap: 26, alignItems: 'center' }} testID={testID}>
      <View style={[styles.valueBox, picked && styles.valueBoxOn]}>
        <TextInput
          value={text ?? (picked ? fmt(value) : '')}
          placeholder="—"
          placeholderTextColor={colors.muted}
          onFocus={() => setText(picked ? fmt(value) : '')}
          onChangeText={(t) => {
            const clean = t.replace(/[^\d.,]/g, '');
            setText(clean);
            const n = parseDecimal(clean);
            if (clean && Number.isFinite(n)) onChange(fix(n));
          }}
          onBlur={() => setText(null)}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          maxLength={decimals ? 5 : 3}
          selectionColor={colors.accent}
          accessibilityLabel={`${label}, ${unit}`}
          maxFontSizeMultiplier={INPUT_MAX_SCALE}
          style={[styles.valueInput, { width: Math.max(64, inputWidth(text ?? (picked ? fmt(value) : '—'), 40)) }]}
        />
        <T v="h3" color={colors.textDim} style={{ marginTop: 10 }}>
          {unit}
        </T>
      </View>

      <View
        style={styles.ruler}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: picked ? `${fmt(value)} ${unit}` : 'не выбрано' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => bump(e.nativeEvent.actionName === 'increment' ? step : -step)}
        {...pan.panHandlers}
      >
        {ticks.map((u) => {
          const x = width / 2 + (u - shown) * PX;
          const major = u % 10 === 0;
          const mid = u % 5 === 0;
          const near = Math.abs(u - shown) < 6;
          return (
            <View key={u} pointerEvents="none" style={{ position: 'absolute', left: x - 1, top: 0, alignItems: 'center', width: 2 }}>
              <View style={{ width: major ? 2 : 1.5, height: major ? 40 : mid ? 30 : 20, marginTop: major ? 0 : mid ? 5 : 10, borderRadius: 1, backgroundColor: picked && near ? colors.accent : colors.borderStrong, opacity: picked && near ? 0.4 + 0.6 * (1 - Math.abs(u - shown) / 6) : 1 }} />
              {major && x > 22 && x < width - 22 ? (
                <T v="small" style={{ position: 'absolute', top: 50, width: 44, textAlign: 'center', fontVariant: ['tabular-nums'], fontWeight: Math.abs(u - shown) < 5 && picked ? '800' : '500' }} color={Math.abs(u - shown) < 5 && picked ? colors.text : colors.textDim}>
                  {u}
                </T>
              ) : null}
            </View>
          );
        })}
        {/* центральная метка */}
        <View pointerEvents="none" style={[styles.needle, { left: width / 2 - 1.5, backgroundColor: picked ? colors.accent : colors.textDim }]} />
      </View>

      <View style={styles.pmRow}>
        <Pressable onPress={() => bump(-step)} accessibilityRole="button" accessibilityLabel={`${label}: меньше`} hitSlop={8} style={({ pressed }) => [styles.pm, pressed && { opacity: 0.6 }]}>
          <Icon name="remove" size={26} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => bump(step)} accessibilityRole="button" accessibilityLabel={`${label}: больше`} hitSlop={8} style={({ pressed }) => [styles.pm, pressed && { opacity: 0.6 }]}>
          <Icon name="add" size={26} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed({
  valueBox: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 190, height: 74, paddingHorizontal: 24, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  valueBoxOn: { borderColor: colors.borderStrong },
  valueInput: { fontSize: 40, fontWeight: '800', color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'], padding: 0, flexGrow: 0, flexShrink: 0 },
  ruler: { width: '100%', height: 76, overflow: 'hidden' },
  needle: { position: 'absolute', top: -4, width: 3, height: 50, borderRadius: 1.5 },
  pmRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 8 },
  pm: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
});
