import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { FoodEntry, Macros, MealSlot, NutritionTarget } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, elevation } from '@/components/ui';
import { Scale } from '@/components/ds';
import { SwipeRow } from '@/components/ds/SwipeRow';
import { Sheet } from '@/components/Sheet';
import { Field } from '@/components/inputs';
import { toast } from '@/components/Dialog';
import { useNutrition, MEAL_LABEL } from '@/stores/nutrition';
import { sumFiber, sumMacros } from '@/features/nutrition/status';
import { fiberTarget } from '@/features/nutrition/targets';
import { unitText } from '@/features/nutrition/schema';
import type { UsualMeal } from '@/features/nutrition/quick';
import { fmtValue } from '@/utils/format';
import { haptic } from '@/services/haptics';

/**
 * Дневник питания (макет docs/design/mockups/02-nutrition.html): сводка «осталось / съедено / цель»,
 * калиброванные шкалы Б/Ж/У и клетчатки, приёмы пищи одной группой, строки продуктов со свайпом «Удалить».
 */

/** Сводка дня: главное число — сколько осталось; тап — «Почему такие КБЖУ?» */
export function DaySummary({ eaten, target, onWhy }: { eaten: Macros; target: NutritionTarget; onWhy: () => void }) {
  const left = Math.round(target.kcal - eaten.kcal);
  const over = left < 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${over ? `Больше цели на ${fmtValue(-left)}` : `Осталось ${fmtValue(left)}`} ккал, съедено ${fmtValue(eaten.kcal)} из ${fmtValue(target.kcal)}. Почему такие КБЖУ?`}
      onPress={() => {
        haptic.tap();
        onWhy();
      }}
      testID="day-summary"
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      <View style={styles.summary}>
        <View style={{ flexShrink: 1 }}>
          <T v="footnote">{over ? 'Больше цели' : 'Осталось'}</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T v="display" color={over ? colors.warning : colors.text} testID="kcal-left">
              {fmtValue(Math.abs(left))}
            </T>
            <T v="callout">ккал</T>
          </View>
        </View>
        <View style={styles.side}>
          <View style={styles.sideRow}>
            <T v="footnote">Съедено</T>
            <T v="bodyStrong" style={styles.num}>
              {fmtValue(eaten.kcal)}
            </T>
          </View>
          <View style={styles.sideRow}>
            <T v="footnote">Цель</T>
            <T v="bodyStrong" style={styles.num}>
              {fmtValue(target.kcal)}
            </T>
          </View>
        </View>
      </View>
      <Scale value={eaten.kcal} target={target.kcal} onSurface={false} accessibilityLabel={`Калории: ${fmtValue(eaten.kcal)} из ${fmtValue(target.kcal)}`} />
    </Pressable>
  );
}

/** Б/Ж/У и клетчатка: шкала до цели и «съедено / цель». Клетчатка без данных — «—», частично — «≥» */
export function MacroSummary({ entries, eaten, target, fiber: withFiber = true, testID = 'macro-summary' }: { entries: FoodEntry[]; eaten: Macros; target: NutritionTarget; fiber?: boolean; testID?: string }) {
  const fiber = sumFiber(entries);
  const rows: { key: string; label: string; v: number | null; t: number; c: string; partial?: boolean }[] = [
    { key: 'protein', label: 'Белки', v: eaten.protein, t: target.protein, c: colors.protein },
    { key: 'fat', label: 'Жиры', v: eaten.fat, t: target.fat, c: colors.fat },
    { key: 'carbs', label: 'Углеводы', v: eaten.carbs, t: target.carbs, c: colors.carbs },
    ...(withFiber ? [{ key: 'fiber', label: 'Клетчатка', v: fiber.g, t: target.fiber ?? fiberTarget(target.kcal), c: colors.fiber, partial: !fiber.complete }] : []),
  ];
  return (
    <View style={styles.macros} testID={testID}>
      {rows.map((r) => (
        <View key={r.label} testID={`macro-${r.key}`} style={styles.macro} accessible accessibilityLabel={`${r.label}: ${r.v === null ? 'нет данных' : `${r.partial ? 'не меньше ' : ''}${Math.round(r.v)}`} из ${Math.round(r.t)} г`}>
          <T v="callout" color={colors.text} style={styles.macroLabel} numberOfLines={1}>
            {r.label}
          </T>
          <Scale value={r.v ?? 0} target={r.t} color={r.c} onSurface={false} style={{ flex: 1 }} />
          <T v="bodyStrong" style={styles.macroValue} numberOfLines={1}>
            {r.v === null ? '—' : `${r.partial ? '≥' : ''}${Math.round(r.v)}`}
            <T v="footnote">{` / ${Math.round(r.t)} г`}</T>
          </T>
        </View>
      ))}
    </View>
  );
}

/**
 * Дневник питания карточками приёмов пищи (R2, по скриншотам владельца): значок и название, справа калории крупно и
 * акцентный «+»; под шапкой — строка Б · Ж · У · Кл приёма (тап — свернуть/развернуть список); продукты: название,
 * количество акцентом, строка Б · Ж · У · Кл, справа калории и «›». Свайп влево по продукту — «Удалить».
 */
/** Числа в колонках растут с крупным шрифтом не больше чем на 20% — иначе колонки разъезжаются */
const COL_SCALE = 1.2;

const MEAL_ICON: Record<MealSlot, { icon: React.ComponentProps<typeof Icon>['name']; color: () => string }> = {
  breakfast: { icon: 'partly-sunny', color: () => colors.carbs },
  lunch: { icon: 'sunny', color: () => colors.ringWeek },
  dinner: { icon: 'cloudy-night', color: () => colors.fat },
  snack: { icon: 'moon', color: () => colors.ringSleep },
};

/** Граммы КБЖУ: до одного знака после запятой, без «,0» */
const g1 = (v: number | null | undefined) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));

/** Четыре колонки Б · Ж · У · Кл одинаковой ширины — одинаково в подписи, итоге приёма и строках продуктов */
export function MacroCols({ m, strong, dim }: { m: { protein?: number; fat?: number; carbs?: number; fiber?: number | null }; strong?: boolean; dim?: boolean }) {
  const vals = [m.protein, m.fat, m.carbs, m.fiber];
  return (
    <View style={styles.cols} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {vals.map((v, i) => (
        <T key={i} v={strong ? 'callout' : 'footnote'} maxFontSizeMultiplier={COL_SCALE} color={dim ? colors.textDim : colors.text} style={[styles.col, strong && { fontWeight: '600' }]} numberOfLines={1}>
          {g1(v)}
        </T>
      ))}
    </View>
  );
}

/** Подпись колонок над карточками: Б · Ж · У · Кл цветами данных (колонки — как в карточках) */
export function MacroTableHead() {
  const heads: [string, string][] = [
    ['Белки', colors.protein],
    ['Жиры', colors.fat],
    ['Углев.', colors.carbs],
    ['Клетч.', colors.fiber],
  ];
  return (
    <View style={styles.legend} testID="macro-table-head" accessible accessibilityLabel="Колонки: белки, жиры, углеводы, клетчатка, граммы">
      <View style={styles.cols}>
        {heads.map(([h, c]) => (
          <T key={h} v="caption" maxFontSizeMultiplier={COL_SCALE} color={c} style={styles.col} numberOfLines={1}>
            {h}
          </T>
        ))}
      </View>
      <View style={styles.mside} />
    </View>
  );
}

/** Свёрнутые приёмы пищи — на время работы приложения (между вкладками и днями) */
const collapsed = new Set<MealSlot>();

export function MealSection({
  meal,
  entries,
  usual,
  yesterday,
  onAdd,
  onEdit,
  onDelete,
  onUsual,
  onRepeat,
}: {
  meal: MealSlot;
  entries: FoodEntry[];
  usual: UsualMeal | null;
  yesterday: FoodEntry[];
  onAdd: () => void;
  onEdit: (e: FoodEntry) => void;
  onDelete: (e: FoodEntry) => void;
  onUsual: (u: UsualMeal) => void;
  onRepeat: () => void;
}) {
  const [open, setOpen] = useState(() => !collapsed.has(meal));
  const sum = sumMacros(entries);
  const fiber = sumFiber(entries).g;
  const yKcal = Math.round(yesterday.reduce((a, e) => a + e.macros.kcal, 0));
  const ic = MEAL_ICON[meal];
  const toggle = () => {
    haptic.tap();
    if (open) collapsed.add(meal);
    else collapsed.delete(meal);
    setOpen(!open);
  };
  return (
    <View style={[styles.card, elevation()]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Добавить в ${MEAL_LABEL[meal]}${entries.length ? `. Сейчас ${Math.round(sum.kcal)} ккал` : ''}`}
        onPress={onAdd}
        style={({ pressed }) => [styles.mealHead, pressed && { opacity: 0.7 }]}
        testID={`meal-${meal}`}
      >
        <Icon name={ic.icon} size={26} color={ic.color()} />
        <T v="title2" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          {MEAL_LABEL[meal]}
        </T>
        {entries.length ? (
          <View style={styles.kcalBox}>
            <T v="metric" style={styles.kcalBig}>
              {fmtValue(Math.round(sum.kcal))}
            </T>
            <T v="caption">ккал</T>
          </View>
        ) : null}
        <Icon name="add" size={30} color={colors.accent} />
      </Pressable>
      {entries.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${MEAL_LABEL[meal]}: белки ${g1(sum.protein)}, жиры ${g1(sum.fat)}, углеводы ${g1(sum.carbs)}${fiber !== null ? `, клетчатка ${g1(fiber)}` : ''} г. ${open ? 'Свернуть' : 'Развернуть'} список`}
          onPress={toggle}
          style={({ pressed }) => [styles.totals, pressed && { backgroundColor: colors.surface2 }]}
          testID={`meal-totals-${meal}`}
        >
          <MacroCols m={{ ...sum, fiber }} strong />
          <View style={styles.mside}>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textDim} />
          </View>
        </Pressable>
      ) : null}
      {open ? entries.map((e) => <FoodRow key={e.id} entry={e} onPress={() => onEdit(e)} onDelete={() => onDelete(e)} />) : null}
      {!entries.length && usual ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Добавить обычный ${MEAL_LABEL[meal].toLowerCase()}: ${usual.items.map((i) => i.product.name).join(', ')}`} onPress={() => onUsual(usual)} style={({ pressed }) => [styles.repeat, pressed && { opacity: 0.6 }]} testID={`usual-${meal}`}>
          <Icon name="repeat" size={18} color={colors.textDim} />
          <T v="callout" numberOfLines={2} style={{ flex: 1 }}>
            Обычный {MEAL_LABEL[meal].toLowerCase()}: {usual.items.map((i) => i.product.name).join(', ')}
          </T>
          <T v="callout" color={colors.muted} style={{ fontVariant: ['tabular-nums'] }}>
            {fmtValue(usual.kcal)} ккал
          </T>
        </Pressable>
      ) : !entries.length && yesterday.length ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Скопировать ${MEAL_LABEL[meal].toLowerCase()} со вчера`} onPress={onRepeat} style={({ pressed }) => [styles.repeat, pressed && { opacity: 0.6 }]} testID={`repeat-${meal}`}>
          <Icon name="repeat" size={18} color={colors.textDim} />
          <T v="callout" style={{ flex: 1 }}>
            Повторить вчерашний {meal === 'snack' ? 'перекус' : MEAL_LABEL[meal].toLowerCase()}
          </T>
          <T v="callout" color={colors.muted} style={{ fontVariant: ['tabular-nums'] }}>
            {fmtValue(yKcal)} ккал
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Продукт: название, количество акцентом («пачка, 180 г»), Б · Ж · У · Кл; справа калории и «›»; свайп влево — удалить */
export function FoodRow({ entry: e, onPress, onDelete }: { entry: FoodEntry; onPress: () => void; onDelete: () => void }) {
  const amount = e.unit ? `${unitText(e.unit.qty, e.unit)}, ${fmtValue(e.grams)} г` : `${fmtValue(e.grams)} г`;
  return (
    <SwipeRow onDelete={onDelete} testID={`entry-${e.id}`}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${e.name}, ${amount}, ${Math.round(e.macros.kcal)} ккал, белки ${g1(e.macros.protein)}, жиры ${g1(e.macros.fat)}, углеводы ${g1(e.macros.carbs)}${e.estimate ? ', оценка' : ''}. Изменить`} style={({ pressed }) => [styles.food, pressed && { backgroundColor: colors.surface2 }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T v="body" color={colors.text} numberOfLines={2}>
            {e.name}
          </T>
          <T v="footnote" color={colors.accent} numberOfLines={1}>
            {amount}
            {e.estimate ? ' · оценка' : ''}
          </T>
          <View style={{ marginTop: 4 }}>
            <MacroCols m={{ ...e.macros, fiber: e.macros.fiber ?? null }} dim />
          </View>
        </View>
        <View style={[styles.mside, styles.foodKcal]}>
          <T v="metric" color={colors.textDim} style={{ fontSize: 20, lineHeight: 25 }}>
            {fmtValue(Math.round(e.macros.kcal))}
          </T>
          <Icon name="chevron-forward" size={16} color={colors.muted} />
        </View>
      </Pressable>
    </SwipeRow>
  );
}

