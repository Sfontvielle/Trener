import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { FoodEntry, MealSlot } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Ring } from '@/components/charts';
import { Ambient, Appear, Progress, Tap, useCountUp } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { Field, NumberStepper } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useDayNutrition } from '@/hooks/useToday';
import { useNutrition, mealForHour, MEAL_LABEL, waterTarget } from '@/stores/nutrition';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useBody } from '@/stores/body';
import { useWorkouts } from '@/stores/workouts';
import { fiberTarget } from '@/features/nutrition/targets';
import { dayProgress, macroState, macrosFor, sumFiber, sumMacros, type MacroState } from '@/features/nutrition/status';
import { stateColor } from '@/components/macroColor';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { applyCalorieDelta, recalibrateCalories } from '@/features/profile/applyProfile';
import { LOCAL_FOODS } from '@/data/foods';
import { addDays, daysBetween, relativeDay } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { AddFoodSheet } from '@/features/nutrition/AddFoodSheet';
import { WaterSheet } from '@/features/nutrition/WaterSheet';
import { explainNutrition } from '@/features/coach/decisions/macros';
import { ConfidenceLine } from '@/features/coach/DecisionView';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { useDayKey } from '@/hooks/useDayKey';
import { usualMeal, type UsualMeal } from '@/features/nutrition/quick';
import { MealIcon } from '@/features/nutrition/MealIcon';
import { BRAND } from '@/config/brand';
import { afterModalClose } from '@/components/modalGate';

