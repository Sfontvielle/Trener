import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { FoodEntry, Macros, MealSlot, NutritionTarget } from '@/types';
import { colors, space, themed } from '@/theme';
import { Button, Icon, T, fontScale } from '@/components/ui';
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

/** Приём пищи: заголовок с суммой и «+», продукты; пустой — «обычный» или «как вчера» одним тапом */
/** Ширины колонок таблицы КБЖУ: ккал · Б · Ж · У · Кл (одинаковые в шапке, итогах и строках продуктов) */
const COL = [48, 32, 32, 34, 30] as const;
/** Числа в колонках растут с крупным шрифтом не больше чем на 20% — иначе колонки разъезжаются */
const COL_SCALE = 1.2;
/** При крупном системном шрифте название идёт отдельной строкой во всю ширину, колонки — под ним */
const stacked = () => fontScale() >= 1.35;

/** Пять чисел КБЖУ в колонках; клетчатка неизвестна — «—» */
export function MacroCols({ m, strong, dim }: { m: { kcal?: number; protein?: number; fat?: number; carbs?: number; fiber?: number | null }; strong?: boolean; dim?: boolean }) {
  const vals = [m.kcal, m.protein, m.fat, m.carbs, m.fiber];
  return (
    <View style={styles.cols} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {vals.map((v, i) => (
        <T key={i} v="footnote" maxFontSizeMultiplier={COL_SCALE} color={dim ? colors.muted : colors.text} style={[styles.col, { width: COL[i] }, strong && { fontWeight: '600' }]} numberOfLines={1}>
          {v === undefined || v === null || !Number.isFinite(v) ? '—' : fmtValue(Math.round(v))}
        </T>
      ))}
    </View>
  );
}

/** Шапка таблицы: подписи колонок (цвет — у данных) и итог дня теми же колонками */
export function MacroTableHead({ eaten, fiber }: { eaten: Macros; fiber: number | null }) {
  const heads: [string, string][] = [
    ['Ккал', colors.textDim],
    ['Б', colors.protein],
    ['Ж', colors.fat],
    ['У', colors.carbs],
    ['Кл', colors.fiber],
  ];
  return (
    <View testID="macro-table-head">
      <View style={styles.tableHead}>
        <View style={{ flex: 1 }} />
        <View style={styles.cols}>
          {heads.map(([h, c], i) => (
            <T key={h} v="caption" maxFontSizeMultiplier={COL_SCALE} color={c} style={[styles.col, { width: COL[i] }]}>
              {h}
            </T>
          ))}
        </View>
      </View>
      <View style={styles.tableTotal} accessible accessibilityLabel={`Итого за день: ${Math.round(eaten.kcal)} ккал, белки ${Math.round(eaten.protein)} г, жиры ${Math.round(eaten.fat)} г, углеводы ${Math.round(eaten.carbs)} г${fiber !== null ? `, клетчатка ${Math.round(fiber)} г` : ''}`}>
        <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          Итого
        </T>
        <MacroCols m={{ ...eaten, fiber }} strong />
      </View>
    </View>
  );
}

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
  const sum = sumMacros(entries);
  const yKcal = Math.round(yesterday.reduce((a, e) => a + e.macros.kcal, 0));
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Добавить в ${MEAL_LABEL[meal]}${entries.length ? `. Сейчас ${Math.round(sum.kcal)} ккал, белки ${Math.round(sum.protein)}, жиры ${Math.round(sum.fat)}, углеводы ${Math.round(sum.carbs)}` : ''}`}
        onPress={onAdd}
        style={({ pressed }) => [styles.mealHead, stacked() && styles.stack, pressed && { backgroundColor: colors.surface2 }]}
        testID={`meal-${meal}`}
      >
        <View style={[styles.mealName, stacked() && { flex: 0 }]}>
          <T v="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
            {MEAL_LABEL[meal]}
          </T>
          <View style={styles.roundAdd}>
            <Icon name="add" size={18} color={colors.text} />
          </View>
        </View>
        {entries.length ? <MacroCols m={{ ...sum, fiber: sumFiber(entries).g }} strong /> : null}
      </Pressable>
      {entries.map((e) => (
        <FoodRow key={e.id} entry={e} onPress={() => onEdit(e)} onDelete={() => onDelete(e)} />
      ))}
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

/** Продукт в дневнике: название, как записано («пачка, 180 г»), ккал справа; свайп влево — «Удалить» */
export function FoodRow({ entry: e, onPress, onDelete }: { entry: FoodEntry; onPress: () => void; onDelete: () => void }) {
  const amount = e.unit ? `${unitText(e.unit.qty, e.unit)}, ${fmtValue(e.grams)} г` : `${fmtValue(e.grams)} г`;
  return (
    <SwipeRow onDelete={onDelete} testID={`entry-${e.id}`}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${e.name}, ${amount}, ${Math.round(e.macros.kcal)} ккал, белки ${Math.round(e.macros.protein)}, жиры ${Math.round(e.macros.fat)}, углеводы ${Math.round(e.macros.carbs)}${e.estimate ? ', оценка' : ''}. Изменить`} style={({ pressed }) => [styles.food, stacked() && styles.stack, pressed && { backgroundColor: colors.surface2 }]}>
        <View style={stacked() ? null : { flex: 1, minWidth: 0 }}>
          <T v="callout" color={colors.text} numberOfLines={stacked() ? 3 : 2}>
            {e.name}
          </T>
          <T v="footnote" numberOfLines={1}>
            {amount}
            {e.estimate ? ' · оценка' : ''}
          </T>
        </View>
        <MacroCols m={e.macros} />
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
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52, paddingVertical: space.xs, paddingHorizontal: space.md },
  mealName: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  // Крупный шрифт: название сверху во всю ширину, колонки — справа под ним
  stack: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  cols: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  col: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  tableHead: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: 2 },
  tableTotal: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, minHeight: 40, borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  roundAdd: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  food: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52, paddingVertical: space.xs, paddingHorizontal: space.md, borderTopWidth: 0.5, borderTopColor: colors.borderStrong },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, minHeight: 36 },
});