/** Сохранить приём пищи как блюдо — потом добавляется одним действием из «Мои» */
export function SaveMealSheet({ value, onClose }: { value: { slot: MealSlot; entries: FoodEntry[] } | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (value) setName(`Мой ${MEAL_LABEL[value.slot].toLowerCase()}`);
  }
  return (
    <Sheet visible={!!value} onClose={onClose} title="Сохранить как блюдо" subtitle="Потом — добавить всё одним действием: «Добавить еду» → «Мои»">
      {value ? (
        <View style={{ gap: space.md }}>
          <Field label="Название" value={name} onChangeText={setName} maxLength={40} />
          <View style={{ gap: 4 }}>
            {value.entries.map((e) => (
              <T key={e.id} v="callout" color={colors.text}>
                {e.name} — {fmtValue(e.grams)} г
              </T>
            ))}
          </View>
          <Button
            title="Сохранить"
            icon="bookmark-outline"
            size="lg"
            full
            disabled={!name.trim()}
            onPress={() => {
              useNutrition.getState().saveMeal(name, value.entries.map((e) => ({ productId: e.productId, name: e.name, grams: e.grams })));
              haptic.success();
              toast(`«${name.trim()}» в «Моих»`, 'bookmark');
              onClose();
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = themed({
  summary: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md, marginBottom: space.sm },
  side: { gap: 2, alignItems: 'flex-end' },
  sideRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  num: { fontVariant: ['tabular-nums'], minWidth: 52, textAlign: 'right' },
  macros: { gap: space.xs, marginTop: space.md },
  macro: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28, flexWrap: 'wrap' },
  macroLabel: { width: 92 },
  macroValue: { minWidth: 92, textAlign: 'right', fontVariant: ['tabular-nums'] },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden' },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64, paddingVertical: space.sm, paddingLeft: space.md, paddingRight: space.sm },
  kcalBox: { alignItems: 'flex-end' },
  kcalBig: { fontSize: 22, lineHeight: 26, fontWeight: '700' },
  totals: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: space.md, borderTopWidth: 0.5, borderTopColor: colors.borderStrong },
  legend: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingBottom: space.xxs },
  cols: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, textAlign: 'left', fontVariant: ['tabular-nums'] },
  mside: { width: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingRight: space.sm },
  foodKcal: { alignSelf: 'center' },
  food: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 64, paddingVertical: space.sm, paddingLeft: space.md, borderTopWidth: 0.5, borderTopColor: colors.borderStrong },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, minHeight: 36 },
});
