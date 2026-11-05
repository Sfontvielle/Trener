import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { FoodEntry, FoodProduct, MealSlot } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, EmptyState, T } from '@/components/ui';
import { AppHeader, CoachInsight, Group, ListRow, ProposalCard, WeeklyDateStrip } from '@/components/ds';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Dialog';
import { useDayNutrition } from '@/hooks/useToday';
import { useNutrition, mealForHour, MEAL_LABEL } from '@/stores/nutrition';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useBody } from '@/stores/body';
import { useWorkouts } from '@/stores/workouts';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { applyCalorieDelta, recalibrateCalories } from '@/features/profile/applyProfile';
import { LOCAL_FOODS } from '@/data/foods';
import { addDays, daysBetween, relativeDay } from '@/utils/date';
import { fmtValue } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { explainNutrition } from '@/features/coach/decisions/macros';
import { ConfidenceLine } from '@/features/coach/DecisionView';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { useDayKey } from '@/hooks/useDayKey';
import { usualMeal, type UsualMeal } from '@/features/nutrition/quick';
import { dayProgress, remaining } from '@/features/nutrition/status';
import { suggestMeals } from '@/features/nutrition/suggest';
import { remainderHint, type RemainderOption } from '@/features/nutrition/remainder';
import { DaySummary, MacroSummary, MacroTableHead, MealSection, SaveMealSheet } from '@/features/nutrition/diary';
import { PortionSheet, type PortionTarget } from '@/features/nutrition/PortionSheet';
import { BRAND } from '@/config/brand';
import { afterModalClose } from '@/components/modalGate';

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Дневник питания (NUTRITION_SPEC.md §1, макет 02-nutrition): неделя дней, «осталось / съедено / цель»,
 * Б/Ж/У и клетчатка шкалами, приёмы пищи одной группой. Любое действие обратимо: удаление и копирование —
 * тост «Отменить», правка порции — тоже.
 */
