import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { FoodEntry, FoodProduct, MealSlot } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, EmptyState, Icon, IconButton, SectionTitle, T } from '@/components/ui';
import { Bar, Ring } from '@/components/charts';
import { Sheet } from '@/components/Sheet';
import { Field, NumberStepper } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useDayNutrition } from '@/hooks/useToday';
import { useNutrition, mealForHour, MEAL_LABEL, waterTarget } from '@/stores/nutrition';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useBody } from '@/stores/body';
import { useWorkouts } from '@/stores/workouts';
import { GOAL_SHORT, fiberTarget } from '@/features/nutrition/targets';
import { dayProgress, fiberLabel, macroState, macrosFor, sumFiber, sumMacros, type MacroState } from '@/features/nutrition/status';
import { stateColor } from '@/components/macroColor';
import { suggestMeals, type MealSuggestion } from '@/features/nutrition/suggest';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { applyCalorieDelta } from '@/features/profile/applyProfile';
import { LOCAL_FOODS } from '@/data/foods';
import { addDays, daysBetween, relativeDay, today } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { AddFoodSheet } from '@/features/nutrition/AddFoodSheet';
import { useDayKey } from '@/hooks/useDayKey';
import { frequentProducts, sameMealYesterday } from '@/features/nutrition/quick';
import { MealIcon } from '@/features/nutrition/MealIcon';
import { BRAND } from '@/config/brand';

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
  const metrics = useBody((s) => s.metrics);
  const sessions = useWorkouts((s) => s.sessions);
  const [edit, setEdit] = useState<FoodEntry | null>(null);
  const [moreMeals, setMoreMeals] = useState(false);
  const [addFor, setAddFor] = useState<MealSlot | null>(null);
  const [saveMeal, setSaveMeal] = useState<{ slot: MealSlot; entries: FoodEntry[] } | null>(null);
  const saveAsMeal = (slot: MealSlot, list: FoodEntry[]) => setSaveMeal({ slot, entries: list });
  const nowMealFor = (today_: boolean): MealSlot => (today_ ? mealForHour(new Date().getHours()) : 'snack');
  const isToday = offset === 0;
  const nowMeal = mealForHour(new Date().getHours());
  const repeat = useMemo(() => (isToday ? sameMealYesterday(allEntries, date, nowMeal) : []), [isToday, allEntries, date, nowMeal]);
  const frequent = useMemo(() => frequentProducts(allEntries, products, lastGrams, date), [allEntries, products, lastGrams, date]);
  const target = nut.target;
  const dayFiber = useMemo(() => sumFiber(nut.entries), [nut.entries]);
  const dp = isToday ? dayProgress() : 1;
  const prevDay = useMemo(() => allEntries.filter((e) => e.date === addDays(date, -1)), [allEntries, date]);
  const copyFrom = (from: string, meal?: MealSlot) => {
    const ids = useNutrition.getState().copyEntries(from, date, meal);
    haptic.success();
    toast(meal ? `${MEAL_LABEL[meal]} скопирован` : `Скопировано продуктов: ${ids.length}`, 'copy-outline', { label: 'Отменить', onPress: () => useNutrition.getState().removeEntries(ids) });
  };

  const suggestions = useMemo(() => {
    if (!profile || !nut.remaining || !isToday) return null;
    const recentProducts = recent.map((id) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id)).filter((p): p is FoodProduct => !!p).slice(0, 25);
    return suggestMeals({ remaining: nut.remaining, profile, todayEntries: nut.entries, recentProducts });
  }, [profile, nut.remaining, nut.entries, recent, products, isToday]);

  const review = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries: allEntries, adjustments, targetKcal: target.kcal, metrics, sessions }) : null), [profile, target, weights, allEntries, adjustments, metrics, sessions]);

  if (!profile || !target) return <Screen tabBar><EmptyState icon="nutrition-outline" title="Нет плана питания" text={`Заполни профиль — ${BRAND} рассчитает КБЖУ.`} /></Screen>;

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

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T v="caption">{isToday ? 'Осталось сегодня' : `Осталось · ${relativeDay(date).toLowerCase()}`}</T>
            <T v="display" style={{ fontSize: 36 }} color={left < 0 ? stateColor(kState) : colors.text}>
              {left >= 0 ? fmtNum(left) : `+${fmtNum(-left)}`}
              <T v="h3" color={colors.textDim}> ккал{left < 0 ? ' сверх' : ''}</T>
            </T>
            <T v="small">
              Съедено {fmtNum(nut.eaten.kcal)} из {fmtNum(target.kcal)} · {GOAL_SHORT[profile.goal]}
            </T>
          </View>
          <Ring size={72} stroke={8} progress={nut.eaten.kcal / target.kcal} color={stateColor(kState)}>
            <T v="small" color={colors.text} style={{ fontWeight: '800' }}>
              {Math.round((nut.eaten.kcal / target.kcal) * 100)}%
            </T>
          </Ring>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }} testID="macro-summary">
          <MacroLeft label="Белки" eaten={nut.eaten.protein} target={target.protein} state={macroState('protein', nut.eaten.protein, target.protein, dp)} base={colors.protein} />
          <MacroLeft label="Углеводы" eaten={nut.eaten.carbs} target={target.carbs} state={macroState('carbs', nut.eaten.carbs, target.carbs, dp)} base={colors.carbs} />
          <MacroLeft label="Жиры" eaten={nut.eaten.fat} target={target.fat} state={macroState('fat', nut.eaten.fat, target.fat, dp)} base={colors.fat} />
          <MacroLeft label="Клетчатка" eaten={dayFiber.g} complete={dayFiber.complete} target={target.fiber ?? fiberTarget(target.kcal)} state="progress" base={colors.accent} />
        </View>
      </Card>

      <Button title="Добавить еду" icon="add" size="lg" style={{ marginTop: space.md, marginBottom: space.sm }} onPress={() => setAddFor(nowMealFor(isToday))} accessibilityLabel="Добавить еду" />
      {!nut.entries.length && prevDay.length ? (
        <Pressable accessibilityRole="button" onPress={() => copyFrom(addDays(date, -1))} style={styles.copyDay}>
          <Icon name="copy-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <T v="body" style={{ fontWeight: '700', fontSize: 15 }}>
              Скопировать весь вчерашний день
            </T>
            <T v="small" style={{ fontSize: 12 }}>
              {prevDay.length} продуктов · {fmtNum(prevDay.reduce((a, e) => a + e.macros.kcal, 0))} ккал — потом поправишь граммовку
            </T>
          </View>
        </Pressable>
      ) : null}
      <WaterRow date={date} />
      {isToday && (repeat.length || frequent.length) ? (
        <>
          
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
      <View style={{ gap: 10 }}>
        {meals.map((m) => {
          const list = nut.entries.filter((e) => e.meal === m);
          const mm = sumMacros(list);
          const mf = sumFiber(list);
          return (
            <Card key={m} style={{ paddingVertical: 10 }}>
              {/* Вся карточка приёма (кроме записей — они открывают редактирование) открывает «Добавить в …» */}
              <Pressable accessibilityRole="button" accessibilityLabel={`Добавить в ${MEAL_LABEL[m]}`} onPress={() => { haptic.tap(); setAddFor(m); }} style={({ pressed }) => [{ gap: 4 }, pressed && { opacity: 0.7 }]} testID={`meal-${m}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MealIcon meal={m} />
                  <T v="h3" style={{ flex: 1, fontSize: 16 }}>
                    {MEAL_LABEL[m]}
                  </T>
                  {list.length ? <T v="small" color={colors.text} style={{ fontWeight: '700' }}>{fmtNum(mm.kcal)} ккал</T> : null}
                  <View style={styles.mealAdd}>
                    <Icon name="add" size={18} color={colors.accent} />
                  </View>
                </View>
                {list.length ? (
                  <T v="small" style={{ fontSize: 12, marginLeft: 42 }}>
                    Б {fmtG(mm.protein)} · Ж {fmtG(mm.fat)} · У {fmtG(mm.carbs)} · Кл {fiberLabel(mf).replace(' г', '')}
                  </T>
                ) : (
                  <T v="small" style={{ fontSize: 12, marginLeft: 42 }}>
                    Пусто — нажми, чтобы добавить
                  </T>
                )}
              </Pressable>
              {list.length === 0 && prevDay.some((e) => e.meal === m) ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Скопировать ${MEAL_LABEL[m].toLowerCase()} со вчера`} hitSlop={8} onPress={() => copyFrom(addDays(date, -1), m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, marginLeft: 42 }}>
                  <Icon name="copy-outline" size={14} color={colors.accent} />
                  <T v="small" color={colors.accent} style={{ fontWeight: '700', fontSize: 12 }}>
                    Как вчера · {fmtNum(prevDay.filter((e) => e.meal === m).reduce((a, e) => a + e.macros.kcal, 0))} ккал
                  </T>
                </Pressable>
              ) : null}
              {list.map((e) => (
                <Pressable key={e.id} onPress={() => setEdit(e)} style={styles.entry} accessibilityRole="button" accessibilityLabel={`${e.name}, изменить`}>
                  <View style={{ flex: 1 }}>
                    <T v="body" numberOfLines={2} style={{ fontSize: 15 }}>
                      {e.name}
                    </T>
                    <T v="small" style={{ fontSize: 12 }}>
                      {e.grams} г · Б {Math.round(e.macros.protein)} Ж {Math.round(e.macros.fat)} У {Math.round(e.macros.carbs)} Кл {e.macros.fiber === undefined ? '—' : Math.round(e.macros.fiber)}
                    </T>
                  </View>
                  <T v="body" style={{ fontWeight: '800', fontSize: 15 }}>
                    {fmtNum(e.macros.kcal)}
                  </T>
                </Pressable>
              ))}
              {list.length >= 2 ? (
                <Pressable accessibilityRole="button" hitSlop={6} onPress={() => saveAsMeal(m, list)} style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="bookmark-outline" size={14} color={colors.accent} />
                  <T v="small" color={colors.accent} style={{ fontWeight: '700', fontSize: 12 }}>
                    Сохранить как блюдо
                  </T>
                </Pressable>
              ) : null}
            </Card>
          );
        })}
      </View>

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
            {suggestions.options.slice(0, moreMeals ? 3 : 1).map((o) => (
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
            {suggestions.options.length > 1 ? (
              <Button title={moreMeals ? 'Скрыть варианты' : `Ещё варианты (${suggestions.options.length - 1})`} size="sm" variant="ghost" onPress={() => setMoreMeals(!moreMeals)} />
            ) : null}
          </View>
        </>
      ) : null}

      <AddFoodSheet visible={!!addFor} onClose={() => setAddFor(null)} date={date} meal={addFor ?? 'snack'} />
      <SaveMealSheet value={saveMeal} onClose={() => setSaveMeal(null)} />
      <EditEntrySheet key={edit?.id ?? 'none'} entry={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}

/** Вода за день: +250 / +500 одним тапом, ориентир — от веса и тренировки */
function WaterRow({ date }: { date: string }) {
  const ml = useNutrition((s) => s.water[date] ?? 0);
  const w = useProfile((s) => s.profile?.weightKg ?? 75);
  const goal = waterTarget(w, false);
  const add = (x: number) => {
    useNutrition.getState().addWater(date, x);
    haptic.light();
  };
  return (
    <View style={styles.water}>
      <Icon name="water-outline" size={20} color={colors.protein} />
      <View style={{ flex: 1, gap: 4 }}>
        <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
          Вода {ml >= 1000 ? `${String(Math.round(ml / 50) / 20).replace('.', ',')} л` : `${ml} мл`} <T v="small">из ~{String(goal / 1000).replace('.', ',')} л</T>
        </T>
        <Bar progress={ml / goal} color={colors.protein} height={4} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Минус 250 мл воды" disabled={!ml} onPress={() => add(-250)} style={[styles.waterBtn, !ml && { opacity: 0.4 }]} hitSlop={4}>
        <Icon name="remove" size={18} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Плюс 250 мл воды" onPress={() => add(250)} style={styles.waterBtn} hitSlop={4}>
        <T v="small" style={{ fontWeight: '800' }}>+250</T>
      </Pressable>
    </View>
  );
}

/** Остаток макроса: крупно «+49 г» (сколько ещё), полоса — сколько уже съедено */
/** Колонка сводки: съедено / цель. Клетчатка без данных — «—», частичные данные — «≥» */
function MacroLeft({ label, eaten, target, state, base, complete = true }: { label: string; eaten: number | null; target: number; state: MacroState; base: string; complete?: boolean }) {
  const c = state === 'progress' ? base : stateColor(state);
  const known = eaten !== null;
  return (
    <View style={styles.macroLeft}>
      <T v="caption" style={{ fontSize: 9.5 }} numberOfLines={1}>
        {label}
      </T>
      <T v="num" style={{ fontSize: 18 }} color={known && eaten > target * 1.1 && state !== 'progress' ? c : colors.text}>
        {known ? `${complete ? '' : '≥'}${Math.round(eaten)}` : '—'}
        <T v="small" style={{ fontSize: 11 }}> / {Math.round(target)}</T>
      </T>
      <Bar progress={known && target ? eaten / target : 0} color={c} height={4} />
      <T v="small" style={{ fontSize: 10 }}>
        {known ? (target - eaten >= 0 ? `ещё ${Math.round(target - eaten)} г` : `+${Math.round(eaten - target)} г`) : 'нет данных'}
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space.md },
  legend: { flexDirection: 'row', gap: 14, marginTop: space.md },
  quick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  macroLeft: { flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 3 },
  gramChip: { paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  copyDay: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.accentDim },
  water: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  waterBtn: { minWidth: 44, height: 36, paddingHorizontal: 8, borderRadius: 18, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  mealAdd: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, minHeight: 48, borderRadius: radius.sm },
});

function fmtG(n: number): string {
  return String(Math.round(n));
}
