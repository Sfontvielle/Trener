import React, { useEffect, useState } from 'react';
import { Animated, PixelRatio, Pressable, StyleProp, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { Icon, T } from './ui';
import { haptic } from '@/services/haptics';
import { parseDecimal } from '@/utils/format';
import { useEnsureVisible } from './keyboard';
import { prefersReducedMotion } from './motion';

/** accessory — кнопка ВНУТРИ поля справа (например «+» выбора из списка) */
export function Field({ label, hint, error, style, accessory, ...rest }: TextInputProps & { label?: string; hint?: string; error?: string; style?: StyleProp<ViewStyle>; accessory?: React.ReactNode }) {
  const ensure = useEnsureVisible();
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <T v="caption">{label}</T> : null}
      <View>
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        accessibilityLabel={label ?? rest.placeholder}
        {...rest}
        onFocus={(e) => {
          rest.onFocus?.(e);
          ensure();
        }}
        // Многострочное поле растёт вместе с текстом — и остаётся над клавиатурой
        onContentSizeChange={(e) => {
          rest.onContentSizeChange?.(e);
          if (rest.multiline) ensure();
        }}
        style={[styles.input, !!error && { borderColor: colors.danger }, rest.multiline && { minHeight: 88, height: undefined, maxHeight: 180, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' }, !!accessory && { paddingRight: 52 }]}
      />
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>
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
/**
 * Ширина поля числа — по числу символов, размеру шрифта и системному масштабу текста (Dynamic Type):
 * иначе «26» при крупном шрифте обрезалось до «2». Цифры моноширинные (tabular-nums) ≈ 0,62 кегля.
 */
const INPUT_MAX_SCALE = 1.3;
export function inputWidth(text: string, fontSize: number, fontScale = PixelRatio.getFontScale()): number {
  const k = Math.min(Math.max(fontScale, 1), INPUT_MAX_SCALE);
  const chars = Math.max(2, text.length);
  return Math.ceil(chars * fontSize * 0.64 * k) + 12;
}

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
  inline,
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
  /** Строкой: подпись слева, крупное значение и −/+ справа (единый вид для возраста, роста, веса) */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? (decimals ? String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace('.', ',') : String(Math.round(v))) : '');
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  const ensure = useEnsureVisible();
  // Внешнее изменение значения (±, пресеты) обновляет текст, если поле не редактируется
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focused) setText(fmt(value));
  }
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const bump = (d: number) => {
    haptic.tap();
    onChange(clamp(Math.round((value + d) * 1000) / 1000));
  };
  const h = compact ? 40 : inline ? 44 : 48;
  const fontSize = inline ? 24 : compact ? 18 : 20;
  return (
    <View style={[inline ? styles.inlineRow : { gap: 6 }, style]}>
      {label ? (
        <T v={inline ? 'body' : 'caption'} color={inline ? colors.textDim : undefined} style={inline ? { flex: 1 } : undefined}>
          {label}
        </T>
      ) : null}
      <View style={[styles.stepper, { height: h }, inline && styles.stepperInline]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Уменьшить ${label ?? ''}`} onPress={() => bump(-step)} style={[styles.stepBtn, { width: h }, inline && styles.stepBtnRound]} hitSlop={4}>
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
            onFocus={() => {
              setFocused(true);
              ensure();
            }}
            onBlur={() => {
              setFocused(false);
              setText(fmt(value));
            }}
            keyboardType="decimal-pad"
            selectTextOnFocus
            selectionColor={colors.accent}
            accessibilityLabel={label}
            maxFontSizeMultiplier={INPUT_MAX_SCALE}
            style={[styles.stepInput, { fontSize, width: inputWidth(text, fontSize) }]}
          />
          {unit ? (
            <T v="small" numberOfLines={1}>
              {unit}
            </T>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Увеличить ${label ?? ''}`} onPress={() => bump(step)} style={[styles.stepBtn, { width: h }, inline && styles.stepBtnRound]} hitSlop={4}>
          <Icon name="add" size={20} color={colors.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Число без значения по умолчанию (анкета): пусто, пока человек сам не ввёл. Строкой — подпись слева, поле справа.
 * onChange(undefined) — поле очищено или введено не число.
 */
export function NumberField({ label, unit, value, onChange, decimals = 0, error, placeholder = '—', testID }: { label: string; unit?: string; value: number | undefined; onChange: (v: number | undefined) => void; decimals?: number; error?: string; placeholder?: string; testID?: string }) {
  const fmt = (v: number | undefined) => (v === undefined ? '' : decimals ? String(v).replace('.', ',') : String(Math.round(v)));
  const [text, setText] = useState(fmt(value));
  const [prev, setPrev] = useState(value);
  const [focused, setFocused] = useState(false);
  const ensure = useEnsureVisible();
  if (value !== prev) {
    setPrev(value);
    if (!focused) setText(fmt(value));
  }
  const fontSize = 24;
  return (
    <View testID={testID}>
      <View style={styles.inlineRow}>
        <T v="body" color={colors.textDim} style={{ flex: 1 }}>
          {label}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              const clean = t.replace(/[^\d.,]/g, '');
              setText(clean);
              const n = parseDecimal(clean);
              onChange(clean && Number.isFinite(n) ? (decimals ? Math.round(n * 10 ** decimals) / 10 ** decimals : Math.round(n)) : undefined);
            }}
            onFocus={() => {
              setFocused(true);
              ensure();
            }}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
            selectionColor={colors.accent}
            accessibilityLabel={unit ? `${label}, ${unit}` : label}
            maxLength={decimals ? 5 : 3}
            maxFontSizeMultiplier={INPUT_MAX_SCALE}
            style={[styles.stepInput, styles.numField, { fontSize, width: Math.max(64, inputWidth(text || placeholder, fontSize) + 20) }, !!error && { borderColor: colors.danger }]}
          />
          {unit ? (
            <T v="small" numberOfLines={1} style={{ minWidth: 26 }}>
              {unit}
            </T>
          ) : null}
        </View>
      </View>
      {error ? (
        <T v="small" color={colors.danger} style={{ marginTop: -6, marginBottom: 8 }}>
          {error}
        </T>
      ) : null}
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
              style={[styles.scaleItem, active && { backgroundColor: c === colors.textDim ? colors.text : c }]}
            >
              <T v="h3" color={active ? colors.bg : colors.textDim}>
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
  // Переключатель как в iOS: бегунок едет пружиной, дорожка мягко наливается цветом
  const [a] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) a.setValue(value ? 1 : 0);
    else Animated.spring(a, { toValue: value ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 7 }).start();
  }, [value, a]);
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
      <Animated.View style={[styles.track, { backgroundColor: a.interpolate({ inputRange: [0, 1], outputRange: [colors.surface3, colors.accent] }) }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = themed({
  accessory: { position: 'absolute', right: 6, top: 6 },
  input: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.md },
  // Ширина — по содержимому, не меньше 196 (кнопки −/+ у возраста, роста и веса стоят ровно друг под другом)
  stepperInline: { minWidth: 196, flexShrink: 0, backgroundColor: 'transparent', gap: 6 },
  stepBtnRound: { borderRadius: 24, backgroundColor: colors.surface2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60 },
  stepBtn: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  numField: { minHeight: 44, borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'transparent' },
  stepInput: { flexShrink: 0, color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center', paddingHorizontal: 4, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  scaleItem: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 },
  track: { width: 50, height: 30, borderRadius: 15, backgroundColor: colors.surface3, padding: 3 },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text },
});
