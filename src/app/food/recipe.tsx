import React, { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { FoodProduct, Recipe } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Banner, Button, Icon, IconButton, T } from '@/components/ui';
import { AppHeader, Group, ListRow, SectionHeader, StatRow } from '@/components/ds';
import { Field, NumberField, NumberStepper, INPUT_MAX_SCALE } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { useNutrition } from '@/stores/nutrition';
import { useFoodSearch } from '@/features/nutrition/useFoodSearch';
import { lastPortion } from '@/features/nutrition/quick';
import { buildRecipe, macrosExact, recipeYield } from '@/features/nutrition/schema';
import { fmtValue } from '@/utils/format';
import { haptic } from '@/services/haptics';

type Ing = { product: FoodProduct; grams: number };

/**
 * Рецепт (NUTRITION_SPEC.md §9): ингредиенты, вес сырых и готового блюда, выход в порциях. КБЖУ считаются на 100 г
 * ГОТОВОГО блюда — уварка и впитанная вода учитываются. В дневник рецепт добавляется в граммах или порциях.
 * Изменение рецепта не меняет прошлые записи: в них снимок КБЖУ.
 */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useNutrition((s) => (id ? s.recipes.find((r) => r.id === id) : undefined));
  const products = useNutrition((s) => s.products);
  const [name, setName] = useState(existing?.name ?? '');
  const [items, setItems] = useState<Ing[]>(() =>
    (existing?.ingredients ?? []).map((i) => ({ product: products[i.productId] ?? snapshot(i), grams: i.grams })),
  );
  const [cooked, setCooked] = useState<number | undefined>(existing?.cookedWeightG);
  const [servings, setServings] = useState(existing?.servings ?? 2);
  const [picker, setPicker] = useState(false);
  const ingredients: Recipe['ingredients'] = items.map((i) => ({ productId: i.product.id, name: i.product.name, grams: i.grams, macros: macrosExact(i.product.per100, i.grams) }));
  // Пересчёт на каждое изменение граммов, веса готового и порций — без кнопки «Пересчитать»
  const preview = buildRecipe({ id: 'preview', name, ingredients, cookedWeightG: cooked, servings, now: 0 });
  const { totalG, servingG } = recipeYield(preview);
  const perServing = macrosExact(preview.per100, servingG);
  const cookedBad = cooked !== undefined && (cooked < preview.rawWeightG * 0.2 || cooked > preview.rawWeightG * 5);
  const valid = name.trim().length > 1 && items.length > 0 && items.every((i) => i.grams > 0) && !cookedBad;

  const save = () => {
    const r = useNutrition.getState().saveRecipe({ id: existing?.id, name, ingredients, cookedWeightG: cooked, servings });
    haptic.success();
    toast(existing ? 'Рецепт обновлён · прошлые записи остались как были' : `«${r.name}» в «Моих»`, 'checkmark-circle');
    router.back();
  };

  return (
    <Screen keyboard>
      <AppHeader title={existing ? 'Рецепт' : 'Новый рецепт'} back />
      <Field label="Название" value={name} onChangeText={setName} placeholder="Например: Гречка с курицей" maxLength={60} testID="recipe-name" />

      <SectionHeader title="Ингредиенты" action="Добавить" actionLabel="Добавить ингредиент" onAction={() => setPicker(true)} />
      {items.length ? (
        <Group>
          {items.map((it, i) => (
            <View key={it.product.id} style={styles.ing}>
              <View style={styles.ingTop}>
                <T v="body" style={{ flex: 1 }}>
                  {it.product.name}
                </T>
                <IconButton name="close" label={`Убрать «${it.product.name}»`} size={18} bg="transparent" color={colors.muted} onPress={() => setItems(items.filter((_, k) => k !== i))} style={{ marginTop: -10, marginRight: -6 }} />
              </View>
              <View style={styles.ingBottom}>
                <T v="footnote" style={{ flex: 1 }}>
                  {Math.round(macrosExact(it.product.per100, it.grams).kcal)} ккал
                </T>
                <NumberStepper compact value={it.grams} onChange={(g) => setItems(items.map((x, k) => (k === i ? { ...x, grams: g } : x)))} step={10} min={1} max={5000} unit="г" style={{ width: 168 }} testID={`recipe-ing-${i}`} />
              </View>
            </View>
          ))}
        </Group>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setPicker(true)} style={styles.emptyIng}>
          <Icon name="add-circle-outline" size={22} color={colors.textDim} />
          <T v="callout">Добавь продукты — из базовых, своих или найденных</T>
        </Pressable>
      )}

      <SectionHeader title="Выход" />
      <View style={{ gap: space.sm }}>
        <NumberField label="Вес готового блюда" unit="г" value={cooked} onChange={setCooked} placeholder={items.length ? fmtValue(preview.rawWeightG) : '—'} testID="recipe-cooked" />
        <T v="footnote">Взвесь кастрюлю с блюдом и без него. Не взвешивал — считаем по весу сырых продуктов{items.length ? ` (${fmtValue(preview.rawWeightG)} г)` : ''}.</T>
        {cookedBad ? <Banner tone="warning" text="Вес готового блюда сильно отличается от сырых продуктов — проверь число." /> : null}
        <NumberStepper inline label="Порций" value={servings} onChange={(v) => setServings(Math.max(1, Math.round(v)))} step={1} min={1} max={50} testID="recipe-servings" />
      </View>

      {items.length ? (
        <>
          <SectionHeader title="КБЖУ" />
          <Group testID="recipe-summary">
            <StatRow label="На 100 г готового" value={Math.round(preview.per100.kcal)} unit="ккал" />
            <StatRow label={`Порция · ${fmtValue(servingG)} г`} value={Math.round(perServing.kcal)} unit="ккал" />
            <StatRow label="Белки в порции" value={fmtValue(perServing.protein, 1)} unit="г" dot={colors.protein} />
            <StatRow label="Жиры в порции" value={fmtValue(perServing.fat, 1)} unit="г" dot={colors.fat} />
            <StatRow label="Углеводы в порции" value={fmtValue(perServing.carbs, 1)} unit="г" dot={colors.carbs} />
            <StatRow label="Всё блюдо" value={fmtValue(totalG)} unit="г" />
          </Group>
        </>
      ) : null}

      {existing ? <T v="footnote" style={{ marginTop: space.md }}>Прошлые записи в дневнике останутся как были — изменятся только новые.</T> : null}
      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button title={existing ? 'Сохранить рецепт' : 'Создать рецепт'} icon="checkmark" size="lg" full disabled={!valid} onPress={save} testID="recipe-save" />
        {existing ? (
          <Button
            title="Удалить рецепт"
            variant="ghost"
            onPress={() =>
              confirm('Удалить рецепт?', 'Записи в дневнике останутся.', 'Удалить', () => {
                useNutrition.getState().removeRecipe(existing.id);
                router.back();
              }, true)
            }
          />
        ) : null}
      </View>

      <IngredientPicker
        visible={picker}
        onClose={() => setPicker(false)}
        exclude={items.map((i) => i.product.id)}
        onPick={(p, g) => {
          setItems((xs) => [...xs, { product: p, grams: g }]);
          haptic.light();
        }}
      />
    </Screen>
  );
}

