import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { FoodEntry, FoodProduct, MealSlot } from '@/types';
import { colors, radius, space } from '@/theme';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, EmptyState, Icon, IconButton, SectionTitle, T } from '@/components/ui';
import { Bar, Ring } from '@/components/charts';
import { Sheet } from '@/components/Sheet';
import { NumberStepper } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useDayNutrition } from '@/hooks/useToday';
import { useNutrition, mealForHour, MEAL_LABEL } from '@/stores/nutrition';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useBody } from '@/stores/body';
import { GOAL_SHORT } from '@/features/nutrition/targets';
import { dayProgress, macroState, macrosFor, type MacroState } from '@/features/nutrition/status';
import { stateColor } from '@/components/macroColor';
import { suggestMeals, type MealSuggestion } from '@/features/nutrition/suggest';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { applyCalorieDelta } from '@/features/profile/applyProfile';
import { LOCAL_FOODS } from '@/data/foods';
import { addDays, daysBetween, relativeDay, today } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { useDayKey } from '@/hooks/useDayKey';
import { frequentProducts, sameMealYesterday } from '@/features/nutrition/quick';

/** Остаток макроса: «45 г» или «+12» при переборе */
const remainTxt = (v: number) => (v >= 0 ? `${Math.round(v)} г` : `+${Math.round(-v)}`);