export default function Nutrition() {
  // Дата считается от «сегодня», которое само переключается после полуночи
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
  const [edit, setEdit] = useState<FoodEntry | null>(null);
  const [addFor, setAddFor] = useState<MealSlot | null>(null);
  const [saveMeal, setSaveMeal] = useState<{ slot: MealSlot; entries: FoodEntry[] } | null>(null);
  const saveAsMeal = (slot: MealSlot, list: FoodEntry[]) => setSaveMeal({ slot, entries: list });
  const nowMealFor = (today_: boolean): MealSlot => (today_ ? mealForHour(new Date().getHours()) : 'snack');
  const isToday = offset === 0;
  const usual = useMemo(() => Object.fromEntries((['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => [m, usualMeal(allEntries, products, date, m)])) as Record<MealSlot, UsualMeal | null>, [allEntries, products, date]);
  const addUsual = (u: UsualMeal) => {
    const st = useNutrition.getState();
    const ids = u.items.map((it) => st.addEntry(it.product, it.grams, u.slot, date).id);
    haptic.success();
    toast(`${MEAL_LABEL[u.slot]}: обычный добавлен`, 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().removeEntries(ids) });
  };
  const target = nut.target;
  const dayFiber = useMemo(() => sumFiber(nut.entries), [nut.entries]);
  const dp = isToday ? dayProgress() : 1;
  const prevDay = useMemo(() => allEntries.filter((e) => e.date === addDays(date, -1)), [allEntries, date]);
  const copyFrom = (from: string, meal?: MealSlot) => {
    const ids = useNutrition.getState().copyEntries(from, date, meal);
    haptic.success();
    toast(meal ? `${MEAL_LABEL[meal]} скопирован` : `Скопировано продуктов: ${ids.length}`, 'copy-outline', { label: 'Отменить', onPress: () => useNutrition.getState().removeEntries(ids) });
  };


  const review = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries: allEntries, adjustments, targetKcal: target.kcal, metrics, sessions }) : null), [profile, target, weights, allEntries, adjustments, metrics, sessions]);
  const [whyOpen, setWhyOpen] = useState(false);
  const explain = useMemo(() => (profile && target ? explainNutrition(profile, target, latestTrendWeight(weights) ?? profile.weightKg, review?.maintenance ?? null) : null), [profile, target, weights, review]);

  if (!profile || !target) return <Screen tabBar><EmptyState icon="nutrition-outline" title="Нет плана питания" text={`Заполни профиль — ${BRAND} рассчитает КБЖУ.`} /></Screen>;

  const kState = macroState('kcal', nut.eaten.kcal, target.kcal, dp);
  const left = Math.round(target.kcal - nut.eaten.kcal);
  const meals: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];



  const pct = nut.eaten.kcal / target.kcal;
  return (
    <Screen tabBar>
      <Ambient tone={left < 0 ? 'warn' : 'accent'} height={420} />
      <View style={styles.head}>
        <T v="h1" style={{ flex: 1 }}>
          Питание
        </T>
        <IconButton name="chevron-back" label="Предыдущий день" bg="transparent" onPress={() => setDate(addDays(date, -1))} />
        <T v="body" style={{ fontWeight: '700', minWidth: 72, textAlign: 'center' }}>
          {relativeDay(date)}
        </T>
        {isToday ? <View style={{ width: 44 }} /> : <IconButton name="chevron-forward" label="Следующий день" bg="transparent" onPress={() => setDate(addDays(date, 1))} />}
      </View>

      {/* Главная цифра экрана — сколько осталось, в кольце; тап — почему такие КБЖУ */}
      <Appear i={0} style={{ alignItems: 'center', marginTop: space.md }}>
        <Tap accessibilityRole="button" accessibilityLabel="Почему такие КБЖУ?" onPress={() => { haptic.tap(); setWhyOpen(true); }} scaleTo={0.97}>
          <Ring size={212} stroke={10} progress={pct} color={stateColor(kState)} track={colors.surface2}>
            <View style={{ alignItems: 'center' }}>
              <KcalLeft value={left} color={left < 0 ? stateColor(kState) : colors.text} />
              <T v="small" style={{ marginTop: 2 }}>
                {left >= 0 ? (isToday ? 'осталось ккал' : `осталось · ${relativeDay(date).toLowerCase()}`) : 'ккал сверх нормы'}
              </T>
              <T v="small" style={{ marginTop: 6, fontSize: 12, fontVariant: ['tabular-nums'] }} color={colors.text}>
                {fmtNum(nut.eaten.kcal)} из {fmtNum(target.kcal)}
              </T>
            </View>
          </Ring>
        </Tap>
      </Appear>
      <Appear i={1}>
        <View style={styles.macros} testID="macro-summary">
          <MacroLeft label="Белки" eaten={nut.eaten.protein} target={target.protein} state={macroState('protein', nut.eaten.protein, target.protein, dp)} base={colors.protein} />
          <MacroLeft label="Углеводы" eaten={nut.eaten.carbs} target={target.carbs} state={macroState('carbs', nut.eaten.carbs, target.carbs, dp)} base={colors.carbs} />
          <MacroLeft label="Жиры" eaten={nut.eaten.fat} target={target.fat} state={macroState('fat', nut.eaten.fat, target.fat, dp)} base={colors.fat} />
          <MacroLeft label="Клетчатка" eaten={dayFiber.g} complete={dayFiber.complete} target={target.fiber ?? fiberTarget(target.kcal)} state="progress" base={colors.stabilizerMuscle} />
        </View>
      </Appear>

      <Appear i={2} style={{ marginTop: space.xl }}>
        <Button title="Добавить еду" icon="add" size="lg" live onPress={() => setAddFor(nowMealFor(isToday))} accessibilityLabel="Добавить еду" />
        {!nut.entries.length && prevDay.length ? (
          <Pressable accessibilityRole="button" onPress={() => copyFrom(addDays(date, -1))} hitSlop={6} style={({ pressed }) => [styles.copyDay, pressed && { opacity: 0.6 }]}>
            <T v="small" style={{ fontWeight: '600' }}>
              Скопировать весь вчерашний день · {fmtNum(prevDay.reduce((a, e) => a + e.macros.kcal, 0))} ккал
            </T>
          </Pressable>
        ) : null}
      </Appear>

      {/* Приёмы пищи — один список без карточек: тап по строке — «Добавить в …», по записи — изменить */}
      <Appear i={3} style={styles.mealList}>
        {meals.map((m, mi) => {
          const list = nut.entries.filter((e) => e.meal === m);
          const mm = sumMacros(list);
          return (
            <View key={m} style={[styles.meal, mi < meals.length - 1 && styles.mealLine]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Добавить в ${MEAL_LABEL[m]}`} onPress={() => { haptic.tap(); setAddFor(m); }} style={({ pressed }) => [styles.mealHead, pressed && { opacity: 0.6 }]} testID={`meal-${m}`}>
                <MealIcon meal={m} />
                <T v="body" style={{ flex: 1, fontWeight: '700' }}>
                  {MEAL_LABEL[m]}
                </T>
                {list.length ? <T v="body" color={colors.textDim} style={{ fontVariant: ['tabular-nums'] }}>{fmtNum(mm.kcal)}</T> : null}
                <Icon name="add" size={20} color={colors.textDim} />
              </Pressable>
              {list.length ? (
                <T v="small" style={{ marginLeft: 44, marginTop: -6, marginBottom: 4, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                  Б {Math.round(mm.protein)} · Ж {Math.round(mm.fat)} · У {Math.round(mm.carbs)}
                </T>
              ) : null}
              {list.length === 0 && usual[m] ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Добавить обычный ${MEAL_LABEL[m].toLowerCase()}`} onPress={() => addUsual(usual[m]!)} style={({ pressed }) => [styles.hint, pressed && { opacity: 0.6 }]} testID={`usual-${m}`}>
                  <T v="small" numberOfLines={1} style={{ fontSize: 13 }}>
                    <T v="small" color={colors.text} style={{ fontWeight: '600', fontSize: 13 }}>
                      + Обычный · {fmtNum(usual[m]!.kcal)} ккал
                    </T>
                    {`  ${usual[m]!.items.map((it) => it.product.name).join(', ')}`}
                  </T>
                </Pressable>
              ) : list.length === 0 && prevDay.some((e) => e.meal === m) ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Скопировать ${MEAL_LABEL[m].toLowerCase()} со вчера`} hitSlop={8} onPress={() => copyFrom(addDays(date, -1), m)} style={({ pressed }) => [styles.hint, pressed && { opacity: 0.6 }]}>
                  <T v="small" style={{ fontWeight: '600', fontSize: 13 }}>
                    + Как вчера · {fmtNum(prevDay.filter((e) => e.meal === m).reduce((a, e) => a + e.macros.kcal, 0))} ккал
                  </T>
                </Pressable>
              ) : null}
              {list.map((e) => (
                <Pressable key={e.id} onPress={() => setEdit(e)} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${e.name}, изменить`}>
                  <T v="body" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
                    {e.name}
                    <T v="small" style={{ fontSize: 13 }}>{`  ${e.grams} г`}</T>
                  </T>
                  <T v="small" color={colors.text} style={{ fontVariant: ['tabular-nums'] }}>
                    {fmtNum(e.macros.kcal)}
                  </T>
                </Pressable>
              ))}
              {list.length >= 2 ? (
                <Pressable accessibilityRole="button" hitSlop={6} onPress={() => saveAsMeal(m, list)} style={styles.hint}>
                  <T v="small" style={{ fontWeight: '600', fontSize: 13 }}>
                    Сохранить как блюдо
                  </T>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </Appear>

      <WaterRow date={date} />

      {review && isToday && review.status === 'adjust' ? (
        // Итог алгоритма одной фразой; действие — только если правило предлагает изменение
        <Card tone={review.status === 'adjust' ? 'warning' : undefined} style={{ marginTop: space.lg, gap: 8 }} testID="calorie-review">
          <T v="body" color={colors.text} style={{ fontSize: 15 }}>
            {review.summary}
          </T>
          {review.maintenance ? (
            <T v="small" style={{ fontSize: 12 }}>
              {review.maintenance.text}
            </T>
          ) : null}
          {review.status === 'adjust' ? (
            <Button title={`Применить ${review.deltaKcal > 0 ? '+' : ''}${review.deltaKcal} ккал`} size="sm" onPress={() => { applyCalorieDelta(review.deltaKcal, review.summary, 'adaptive'); toast('Калорийность обновлена'); }} />
          ) : review.maintenance && Math.abs(review.maintenance.kcal - target.tdee) >= 150 && (target.adjustmentKcal ?? 0) === 0 ? (
            <Button title={`Перейти на мой расход (~${fmtNum(review.maintenance.kcal)} ккал)`} size="sm" variant="secondary" onPress={() => { const r = recalibrateCalories(); toast(r.message, r.ok ? 'checkmark-circle' : 'alert-circle'); }} />
          ) : null}
        </Card>
      ) : null}

      <AddFoodSheet visible={!!addFor} onClose={() => setAddFor(null)} date={date} meal={addFor ?? 'snack'} />
      <Sheet visible={whyOpen} onClose={() => setWhyOpen(false)} title="Почему такие КБЖУ?" subtitle={target.source === 'adaptive' ? 'По вашему фактическому расходу' : 'Стартовая оценка — дальше подстроится под вас'}>
        {explain ? (
          <View style={{ gap: 10 }} testID="macro-why">
            {explain.rows.map((r) => (
              <View key={r.label} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row' }}>
                  <T v="body" style={{ flex: 1, fontWeight: '800' }}>
                    {r.label}
                  </T>
                  <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    {r.value}
                  </T>
                </View>
                <T v="small">{r.why}</T>
              </View>
            ))}
            <View style={{ gap: 2 }}>
              {explain.data.map((x) => (
                <T key={x} v="small" style={{ fontSize: 12 }}>
                  • {x}
                </T>
              ))}
            </View>
            <ConfidenceLine level={explain.confidence.level} note={explain.confidence.note} />
            {review && review.status !== 'insufficient_data' ? (
              <View style={{ gap: 4, marginTop: 4 }} testID="calorie-review-why">
                <T v="body" color={colors.text} style={{ fontSize: 15 }}>
                  {review.summary}
                </T>
                {review.maintenance ? <T v="small" style={{ fontSize: 12 }}>{review.maintenance.text}</T> : null}
              </View>
            ) : null}
            <Button title="Подробный расчёт" variant="ghost" size="sm" onPress={() => { setWhyOpen(false); afterModalClose(() => router.push('/plan')); }} />
          </View>
        ) : null}
      </Sheet>
      <SaveMealSheet value={saveMeal} onClose={() => setSaveMeal(null)} />
      <EditEntrySheet key={edit?.id ?? 'none'} entry={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}

/** Вода за день: ±250 одним тапом, ориентир — от веса и тренировки */
function WaterRow({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const ml = useNutrition((s) => s.water[date] ?? 0);
  const w = useProfile((s) => s.profile?.weightKg ?? 75);
  const goal = waterTarget(w, false);
  const add = (x: number) => {
    useNutrition.getState().addWater(date, x);
    haptic.light();
  };
  return (
    <View style={styles.water}>
      <WaterSheet visible={open} onClose={() => setOpen(false)} date={date} />
      <Pressable accessibilityRole="button" accessibilityLabel="Вода: изменить объём" onPress={() => setOpen(true)} style={{ flex: 1, gap: 6 }}>
        <T v="body" style={{ fontWeight: '600' }}>
          Вода {ml >= 1000 ? `${String(Math.round(ml / 50) / 20).replace('.', ',')} л` : `${ml} мл`} <T v="small">из ~{String(goal / 1000).replace('.', ',')} л</T>
        </T>
        <Progress value={ml / goal} color={colors.protein} height={4} />
      </Pressable>
      <Tap accessibilityRole="button" accessibilityLabel="Минус 250 мл воды" disabled={!ml} onPress={() => add(-250)} style={[styles.waterBtn, !ml && { opacity: 0.4 }]} hitSlop={4} scaleTo={0.9}>
        <Icon name="remove" size={18} />
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel="Плюс 250 мл воды" onPress={() => add(250)} style={styles.waterBtn} hitSlop={4} scaleTo={0.9}>
        <T v="small" color={colors.text} style={{ fontWeight: '800' }}>
          +250
        </T>
      </Tap>
    </View>
  );
}

/** Главная цифра «осталось»: живой счётчик */
function KcalLeft({ value, color }: { value: number; color: string }) {
  const v = useCountUp(Math.abs(value));
  return (
    <T v="hero" style={{ fontSize: 46, lineHeight: 50 }} color={color} accessibilityLabel={`${value >= 0 ? '' : '+'}${fmtNum(Math.abs(value))} ккал`}>
      {value >= 0 ? fmtNum(Math.round(v)) : `+${fmtNum(Math.round(v))}`}
    </T>
  );
}

/** Остаток макроса: крупно «+49 г» (сколько ещё), полоса — сколько уже съедено */
/** Колонка сводки: съедено / цель. Клетчатка без данных — «—», частичные данные — «≥» */
function MacroLeft({ label, eaten, target, state, base, complete = true }: { label: string; eaten: number | null; target: number; state: MacroState; base: string; complete?: boolean }) {
  const c = state === 'progress' ? base : stateColor(state);
  const known = eaten !== null;
  return (
    <View style={styles.macroLeft} accessibilityLabel={`${label}: ${known ? Math.round(eaten) : 'нет данных'} из ${Math.round(target)} г`}>
      <T v="num" style={{ fontSize: 17 }} color={known && eaten > target * 1.1 && state !== 'progress' ? c : colors.text} numberOfLines={1} adjustsFontSizeToFit>
        {known ? `${complete ? '' : '≥'}${Math.round(eaten)}` : '—'}
        <T v="small" style={{ fontSize: 12 }}> / {Math.round(target)}</T>
      </T>
      <Progress value={known && target ? eaten / target : 0} color={c} height={3} />
      <T v="small" style={{ fontSize: 12 }} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </T>
    </View>
  );
}

function SaveMealSheet({ value, onClose }: { value: { slot: MealSlot; entries: FoodEntry[] } | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (value) setName(`Мой ${MEAL_LABEL[value.slot].toLowerCase()}`);
  }
  return (
    <Sheet visible={!!value} onClose={onClose} title="Сохранить как блюдо" subtitle="Потом — добавить всё одной кнопкой: «Добавить еду» → «Мои блюда»">
      {value ? (
        <View style={{ gap: space.md }}>
          <Field label="Название" value={name} onChangeText={setName} maxLength={40} />
          <View style={{ gap: 4 }}>
            {value.entries.map((e) => (
              <T key={e.id} v="small" color={colors.text}>
                • {e.name} — {e.grams} г
              </T>
            ))}
          </View>
          <Button
            title="Сохранить"
            icon="bookmark"
            size="lg"
            disabled={!name.trim()}
            onPress={() => {
              useNutrition.getState().saveMeal(name, value.entries.map((e) => ({ productId: e.productId, name: e.name, grams: e.grams })));
              haptic.success();
              toast(`«${name.trim()}» в «Моих блюдах»`, 'bookmark');
              onClose();
            }}
          />
        </View>
      ) : null}
    </Sheet>
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[['½', g / 2], ['−50', g - 50], ['+50', g + 50], ['×2', g * 2], ...(p?.serving ? [[p.serving.label, p.serving.grams]] : [])].map(([label, v]) => (
              <Pressable key={String(label)} accessibilityRole="button" accessibilityLabel={`Порция ${label}`} onPress={() => setG(Math.max(1, Math.min(3000, Math.round(Number(v)))))} style={styles.gramChip}>
                <T v="small" color={colors.text} style={{ fontWeight: '800' }}>
                  {label}
                </T>
              </Pressable>
            ))}
          </View>
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

const styles = themed({
  head: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: space.sm },
  macros: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  macroLeft: { flex: 1, gap: 6 },
  gramChip: { paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.surface2, justifyContent: 'center' },
  copyDay: { alignSelf: 'center', paddingVertical: 12 },
  mealList: { marginTop: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: space.md },
  meal: { paddingVertical: 6 },
  mealLine: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  hint: { marginLeft: 44, paddingBottom: 10 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 44, minHeight: 40 },
  water: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.lg, paddingVertical: 14, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  waterBtn: { minWidth: 48, height: 38, paddingHorizontal: 10, borderRadius: 19, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
});
