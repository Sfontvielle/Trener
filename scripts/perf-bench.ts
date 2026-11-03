/**
 * Замер производительности на годе данных (фаза F): время чистых вычислений, которые выполняются при открытии
 * дневника, «Сегодня», «Прогресса», истории и статистики. Данные — демо-генератор приложения за PERF_DAYS дней.
 * Запуск: npx tsx --tsconfig tsconfig.test.json scripts/perf-bench.ts
 * Это Node (V8 с JIT) на сервере: на iPhone (Hermes) ориентир — в 3–5 раз медленнее. Порог кадра — 16 мс.
 */
import './stubs/dev-global';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import type { UserProfile } from '../src/types';
import { useProfile } from '../src/stores/profile';
import { usePlan } from '../src/stores/plan';
import { useNutrition } from '../src/stores/nutrition';
import { useWorkouts } from '../src/stores/workouts';
import { useBody } from '../src/stores/body';
import { useCheckins } from '../src/stores/checkins';
import { applyProfile } from '../src/features/profile/applyProfile';
import { seedDemoData } from '../src/features/profile/demo';
import { addDays, today } from '../src/utils/date';
import { sumMacros, remaining } from '../src/features/nutrition/status';
import { usualMeal } from '../src/features/nutrition/quick';
import { reviewCalories } from '../src/features/nutrition/adaptive';
import { suggestMeals } from '../src/features/nutrition/suggest';
import { remainderHint } from '../src/features/nutrition/remainder';
import { nutritionPeriod } from '../src/features/nutrition/analytics';
import { weightTrend } from '../src/features/progress/weightTrend';
import { comparePeriods } from '../src/features/progress/series';
import { weeklyProposals } from '../src/features/progress/weekly';
import { journalSections, periodStats, prCounts } from '../src/features/training/journal';
import { groupByWeek, trainingSections } from '../src/features/training/library';
import { progressRows, setsByGroup } from '../src/features/training/analytics';

const DAYS = Number(process.env.PERF_DAYS || 365);
const PROFILE: UserProfile = {
  name: 'Тест', sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 4, sessionMinutes: 60, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
} as UserProfile;

useProfile.setState({ profile: PROFILE });
applyProfile(PROFILE, { force: true });
seedDemoData(DAYS);

const nut = useNutrition.getState();
const wk = useWorkouts.getState();
const body = useBody.getState();
const plan = usePlan.getState();
const target = plan.target!;
const d = today();
const entries = nut.entries;
const sessions = wk.sessions;
const customs = wk.customExercises;

const rows: { screen: string; name: string; ms: number }[] = [];
function bench(screen: string, name: string, fn: () => unknown, runs = 15) {
  fn(); // прогрев
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  t.sort((x, y) => x - y);
  rows.push({ screen, name, ms: t[Math.floor(t.length / 2)] });
}

// Дневник (открытие дня)
bench('Дневник', 'записи дня + сумма', () => sumMacros(entries.filter((e) => e.date === d).sort((a, b) => a.createdAt - b.createdAt)));
bench('Дневник', 'дни с записями (полоса недели)', () => new Set(entries.map((e) => e.date)));
bench('Дневник', '«обычный» приём ×4', () => (['breakfast', 'lunch', 'dinner', 'snack'] as const).map((m) => usualMeal(entries, nut.products, d, m)));
bench('Дневник', 'пересмотр калорий', () => reviewCalories({ profile: PROFILE, weights: body.weights, entries, adjustments: plan.adjustments, targetKcal: target.kcal, metrics: body.metrics, sessions }));
// Сегодняшний день с записями: завтрак и обед, к вечеру не добран белок
const dayEntries = entries.filter((e) => e.date === addDays(d, -1)).slice(0, 4);
bench('Дневник', 'подсказка: остаток (при отрисовке)', () => remainderHint({ target, eaten: sumMacros(dayEntries), entries: dayEntries.length, progress: 0.7 }));
bench('Дневник', 'подсказка: вариант еды (после отрисовки)', () => {
  const o = suggestMeals({ remaining: remaining(target, sumMacros(dayEntries)), profile: PROFILE, todayEntries: dayEntries, recentProducts: [], hour: 17 }).options[0];
  return remainderHint({ target, eaten: sumMacros(dayEntries), entries: dayEntries.length, progress: 0.7, option: o ? { items: o.items.map((x) => ({ name: x.product.name, grams: x.grams })), kcal: o.total.kcal, protein: o.total.protein } : null });
});
// Прогресс
bench('Прогресс', 'тренд веса', () => weightTrend(body.weights));
bench('Прогресс', 'сравнение периодов 90 дн.', () => comparePeriods({ days: 90, weights: body.weights, metrics: body.metrics, sessions, entries }));
bench('Прогресс', 'питание за 90 дн.', () => nutritionPeriod({ entries, target, weights: body.weights, days: 90, today: d }));
bench('Прогресс', 'тренировки за 90 дн. (рекорды)', () => {
  const prs = prCounts(sessions, customs);
  return [periodStats(sessions, addDays(d, -89), d, customs, prs), periodStats(sessions, addDays(d, -179), addDays(d, -90), customs, prs)];
});
bench('Прогресс', 'предложения недели', () => weeklyProposals({ profile: PROFILE, plan: plan.plan, sessions, customs }));
// История и статистика
bench('История', 'дневник тренировок по неделям', () => journalSections(sessions, d, customs));
bench('История', 'список и группы по неделям', () => groupByWeek(trainingSections({ sessions, planned: [], active: null, today: d, customs }).history, d));
bench('Статистика', 'рабочие веса и рекорды', () => progressRows(sessions, customs));
bench('Статистика', 'подходы по мышцам за 28 дн.', () => setsByGroup(sessions, addDays(d, -27), d, customs));

console.log(`Данные: ${DAYS} дней · записей питания ${entries.length} · тренировок ${sessions.length} · взвешиваний ${body.weights.length}`);
console.log('экран | вычисление | медиана, мс');
for (const r of rows) console.log(`${r.screen} | ${r.name} | ${r.ms.toFixed(2)}${r.ms > 16 ? '  ← дольше кадра' : r.ms > 4 ? '  ← заметно' : ''}`);
// PERF_DUMP=файл: сохранить сгенерированный год в виде, в каком его хранит приложение (для веб-замера отрисовки)
if (process.env.PERF_DUMP) {
  const stores = { profile: useProfile, plan: usePlan, nutrition: useNutrition, workouts: useWorkouts, body: useBody, checkins: useCheckins };
  const out: Record<string, unknown> = {};
  for (const st of Object.values(stores)) {
    const o = st.persist.getOptions();
    const state = o.partialize ? o.partialize(st.getState() as never) : st.getState();
    out[o.name!] = JSON.stringify({ state, version: o.version });
  }
  writeFileSync(process.env.PERF_DUMP, JSON.stringify(out));
  console.log(`сохранено: ${process.env.PERF_DUMP}`);
}
// Выход: хранилища в Node пытаются писать на диск по таймеру — не ждём их
process.exit(0);