export default function Nutrition() {
  // Дата считается от «сегодня», которое само переключается после полуночи
  const dayKey = useDayKey();
  const [offset, setOffset] = useState(0);
  const date = addDays(dayKey, offset);
  const setDate = (d: string) => setOffset(Math.min(0, daysBetween(dayKey, d)));
  const lastGrams = useNutrition((s) => s.lastGrams);
  const nut = useDayNutrition(date);
  const profile = useProfile((s) => s.profile);
  const products = useNutrition((s) => s.products);
  const recent = useNutrition((s) => s.recent);
  const allEntries = useNutrition((s) => s.entries);
  const adjustments = usePlan((s) => s.adjustments);
  const weights = useBody((s) => s.weights);
  const [edit, setEdit] = useState<FoodEntry | null>(null);
  const isToday = offset === 0;
  const nowMeal = mealForHour(new Date().getHours());
  const repeat = useMemo(() => (isToday ? sameMealYesterday(allEntries, date, nowMeal) : []), [isToday, allEntries, date, nowMeal]);
  const frequent = useMemo(() => frequentProducts(allEntries, products, lastGrams, date), [allEntries, products, lastGrams, date]);
  const target = nut.target;
  const dp = isToday ? dayProgress() : 1;

  const suggestions = useMemo(() => {
    if (!profile || !nut.remaining || !isToday) return null;
    const recentProducts = recent.map((id) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id)).filter((p): p is FoodProduct => !!p).slice(0, 25);
    return suggestMeals({ remaining: nut.remaining, profile, todayEntries: nut.entries, recentProducts });
  }, [profile, nut.remaining, nut.entries, recent, products, isToday]);

  const review = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries: allEntries, adjustments, targetKcal: target.kcal }) : null), [profile, target, weights, allEntries, adjustments]);

  if (!profile || !target) return <Screen tabBar><EmptyState icon="nutrition-outline" title="Нет плана питания" text="Заполни профиль — FORM рассчитает КБЖУ." /></Screen>;

  const kState = macroState('kcal', nut.eaten.kcal, target.kcal, dp);
  const left = Math.round(target.kcal - nut.eaten.kcal);
  const meals: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

  const addSuggestion = (o: MealSuggestion) => {
    const add = useNutrition.getState().addEntry;
    const meal = mealForHour(new Date().getHours());
    o.items.forEach((it) => add(it.product, it.grams, meal, today()));
    haptic.success();
    toast(`Добавлено: ~${Math.round(o.total.kcal)} ккал`);
  };

  return (
    <Screen tabBar>
      <View style={styles.head}>
        <T v="h1" style={{ flex: 1 }}>
          Питание
        </T>
        <IconButton name="chevron-back" label="Предыдущий день" onPress={() => setDate(addDays(date, -1))} />
        <T v="body" style={{ fontWeight: '700', minWidth: 76, textAlign: 'center' }}>
          {relativeDay(date)}
        </T>
        <IconButton name="chevron-forward" label="Следующий день" onPress={() => setDate(addDays(date, 1))} disabled={isToday} />
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Ring size={112} stroke={10} progress={nut.eaten.kcal / target.kcal} color={stateColor(kState)}>
            <T v="num" style={{ fontSize: 24 }}>
              {fmtNum(nut.eaten.kcal)}
            </T>
            <T v="small" style={{ fontSize: 12 }}>
              из {fmtNum(target.kcal)}
            </T>
          </Ring>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="caption">{isToday ? 'Осталось сегодня' : 'Осталось'} · {GOAL_SHORT[profile.goal]}</T>
            <T v="h1" color={left < 0 ? stateColor(kState) : colors.text}>
              {left >= 0 ? `${fmtNum(left)} ккал` : `+${fmtNum(-left)} ккал`}
            </T>
            <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
              {left < 0 ? 'сверх цели · ' : ''}Б {remainTxt(target.protein - nut.eaten.protein)} · Ж {remainTxt(target.fat - nut.eaten.fat)} · У {remainTxt(target.carbs - nut.eaten.carbs)}
            </T>
          </View>
        </View>
        <View style={{ gap: 12, marginTop: space.lg }}>
          <MacroRow label="Белки" eaten={nut.eaten.protein} target={target.protein} state={macroState('protein', nut.eaten.protein, target.protein, dp)} base={colors.protein} />
          <MacroRow label="Жиры" eaten={nut.eaten.fat} target={target.fat} state={macroState('fat', nut.eaten.fat, target.fat, dp)} base={colors.fat} />
          <MacroRow label="Углеводы" eaten={nut.eaten.carbs} target={target.carbs} state={macroState('carbs', nut.eaten.carbs, target.carbs, dp)} base={colors.carbs} />
        </View>
        <View style={styles.legend}>
          <Legend c={colors.accent} t="в цели" />
          <Legend c={colors.warning} t="внимание" />
          <Legend c={colors.danger} t="сильно мимо" />
        </View>
      </Card>

      {review && review.status === 'adjust' && isToday ? (
        <Card tone="warning" style={{ marginTop: space.md, gap: 8 }}>
          <T v="h3">{review.headline}</T>
          <T v="small">{review.detail}</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={`Применить ${review.deltaKcal > 0 ? '+' : ''}${review.deltaKcal} ккал`} size="sm" onPress={() => { applyCalorieDelta(review.deltaKcal, review.headline, 'adaptive'); toast('Калорийность обновлена'); }} style={{ flex: 1 }} />
            <Button title="Спросить тренера" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/coach', params: { q: 'Стоит ли менять калорийность по тренду веса?' } })} />
          </View>
        </Card>
      ) : null}

      {isToday && suggestions ? (
        <>
          <SectionTitle title="Что добрать" action="Спросить тренера" onAction={() => router.push({ pathname: '/coach', params: { q: 'Что мне поесть сейчас, чтобы закрыть норму?' } })} />
          <View style={{ gap: 10 }}>
            {suggestions.notes.map((n) => (
              <Banner key={n} tone={n.includes('превыш') ? 'warning' : 'info'} text={n} />
            ))}
            {suggestions.options.map((o) => (
              <Card key={o.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T v="caption">{o.title}</T>
                  <T v="small" style={{ fontSize: 12 }}>
                    {o.why}
                  </T>
                </View>
                {o.items.map((it) => (
                  <View key={it.product.id} style={{ flexDirection: 'row' }}>
                    <T v="body" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>
                      {it.product.name}
                    </T>
                    <T v="body" style={{ fontWeight: '800', fontSize: 15 }}>
                      {it.grams} г
                    </T>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T v="small" style={{ flex: 1 }}>
                    ~{Math.round(o.total.kcal)} ккал · Б {Math.round(o.total.protein)} · Ж {Math.round(o.total.fat)} · У {Math.round(o.total.carbs)}
                  </T>
                  <Button title="Добавить" size="sm" icon="add" variant="secondary" onPress={() => addSuggestion(o)} />
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {isToday && (repeat.length || frequent.length) ? (
        <>
          <SectionTitle title="Быстро добавить" />
          {repeat.length ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, paddingVertical: 12 }}>
              <Icon name="repeat" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontWeight: '700', fontSize: 15 }}>
                  {MEAL_LABEL[nowMeal]} как вчера
                </T>
                <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
                  {repeat.map((e) => e.name).join(', ')} · {fmtNum(repeat.reduce((a, e) => a + e.macros.kcal, 0))} ккал
                </T>
              </View>
              <Button
                title="Повторить"
                size="sm"
                variant="secondary"
                onPress={() => {
                  const st = useNutrition.getState();
                  repeat.forEach((e) => {
                    const p = st.products[e.productId] ?? LOCAL_FOODS.find((f) => f.id === e.productId);
                    if (p) st.addEntry(p, e.grams, nowMeal, date);
                  });
                  haptic.success();
                  toast(`${MEAL_LABEL[nowMeal]} добавлен`);
                }}
              />
            </Card>
          ) : null}
          {frequent.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {frequent.map((f) => (
                <Pressable
                  key={f.product.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Добавить ${f.product.name} ${f.grams} грамм`}
                  onPress={() => {
                    useNutrition.getState().addEntry(f.product, f.grams, nowMeal, date);
                    haptic.light();
                    toast(`${f.product.name} — ${f.grams} г (изменить — тап по записи)`);
                  }}
                  style={styles.quick}
                >
                  <T v="small" color={colors.text} numberOfLines={1} style={{ fontWeight: '700', maxWidth: 150 }}>
                    {f.product.name}
                  </T>
                  <T v="small" style={{ fontSize: 11 }}>
                    + {f.grams} г · {Math.round((f.product.per100.kcal * f.grams) / 100)} ккал
                  </T>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}

      <SectionTitle title="Приёмы пищи" />
      {nut.entries.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6 }}>
          <T v="body">{isToday ? 'Сегодня ещё ничего не записано' : 'За этот день нет записей'}</T>
          <T v="small" style={{ textAlign: 'center' }}>
            Ищи по названию или сканируй штрихкод — КБЖУ из базы продуктов.
          </T>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {meals.map((m) => {
            const list = nut.entries.filter((e) => e.meal === m);
            if (!list.length) return null;
            const kcal = list.reduce((a, e) => a + e.macros.kcal, 0);
            return (
              <Card key={m} style={{ paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <T v="caption">{MEAL_LABEL[m]}</T>
                  <T v="small">{fmtNum(kcal)} ккал</T>
                </View>
                {list.map((e) => (
                  <Pressable key={e.id} onPress={() => setEdit(e)} style={styles.entry} accessibilityRole="button" accessibilityLabel={`${e.name}, изменить`}>
                    <View style={{ flex: 1 }}>
                      <T v="body" numberOfLines={2} style={{ fontSize: 15 }}>
                        {e.name}
                      </T>
                      <T v="small" style={{ fontSize: 12 }}>
                        {e.grams} г · Б {Math.round(e.macros.protein)} Ж {Math.round(e.macros.fat)} У {Math.round(e.macros.carbs)}
                      </T>
                    </View>
                    <T v="body" style={{ fontWeight: '800', fontSize: 15 }}>
                      {fmtNum(e.macros.kcal)}
                    </T>
                  </Pressable>
                ))}
              </Card>
            );
          })}
        </View>
      )}
      <Button title="Добавить еду" icon="add" size="lg" style={{ marginTop: space.lg }} onPress={() => router.push({ pathname: '/food/add', params: { date } })} />

      <EditEntrySheet key={edit?.id ?? 'none'} entry={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
      <T v="small" style={{ fontSize: 11 }}>
        {t}
      </T>
    </View>
  );
}

function MacroRow({ label, eaten, target, state, base }: { label: string; eaten: number; target: number; state: MacroState; base: string }) {
  const c = state === 'progress' ? base : stateColor(state);
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="body" style={{ fontSize: 14, fontWeight: '700' }}>
          {label}
        </T>
        <T v="body" style={{ fontSize: 14, fontVariant: ['tabular-nums'] }} color={state === 'attention' || state === 'off' ? c : colors.text}>
          {Math.round(eaten)} / {Math.round(target)} г
        </T>
      </View>
      <Bar progress={target ? eaten / target : 0} color={c} height={7} />
    </View>
  );
}

function EditEntrySheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const [g, setG] = useState(entry?.grams ?? 100);
  const products = useNutrition((s) => s.products);
  const p = entry ? products[entry.productId] ?? LOCAL_FOODS.find((f) => f.id === entry.productId) : undefined;
  const m = entry ? (p ? macrosFor(p.per100, g) : { kcal: Math.round((entry.macros.kcal * g) / entry.grams), protein: 0, fat: 0, carbs: 0 }) : null;
  return (
    <Sheet visible={!!entry} onClose={onClose} title={entry?.name} subtitle="Изменить порцию">
      {entry && m ? (
        <View style={{ gap: space.md }}>
          <NumberStepper value={g} onChange={setG} step={10} min={1} max={3000} unit="г" />
          <T v="small">
            {m.kcal} ккал · Б {Math.round(m.protein)} · Ж {Math.round(m.fat)} · У {Math.round(m.carbs)}
          </T>
          <Button title="Сохранить" icon="checkmark" onPress={() => { useNutrition.getState().updateEntry(entry.id, g); onClose(); }} />
          <Button
            title="Удалить запись"
            variant="danger"
            onPress={() => {
              const id = entry.id;
              onClose();
              confirm('Удалить запись?', entry.name, 'Удалить', () => useNutrition.getState().removeEntry(id), true);
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space.md },
  legend: { flexDirection: 'row', gap: 14, marginTop: space.md },
  quick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, minHeight: 48, borderRadius: radius.sm },
});
