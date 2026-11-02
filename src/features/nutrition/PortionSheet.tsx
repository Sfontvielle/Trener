import React, { useState } from 'react';
import { View } from 'react-native';
import type { FoodEntry, FoodProduct, FoodUnit, ISODate, MealSlot } from '@/types';
import { colors, space, themed } from '@/theme';
import { Banner, Button, Chip, Icon, IconButton, Segmented, T } from '@/components/ui';
import { NumberStepper } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Dialog';
import { useNutrition, mealForHour } from '@/stores/nutrition';
import { useProfile } from '@/stores/profile';
import { allergenIn, foodAvoidance, healthOf } from '@/features/profile/health';
import { lastPortion } from '@/features/nutrition/quick';
import { gramsOf, macrosExact, unitsFor, unitText, verificationOf, VERIFICATION_LABEL } from '@/features/nutrition/schema';
import { fmtValue } from '@/utils/format';
import { haptic } from '@/services/haptics';

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
/** Именительный «в …»: «Добавить в обед», «в перекус» */
export const MEAL_TO: Record<MealSlot, string> = { breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин', snack: 'перекус' };
const MEAL_SHORT: Record<MealSlot, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
const MIN_G = 1;
const MAX_G = 5000;

export type PortionTarget =
  | { mode: 'add'; product: FoodProduct; date: ISODate; meal?: MealSlot }
  | { mode: 'edit'; product: FoodProduct; entry: FoodEntry };

/**
 * Лист порции (NUTRITION_SPEC.md §6): приём пищи, количество в граммах или единицах продукта, КБЖУ на 100 г и на
 * порцию — пересчёт на каждое изменение, без кнопки «Пересчитать». Добавление — сразу или в корзину; правка —
 * «Сохранить» и «Удалить» с «Отменить» в тосте.
 */
export function PortionSheet({ target, onClose, onDone }: { target: PortionTarget | null; onClose: () => void; onDone?: (how: 'added' | 'cart' | 'saved' | 'deleted') => void }) {
  return (
    <Sheet visible={!!target} onClose={onClose} title={target?.product.name} subtitle={target ? subtitleOf(target.product) : undefined}>
      {target ? <PortionBody key={target.mode === 'edit' ? target.entry.id : target.product.id} target={target} onClose={onClose} onDone={onDone} /> : null}
    </Sheet>
  );
}

function subtitleOf(p: FoodProduct): string {
  const status = p.source === 'local' ? 'Базовый продукт, справочные данные' : p.source === 'recipe' ? 'Мой рецепт' : VERIFICATION_LABEL[verificationOf(p)];
  const from = p.attribution && p.source !== 'local' ? ` · ${p.attribution}` : '';
  return [p.brand, `${status}${from}`].filter(Boolean).join(' · ');
}

function PortionBody({ target, onDone }: { target: PortionTarget; onClose: () => void; onDone?: (how: 'added' | 'cart' | 'saved' | 'deleted') => void }) {
  const p = target.product;
  const units = unitsFor(p);
  const lastGrams = useNutrition((s) => s.lastGrams);
  const entries = useNutrition((s) => s.entries);
  const draft = useNutrition((s) => s.draft);
  const profile = useProfile((s) => s.profile);
  const last = target.mode === 'add' ? lastPortion(p.id, lastGrams, entries, p.serving) : null;
  const [unitId, setUnitId] = useState<FoodUnit['id']>(() => (target.mode === 'edit' ? target.entry.unit?.id ?? 'g' : 'g'));
  const [qty, setQty] = useState<number>(() => (target.mode === 'edit' ? target.entry.unit?.qty ?? target.entry.grams : last?.grams ?? 100));
  const [meal, setMeal] = useState<MealSlot>(() => (target.mode === 'edit' ? target.entry.meal : target.meal ?? mealForHour(new Date().getHours())));
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const grams = gramsOf(qty, unit);
  const valid = grams >= MIN_G && grams <= MAX_G;
  const m = macrosExact(p.per100, grams);
  const inUnits = unit.id !== 'g' ? { id: unit.id, qty, label: unit.label } : undefined;

  const avoid = profile ? foodAvoidance(profile) : null;
  const allergen = avoid ? allergenIn(`${p.name} ${p.brand ?? ''}`, avoid.allergyWords) : undefined;
  const forbidden = !allergen && profile ? allergenIn(p.name, healthOf(profile).forbiddenFoods) : undefined;

  const pickUnit = (id: FoodUnit['id']) => {
    const next = units.find((u) => u.id === id)!;
    // Переход между единицами сохраняет массу: 180 г → 1 порция (180 г), 2 шт → 110 г
    const g = gramsOf(qty, unit);
    setUnitId(id);
    setQty(next.id === 'g' || next.id === 'ml' ? Math.round(g / next.grams) : Math.max(0.5, Math.round((g / next.grams) * 2) / 2));
  };
  const presets = [...new Set([last?.source === 'last' ? last.grams : undefined, p.serving?.grams, 100, 150, 200, 250].filter((x): x is number => !!x && x > 0))].slice(0, 5);
  const step = unit.id === 'g' || unit.id === 'ml' ? 10 : 0.5;

  const add = () => {
    if (target.mode !== 'add') return;
    const e = useNutrition.getState().addEntry(p, grams, meal, target.date, inUnits);
    haptic.light();
    toast(`Добавлено в ${MEAL_TO[meal]}`, 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().deleteEntries([e.id]) });
    onDone?.('added');
  };
  const toCart = () => {
    if (target.mode !== 'add') return;
    useNutrition.getState().draftAdd(target.date, meal, { product: p, grams, unit: inUnits });
    haptic.light();
    onDone?.('cart');
  };
  const save = () => {
    if (target.mode !== 'edit') return;
    const prev = useNutrition.getState().updateEntry(target.entry.id, grams, inUnits, meal);
    haptic.light();
    if (prev) toast('Порция изменена', 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().restoreEntries([prev]) });
    onDone?.('saved');
  };
  const remove = () => {
    if (target.mode !== 'edit') return;
    const gone = useNutrition.getState().deleteEntries([target.entry.id]);
    haptic.warning();
    toast(`Удалено: ${target.entry.name}`, 'trash-outline', { label: 'Отменить', onPress: () => useNutrition.getState().restoreEntries(gone) });
    onDone?.('deleted');
  };
  const cartCount = target.mode === 'add' && draft && draft.date === target.date ? draft.items.length : 0;

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Segmented items={MEALS.map((k) => ({ key: k, label: MEAL_SHORT[k] }))} value={meal} onChange={setMeal} />
        </View>
        <FavButton id={p.id} />
      </View>
      {allergen ? <Banner tone="danger" icon="warning-outline" text={`В профиле указано: «${allergen}». Проверь состав на упаковке — название может не отражать все ингредиенты.`} /> : null}
      {forbidden ? <Banner tone="warning" icon="ban-outline" text={`«${forbidden}» в списке запрещённых продуктов профиля.`} /> : null}

      <NumberStepper
        large
        testID="portion-qty"
        value={qty}
        onChange={setQty}
        step={step}
        min={unit.id === 'g' || unit.id === 'ml' ? MIN_G : 0.5}
        max={unit.id === 'g' || unit.id === 'ml' ? MAX_G : 50}
        decimals={unit.id === 'g' || unit.id === 'ml' ? 0 : 1}
        unit={unit.id === 'g' || unit.id === 'ml' ? unit.label : `${unit.label} · ${fmtValue(grams)} г`}
      />
      {units.length > 1 ? <Segmented items={units.map((u) => ({ key: u.id, label: u.id === 'serving' ? `порция ${fmtValue(u.grams)} г` : u.id === 'piece' ? `шт ${fmtValue(u.grams)} г` : u.label, a11y: u.id === 'g' ? 'граммы' : u.id === 'ml' ? 'миллилитры' : undefined }))} value={unit.id} onChange={pickUnit} /> : null}
      {unit.id === 'g' ? (
        <View style={styles.chips}>
          {presets.map((x) => {
            const isLast = last?.source === 'last' && x === last.grams;
            return (
              <View key={x} testID={isLast ? 'last-portion' : undefined}>
                <Chip label={isLast ? `Как обычно, ${x} г` : p.serving && x === p.serving.grams ? `${p.serving.label}, ${x} г` : `${x} г`} active={qty === x} onPress={() => setQty(x)} />
              </View>
            );
          })}
        </View>
      ) : null}
      {!valid ? <T v="footnote" color={colors.warning}>Порция — от {MIN_G} до {fmtValue(MAX_G)} г</T> : null}

      <View accessibilityLabel={`На порцию ${fmtValue(grams)} г: ${Math.round(m.kcal)} ккал, белки ${fmtValue(m.protein, 1)} г, жиры ${fmtValue(m.fat, 1)} г, углеводы ${fmtValue(m.carbs, 1)} г`} testID="portion-macros">
        <View style={styles.tr}>
          <T v="caption" style={{ flex: 1 }}>{' '}</T>
          <T v="caption" style={styles.col}>На 100 г</T>
          <T v="caption" style={styles.col}>{`На ${fmtValue(grams)} г`}</T>
        </View>
        <MacroLine label="Калории" a={p.per100.kcal} b={m.kcal} unit="ккал" digits={0} />
        <MacroLine label="Белки" a={p.per100.protein} b={m.protein} unit="г" dot={colors.protein} />
        <MacroLine label="Жиры" a={p.per100.fat} b={m.fat} unit="г" dot={colors.fat} />
        <MacroLine label="Углеводы" a={p.per100.carbs} b={m.carbs} unit="г" dot={colors.carbs} />
        {p.per100.fiber !== undefined ? <MacroLine label="Клетчатка" a={p.per100.fiber} b={m.fiber ?? 0} unit="г" dot={colors.fiber} /> : null}
      </View>

      {target.mode === 'add' ? (
        <View style={styles.actions}>
          <Button title={cartCount ? `В корзину · ${cartCount + 1}` : 'В корзину'} variant="secondary" size="lg" disabled={!valid} onPress={toCart} style={{ flex: 1 }} testID="portion-cart" />
          <Button title={`Добавить в ${MEAL_TO[meal]}`} size="lg" disabled={!valid} onPress={add} style={{ flex: 1.5 }} testID="portion-add" />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Button title="Сохранить" icon="checkmark" size="lg" full disabled={!valid} onPress={save} testID="portion-save" />
          <Button title="Удалить запись" variant="ghost" onPress={remove} testID="portion-delete" />
          {target.entry.unit ? <T v="footnote" style={{ textAlign: 'center' }}>Записано: {unitText(target.entry.unit.qty, target.entry.unit)}, {fmtValue(target.entry.grams)} г</T> : null}
        </View>
      )}
    </View>
  );
}