function snapshot(i: Recipe['ingredients'][number]): FoodProduct {
  const k = i.grams > 0 ? 100 / i.grams : 0;
  return { id: i.productId, name: i.name, per100: { kcal: i.macros.kcal * k, protein: i.macros.protein * k, fat: i.macros.fat * k, carbs: i.macros.carbs * k, ...(i.macros.fiber !== undefined ? { fiber: i.macros.fiber * k } : null) }, source: 'custom' };
}

/** Выбор ингредиента: тот же поиск, что при добавлении еды; масса по умолчанию — привычная порция */
function IngredientPicker({ visible, onClose, onPick, exclude }: { visible: boolean; onClose: () => void; onPick: (p: FoodProduct, grams: number) => void; exclude: string[] }) {
  const [q, setQ] = useState('');
  const search = useFoodSearch(q);
  const recent = useNutrition((s) => s.recent);
  const products = useNutrition((s) => s.products);
  const lastGrams = useNutrition((s) => s.lastGrams);
  const entries = useNutrition((s) => s.entries);
  const list = q.trim().length >= 2 ? search.items.map((r) => r.product) : recent.map((id) => products[id]).filter((p): p is FoodProduct => !!p && p.source !== 'recipe');
  return (
    <Sheet visible={visible} onClose={onClose} title="Ингредиент" scroll={false} maxHeightPct={0.85}>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput maxFontSizeMultiplier={INPUT_MAX_SCALE} value={q} onChangeText={setQ} placeholder="Продукт" placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel="Поиск ингредиента" testID="ingredient-search" />
      </View>
      <FlatList
        style={{ marginTop: space.sm, maxHeight: 420 }}
        data={list.filter((p) => !exclude.includes(p.id)).slice(0, 40)}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: p }) => (
          <ListRow
            title={p.name}
            subtitle={p.brand}
            value={`${Math.round(p.per100.kcal)} ккал/100 г`}
            chevron={false}
            onPress={() => {
              onPick(p, lastPortion(p.id, lastGrams, entries, p.serving).grams);
              setQ('');
              onClose();
            }}
          />
        )}
        ListEmptyComponent={<T v="callout" style={{ textAlign: 'center', marginTop: space.lg }}>{q.trim().length >= 2 ? (search.done ? 'Ничего не нашлось' : 'Ищу…') : 'Начни вводить название'}</T>}
      />
    </Sheet>
  );
}

const styles = themed({
  ing: { gap: space.xxs, paddingVertical: space.sm, paddingHorizontal: space.md },
  ingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  ingBottom: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  emptyIng: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.xs, height: 48, borderRadius: radius.md, backgroundColor: colors.surface2, paddingHorizontal: space.sm },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, height: '100%', outlineWidth: 0 },
});
