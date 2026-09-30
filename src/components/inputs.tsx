import React, { useEffect, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radius, space } from '@/theme';
import { Icon, T } from './ui';
import { haptic } from '@/services/haptics';
import { parseDecimal } from '@/utils/format';

export function Field({ label, hint, error, style, ...rest }: TextInputProps & { label?: string; hint?: string; error?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <T v="caption">{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        accessibilityLabel={label ?? rest.placeholder}
        {...rest}
        style={[styles.input, !!error && { borderColor: colors.danger }, rest.multiline && { height: 88, paddingTop: 12, textAlignVertical: 'top' }]}
      />
      {error ? (
        <T v="small" color={colors.danger}>
          {error}
        </T>
      ) : hint ? (
        <T v="small" style={{ fontSize: 12 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/**
 * Числовое поле со степпером: крупные кнопки ± и прямой ввод.
 * Значение хранится числом; ввод через запятую тоже принимается.
 */
export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  decimals = 0,
  unit,
  label,
  compact,
  style,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? (decimals ? String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace('.', ',') : String(Math.round(v))) : '');
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const bump = (d: number) => {
    haptic.tap();
    onChange(clamp(Math.round((value + d) * 1000) / 1000));
  };
  const h = compact ? 40 : 48;
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <T v="caption">{label}</T> : null}
      <View style={[styles.stepper, { height: h }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Уменьшить ${label ?? ''}`} onPress={() => bump(-step)} style={[styles.stepBtn, { width: h }]} hitSlop={4}>
          <Icon name="remove" size={20} color={colors.textDim} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              const n = parseDecimal(t);
              if (Number.isFinite(n)) onChange(clamp(n));
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setText(fmt(value));
            }}
            keyboardType="decimal-pad"
            selectTextOnFocus
            selectionColor={colors.accent}
            accessibilityLabel={label}
            style={[styles.stepInput, { width: Math.max(44, text.length * (compact ? 12 : 14) + 14) }, compact && { fontSize: 18 }]}
          />
          {unit ? <T v="small">{unit}</T> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Увеличить ${label ?? ''}`} onPress={() => bump(step)} style={[styles.stepBtn, { width: h }]} hitSlop={4}>
          <Icon name="add" size={20} color={colors.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

/** Шкала 1–5 с подписями крайних значений */
export function Scale5({ value, onChange, low, high, invert }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; low: string; high: string; invert?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n === value;
          const good = invert ? n <= 2 : n >= 4;
          const bad = invert ? n >= 4 : n <= 2;
          const c = good ? colors.accent : bad ? colors.warning : colors.textDim;
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${n} из 5`}
              onPress={() => {
                haptic.tap();
                onChange(n as 1 | 2 | 3 | 4 | 5);
              }}
              style={[styles.scaleItem, active && { backgroundColor: c, borderColor: c }]}
            >
              <T v="h3" color={active ? colors.onAccent : colors.textDim}>
                {n}
              </T>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="small" style={{ fontSize: 12 }}>
          {low}
        </T>
        <T v="small" style={{ fontSize: 12 }}>
          {high}
        </T>
      </View>
    </View>
  );
}

export function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        haptic.tap();
        onChange(!value);
      }}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1 }}>
        <T v="body">{label}</T>
        {sub ? <T v="small">{sub}</T> : null}
      </View>
      <View style={[styles.track, value && { backgroundColor: colors.accent }]}>
        <View style={[styles.thumb, value && { transform: [{ translateX: 20 }] }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stepBtn: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  stepInput: { flexShrink: 1, color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center', minWidth: 44, paddingHorizontal: 4, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  scaleItem: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 },
  track: { width: 50, height: 30, borderRadius: 15, backgroundColor: colors.surface3, padding: 3 },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text },
});