export default function Nutrition() {
  // «Сегодня» само переключается после полуночи; выбранный день — смещение от него (не в будущее)
  const dayKey = useDayKey();
  const [offset, setOffset] = useState(0);
  const date = addDays(dayKey, offset);
  const setDate = (d: string) => setOffset(Math.min(0, daysBetween(dayKey, d)));
  const nut = useDayNutrition(date);
  const profile = useProfile((s) => s.profile);
  const products = useNutrition((s) => s.products);
  const allEntries = useNutrition((s) => s.entries);
  const adjustments = usePlan((s) => s.adjustments);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const sessions = useWorkouts((s) => s.sessions);
  const [edit, setEdit] = useState<PortionTarget | null>(null);
  const [saveMeal, setSaveMeal] = useState<{ slot: MealSlot; entries: FoodEntry[] } | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const isToday = offset === 0;
  const daysWithEntries = useMemo(() => new Set(allEntries.map((e) => e.date)), [allEntries]);
  const usual = useMemo(() => Object.fromEntries(MEALS.map((m) => [m, usualMeal(allEntries, products, date, m)])) as Record<MealSlot, UsualMeal | null>, [allEntries, products, date]);
  const prevDay = useMemo(() => allEntries.filter((e) => e.date === addDays(date, -1)), [allEntries, date]);
  const target = nut.target;
  const review = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries: allEntries, adjustments, targetKcal: target.kcal, metrics, sessions }) : null), [profile, target, weights, allEntries, adjustments, metrics, sessions]);
  const explain = useMemo(() => (profile && target ? explainNutrition(profile, target, latestTrendWeight(weights) ?? profile.weightKg, review?.maintenance ?? null) : null), [profile, target, weights, review]);
  const recent = useNutrition((s) => s.recent);
  const [reviewKept, setReviewKept] = useState(false);
  // Подсказка тренера по остатку дня — только сегодня и только когда есть что сказать. Сам остаток — сразу;
  // вариант еды — перебор продуктов (~30 мс в Node, на iPhone дольше кадра), поэтому после отрисовки и с кешем по остатку
  const hintBase = useMemo(() => (isToday && target && nut.entries.length ? remainderHint({ target, eaten: nut.eaten, entries: nut.entries.length, progress: dayProgress() }) : null), [isToday, target, nut.entries, nut.eaten]);
  const optKey = hintBase?.tone === 'info' && target ? `${Math.round(target.protein - nut.eaten.protein)}:${Math.round(target.kcal - nut.eaten.kcal)}:${new Date().getHours()}` : null;
  const [hintOpt, setHintOpt] = useState<{ key: string; option: RemainderOption | null } | null>(null);
  useEffect(() => {
    if (!optKey || !profile || !target || hintOpt?.key === optKey) return;
    // В свободное время JS-потока, после отрисовки дневника (InteractionManager в RN 0.88 больше нет)
    const task = requestIdleCallback(() => {
      const rem = remaining(target, nut.eaten);
      const recentProducts = recent.map((id) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id)).filter((p): p is FoodProduct => !!p);
      const o = suggestMeals({ remaining: rem, profile, todayEntries: nut.entries, recentProducts }).options[0];
      setHintOpt({ key: optKey, option: o ? { items: o.items.map((x) => ({ name: x.product.name, grams: x.grams })), kcal: o.total.kcal, protein: o.total.protein } : null });
    });
    return () => cancelIdleCallback(task);
  }, [optKey, hintOpt?.key, profile, target, nut.eaten, nut.entries, recent, products]);
  const hint = hintBase && target && hintOpt && hintOpt.key === optKey ? remainderHint({ target, eaten: nut.eaten, entries: nut.entries.length, progress: dayProgress(), option: hintOpt.option }) : hintBase;

  const openAdd = (meal?: MealSlot) => {
    haptic.tap();
    router.push({ pathname: '/food/add', params: { date, meal: meal ?? (isToday ? mealForHour(new Date().getHours()) : 'snack') } });
  };
  const addUsual = (u: UsualMeal) => {
    const st = useNutrition.getState();
    const ids = u.items.map((it) => st.addEntry(it.product, it.grams, u.slot, date).id);
    haptic.success();
    toast(`${MEAL_LABEL[u.slot]}: обычный добавлен`, 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().deleteEntries(ids) });
  };
  const copyFrom = (from: string, meal?: MealSlot) => {
    const ids = useNutrition.getState().copyEntries(from, date, meal);
    haptic.success();
    toast(meal ? `${MEAL_LABEL[meal]} скопирован` : `Скопировано продуктов: ${ids.length}`, 'copy-outline', { label: 'Отменить', onPress: () => useNutrition.getState().deleteEntries(ids) });
  };
  const remove = (e: FoodEntry) => {
    const gone = useNutrition.getState().deleteEntries([e.id]);
    toast(`Удалено: ${e.name}`, 'trash-outline', { label: 'Отменить', onPress: () => useNutrition.getState().restoreEntries(gone) });
  };
  const editEntry = (e: FoodEntry) => {
    // Продукт из кэша; если его там нет (старые данные) — снимок записи как продукт: КБЖУ на 100 г из записи
    const p: FoodProduct = products[e.productId] ?? LOCAL_FOODS.find((f) => f.id === e.productId) ?? snapshotProduct(e);
    setEdit({ mode: 'edit', product: p, entry: e });
  };

  if (!profile || !target)
    return (
      <Screen tabBar>
        <AppHeader title="Питание" />
        <EmptyState icon="nutrition-outline" title="Нет цели по питанию" text={`Заполни профиль — ${BRAND} рассчитает КБЖУ.`} action="Открыть профиль" onAction={() => router.push('/profile')} />
      </Screen>
    );

  const prevKcal = Math.round(prevDay.reduce((a, e) => a + e.macros.kcal, 0));
  return (
    <Screen tabBar>
      <AppHeader
        title="Питание"
        actions={[
          { icon: 'add', label: 'Добавить еду', onPress: () => openAdd(), testID: 'nutrition-add' },
          { icon: 'ellipsis-horizontal', label: 'Ещё', onPress: () => setMoreOpen(true), testID: 'nutrition-more' },
        ]}
      />
      <WeeklyDateStrip selected={date} today={dayKey} onSelect={setDate} marked={(d) => daysWithEntries.has(d)} />

      <View style={{ marginTop: space.lg }}>
        <DaySummary eaten={nut.eaten} target={target} onWhy={() => setWhyOpen(true)} />
        <MacroSummary entries={nut.entries} eaten={nut.eaten} target={target} />
      </View>

      {!nut.entries.length && prevDay.length ? (
        <Pressable accessibilityRole="button" onPress={() => copyFrom(addDays(date, -1))} hitSlop={6} style={({ pressed }) => [styles.copyDay, pressed && { opacity: 0.6 }]} testID="copy-yesterday">
          <T v="callout" color={colors.text} style={{ fontWeight: '600' }}>
            Скопировать весь {isToday ? 'вчерашний' : 'предыдущий'} день · {fmtValue(prevKcal)} ккал
          </T>
        </Pressable>
      ) : null}

      {/* Приёмы пищи — карточками (R2); над ними подпись колонок Б · Ж · У · Кл */}
      <View style={{ gap: space.md, marginTop: space.lg }}>
        <MacroTableHead />
        {MEALS.map((m) => (
          <MealSection
            key={m}
            meal={m}
            entries={nut.entries.filter((e) => e.meal === m)}
            usual={usual[m]}
            yesterday={prevDay.filter((e) => e.meal === m)}
            onAdd={() => openAdd(m)}
            onEdit={editEntry}
            onDelete={remove}
            onUsual={addUsual}
            onRepeat={() => copyFrom(addDays(date, -1), m)}
          />
        ))}
      </View>

      {hint ? (
        <CoachInsight
          source={BRAND}
          title={hint.title}
          text={hint.text}
          tone={hint.tone === 'warning' ? 'warning' : 'info'}
          action={{ label: 'Спросить тренера', onPress: () => router.push({ pathname: '/coach', params: { q: 'Что мне поесть сейчас?' } }) }}
          style={{ marginTop: space.md }}
          testID="nutrition-hint"
        />
      ) : null}


      {review && isToday && review.status === 'adjust' && !reviewKept ? (
        // Итог алгоритма одной фразой и решение — только если правило предлагает изменение
        <ProposalCard
          title={review.summary}
          why={review.maintenance?.text}
          applyLabel={`Применить ${review.deltaKcal > 0 ? '+' : ''}${review.deltaKcal} ккал`}
          onKeep={() => setReviewKept(true)}
          onApply={() => {
            applyCalorieDelta(review.deltaKcal, review.summary, 'adaptive');
            toast('Калорийность обновлена');
          }}
          style={{ marginTop: space.md }}
          testID="calorie-review"
        />
      ) : null}

      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="Питание" subtitle={isToday ? 'Сегодня' : relativeDay(date)}>
        <Group>
          {prevDay.length ? <ListRow icon="copy-outline" title={`Скопировать ${isToday ? 'вчерашний' : 'предыдущий'} день`} value={`${fmtValue(prevKcal)} ккал`} onPress={() => { setMoreOpen(false); copyFrom(addDays(date, -1)); }} chevron={false} testID="more-copy-day" /> : null}
          {MEALS.filter((m) => nut.entries.filter((e) => e.meal === m).length >= 2).map((m) => (
            <ListRow key={m} icon="bookmark-outline" title={`Сохранить ${MEAL_LABEL[m].toLowerCase()} как блюдо`} onPress={() => { setMoreOpen(false); afterModalClose(() => setSaveMeal({ slot: m, entries: nut.entries.filter((e) => e.meal === m) })); }} chevron={false} />
          ))}
          <ListRow icon="help-circle-outline" title="Почему такие КБЖУ?" onPress={() => { setMoreOpen(false); afterModalClose(() => setWhyOpen(true)); }} />
          <ListRow icon="calculator-outline" title="Подробный расчёт" onPress={() => { setMoreOpen(false); afterModalClose(() => router.push('/plan')); }} />
          {review && review.maintenance && Math.abs(review.maintenance.kcal - target.tdee) >= 150 && (target.adjustmentKcal ?? 0) === 0 ? (
            <ListRow icon="trending-up-outline" title="Перейти на мой расход" value={`~${fmtValue(review.maintenance.kcal)} ккал`} chevron={false} onPress={() => { setMoreOpen(false); const r = recalibrateCalories(); toast(r.message, r.ok ? 'checkmark-circle' : 'alert-circle'); }} />
          ) : null}
        </Group>
      </Sheet>

      <Sheet visible={whyOpen} onClose={() => setWhyOpen(false)} title="Почему такие КБЖУ?" subtitle={target.source === 'adaptive' ? 'По вашему фактическому расходу' : 'Стартовая оценка — дальше подстроится под вас'}>
        {explain ? (
          <View style={{ gap: space.sm }} testID="macro-why">
            {explain.rows.map((r) => (
              <View key={r.label} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <T v="bodyStrong" style={{ flex: 1 }}>
                    {r.label}
                  </T>
                  <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                    {r.value}
                  </T>
                </View>
                <T v="callout">{r.why}</T>
              </View>
            ))}
            <View style={{ gap: 2 }}>
              {explain.data.map((x) => (
                <T key={x} v="footnote">
                  {x}
                </T>
              ))}
            </View>
            <ConfidenceLine level={explain.confidence.level} note={explain.confidence.note} />
            {review && review.status !== 'insufficient_data' ? (
              <View style={{ gap: 4, marginTop: 4 }} testID="calorie-review-why">
                <T v="body">{review.summary}</T>
                {review.maintenance ? <T v="footnote">{review.maintenance.text}</T> : null}
              </View>
            ) : null}
            <Button title="Подробный расчёт" variant="ghost" size="sm" onPress={() => { setWhyOpen(false); afterModalClose(() => router.push('/plan')); }} />
          </View>
        ) : null}
      </Sheet>
      <SaveMealSheet value={saveMeal} onClose={() => setSaveMeal(null)} />
      <PortionSheet target={edit} onClose={() => setEdit(null)} onDone={() => setEdit(null)} />
    </Screen>
  );
}

/** Продукт из снимка записи — если исходного продукта уже нет в кэше (старые данные) */
function snapshotProduct(e: FoodEntry): FoodProduct {
  const k = e.grams > 0 ? 100 / e.grams : 0;
  const per100 = { kcal: e.macros.kcal * k, protein: e.macros.protein * k, fat: e.macros.fat * k, carbs: e.macros.carbs * k, ...(e.macros.fiber !== undefined ? { fiber: e.macros.fiber * k } : null) };
  return { id: e.productId, name: e.name, per100, source: e.productId.startsWith('custom:') ? 'custom' : e.productId.startsWith('local:') ? 'local' : 'openfoodfacts' };
}

const styles = themed({
  copyDay: { alignSelf: 'flex-start', paddingVertical: space.sm, marginTop: space.sm },
  group: { marginTop: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
});