function MacroLine({ label, a, b, unit, digits = 1, dot }: { label: string; a: number; b: number; unit: string; digits?: number; dot?: string }) {
  return (
    <View style={[styles.tr, styles.trLine]}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <T v="body">{label}</T>
      </View>
      <T v="bodyStrong" style={[styles.col, { fontVariant: ['tabular-nums'] }]}>
        {fmtValue(a, digits)}
        <T v="footnote">{` ${unit}`}</T>
      </T>
      <T v="bodyStrong" style={[styles.col, { fontVariant: ['tabular-nums'] }]}>
        {fmtValue(b, digits)}
        <T v="footnote">{` ${unit}`}</T>
      </T>
    </View>
  );
}

function FavButton({ id }: { id: string }) {
  const fav = useNutrition((s) => s.favorites.includes(id));
  return (
    <IconButton
      name={fav ? 'star' : 'star-outline'}
      label={fav ? 'Убрать из избранного' : 'В избранное'}
      color={fav ? colors.carbs : colors.textDim}
      onPress={() => {
        useNutrition.getState().toggleFavorite(id);
        toast(fav ? 'Убрано из избранного' : 'В избранном', fav ? 'star-outline' : 'star');
      }}
    />
  );
}

/** Значок продукта по статусу данных — в строках поиска и дневника */
export function SourceIcon({ p }: { p: FoodProduct }) {
  const v = verificationOf(p);
  const name = p.source === 'recipe' ? 'restaurant-outline' : v === 'label' ? 'create-outline' : v === 'estimate' ? 'camera-outline' : p.source === 'local' ? 'leaf-outline' : 'globe-outline';
  return <Icon name={name} size={16} color={colors.muted} />;
}

const styles = themed({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  trLine: { borderTopWidth: 0.5, borderTopColor: colors.borderStrong, minHeight: 40 },
  col: { width: 96, textAlign: 'right' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: space.sm },
});
