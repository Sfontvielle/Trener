import React, { useState } from 'react';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Sex } from '@/types';
import { colors, radius, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import { Progress } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { haptic } from '@/services/haptics';

/**
 * Детали анкеты по эталонам onboarding/02–06: шапка «N из 5» с полосой, крупный заголовок по центру,
 * карточки выбора с подсветкой выбранной (лаймовая рамка и мягкое свечение), карточки целей с 3D-изображением,
 * частота «−/+» с быстрыми чипами, выпадающие списки (лист снизу).
 */

export function StageHeader({ stage, total, progress, onBack }: { stage: number; total: number; progress: number; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <View style={{ width: 44 }}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8} style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
            <Icon name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ flex: 1, alignItems: 'center', gap: 12 }}>
        <T v="body" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }} accessibilityLabel={`Этап ${stage} из ${total}`}>
          {`${stage} из ${total}`}
        </T>
        <Progress value={progress} color={colors.accent} track={colors.surface3} height={5} style={{ width: '100%' }} />
      </View>
      <View style={{ width: 44 }} />
    </View>
  );
}

export function StageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      <T v="h1" accessibilityRole="header" style={{ textAlign: 'center', fontSize: 30, lineHeight: 36 }}>
        {title}
      </T>
      {sub ? (
        <T v="bodyDim" style={{ textAlign: 'center' }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

/** Карточка выбора: заголовок, подпись, у выбранной — лаймовая рамка, свечение и «›» */
export function ChoiceCard({ title, sub, icon, active, onPress, image, tall }: { title: string; sub?: string; icon?: IconName; active: boolean; onPress: () => void; image?: ImageSourcePropType; tall?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={title}
      accessibilityHint={sub}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.card, tall && { minHeight: 104 }, active && styles.cardOn, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      {icon ? <Icon name={icon} size={24} color={active ? colors.accent : colors.text} /> : null}
      <View style={{ flex: 1, gap: 4, paddingVertical: 2 }}>
        <T v="h3" style={{ fontSize: tall ? 21 : 18 }}>
          {title}
        </T>
        {sub ? (
          <T v="small" color={colors.textDim} style={{ fontSize: 14 }}>
            {sub}
          </T>
        ) : null}
      </View>
      {image ? <Image source={image} style={styles.cardImage} resizeMode="cover" accessibilityIgnoresInvertColors /> : active ? <Icon name="chevron-forward" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

export function SexCards({ value, onChange }: { value: Sex | undefined; onChange: (v: Sex) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      {(['male', 'female'] as const).map((sx) => {
        const active = value === sx;
        return (
          <Pressable
            key={sx}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={sx === 'male' ? 'Мужчина' : 'Женщина'}
            onPress={() => {
              haptic.tap();
              onChange(sx);
            }}
            style={({ pressed }) => [styles.sex, active && styles.cardOn, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <MaterialCommunityIcons name={sx === 'male' ? 'gender-male' : 'gender-female'} size={50} color={active ? colors.accent : colors.text} />
            <T v="h3" style={{ fontSize: 18 }}>
              {sx === 'male' ? 'Мужчина' : 'Женщина'}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** «Сколько раз в неделю»: крупное число с −/+ и быстрые чипы 2–6. Пока не выбрано — «—» */
export function FrequencyPicker({ value, onChange, min = 2, max = 6 }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number }) {
  const set = (v: number) => {
    haptic.tap();
    onChange(Math.min(max, Math.max(min, v)));
  };
  const opts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <View style={styles.freq} accessible accessibilityRole="adjustable" accessibilityLabel="Тренировок в неделю" accessibilityValue={{ text: value ? String(value) : 'не выбрано' }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => set((value ?? 3) + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
        <Pressable onPress={() => set((value ?? min + 1) - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Реже" disabled={value === min}>
          <Icon name="remove" size={30} color={value === min ? colors.muted : colors.text} />
        </Pressable>
        <T v="hero" style={{ fontSize: 48, minWidth: 60, textAlign: 'center', fontVariant: ['tabular-nums'] }} color={value ? colors.text : colors.muted} testID="q-freq-value">
          {value ?? '—'}
        </T>
        <Pressable onPress={() => set((value ?? min) + (value ? 1 : 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Чаще" disabled={value === max}>
          <Icon name="add" size={30} color={value === max ? colors.muted : colors.text} />
        </Pressable>
      </View>
      <T v="bodyDim">{value ? daysWord(value) : 'раз в неделю'}</T>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        {opts.map((n) => (
          <Pressable key={n} onPress={() => set(n)} accessibilityRole="radio" accessibilityState={{ selected: value === n }} accessibilityLabel={`${n} ${daysWord(n)}`} style={({ pressed }) => [styles.chip, value === n && styles.cardOn, pressed && { opacity: 0.7 }]}>
            <T v="h3" style={{ fontSize: 18 }}>
              {n}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const daysWord = (n: number) => (n >= 2 && n <= 4 ? 'раза в неделю' : 'раз в неделю');

/** Выпадающий список (эталон 06_lifestyle): поле с подписью и «⌄», выбор — в листе снизу */
export function Dropdown<V extends string | number>({ label, value, options, onChange, placeholder = 'Выбери', testID }: { label: string; value: V | undefined; options: { v: V; label: string; sub?: string }[]; onChange: (v: V) => void; placeholder?: string; testID?: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.v === value);
  return (
    <View style={{ gap: 10 }}>
      <T v="body" style={{ fontWeight: '700', fontSize: 16 }}>
        {label}
      </T>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${cur ? cur.label : 'не выбрано'}`} testID={testID} style={({ pressed }) => [styles.drop, pressed && { opacity: 0.8 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body" color={cur ? colors.text : colors.muted} style={{ fontWeight: cur ? '600' : '400' }}>
            {cur ? cur.label : placeholder}
          </T>
          {cur?.sub ? (
            <T v="small" color={colors.textDim}>
              ({cur.sub})
            </T>
          ) : null}
        </View>
        <Icon name="chevron-down" size={20} color={colors.text} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ gap: 10 }}>
          {options.map((o) => (
            <ChoiceCard
              key={String(o.v)}
              title={o.label}
              sub={o.sub}
              active={o.v === value}
              onPress={() => {
                onChange(o.v);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = themed({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 18, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accentDim, shadowColor: colors.accent, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  cardImage: { width: 112, height: 104, marginVertical: -14, marginRight: -18 },
  sex: { flex: 1, aspectRatio: 0.82, alignItems: 'center', justifyContent: 'center', gap: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.border },
  freq: { flexDirection: 'row', alignItems: 'center', gap: 30, paddingHorizontal: 28, height: 92, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chip: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.border },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
});

