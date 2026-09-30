/**
 * Автотесты доменной логики FORM (без React Native).
 * Запуск: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DailyCheckIn, ExerciseSet, UserProfile, WeightEntry, WorkoutSession } from '../src/types';
import { computeNutritionTarget } from '../src/features/nutrition/targets';
import { reviewCalories } from '../src/features/nutrition/adaptive';
import { weightTrend, weeklyRate } from '../src/features/progress/weightTrend';
import { recommend } from '../src/features/training/progression';
import { computeReadiness } from '../src/features/recovery/readiness';
import { generatePlan, isAvailable, plannedWeeklySets } from '../src/features/training/planGenerator';
import { generateWorkout } from '../src/features/training/generator';
import { resolveToday } from '../src/features/training/today';
import { suggestMeals } from '../src/features/nutrition/suggest';
import { detectSafety } from '../src/features/coach/safety';
import { getExercise, EXERCISES } from '../src/data/exercises';
import { addDays, today, weekdayIndex } from '../src/utils/date';

const base: UserProfile = {
  name: 'Тест', sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 4, sessionMinutes: 70, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar', 'smith', 'kettlebell', 'band'],
  limitations: '', avoidExerciseIds: [], likedFoods: ['Курица', 'Творог', 'Рис'], dislikedFoods: ['Рыба'], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};

const set = (weight: number, reps: number, extra: Partial<ExerciseSet> = {}): ExerciseSet => ({ id: Math.random().toString(36), weight, reps, done: true, ...extra });

test('КБЖУ: набор > поддержание > сушка, белок растёт на сушке', () => {
  const bulk = computeNutritionTarget(base);
  const maint = computeNutritionTarget({ ...base, goal: 'maintain' });
  const cut = computeNutritionTarget({ ...base, goal: 'cut', ratePctPerWeek: 0.6 });
  assert.ok(bulk.kcal > maint.kcal && maint.kcal > cut.kcal, `${bulk.kcal} ${maint.kcal} ${cut.kcal}`);
  assert.ok(cut.protein > maint.protein);
  for (const t of [bulk, maint, cut]) {
    const sum = t.protein * 4 + t.fat * 9 + t.carbs * 4;
    assert.ok(Math.abs(sum - t.kcal) < 60, `макросы сходятся с калориями: ${sum} vs ${t.kcal}`);
    assert.ok(t.steps.length >= 6, 'расчёт прозрачен');
  }
  assert.ok(cut.kcal >= cut.bmr, 'не ниже BMR');
});

test('Тренд веса сглаживает одиночный выброс', () => {
  const w: WeightEntry[] = [];
  for (let i = 20; i >= 0; i--) w.push({ id: String(i), date: addDays(today(), -i), kg: 80 + (i === 3 ? 2.5 : 0), createdAt: 0 });
  const t = weightTrend(w);
  assert.ok(Math.abs(t[t.length - 1].trend - 80) < 0.4, `тренд ${t[t.length - 1].trend}`);
});

test('Адаптация: на наборе вес 3 недели стоит → +калории; не реагирует на 1 замер', () => {
  const w: WeightEntry[] = [];
  for (let i = 21; i >= 0; i--) if (i % 2 === 0) w.push({ id: String(i), date: addDays(today(), -i), kg: 80 + ((i * 7) % 5 - 2) * 0.1, createdAt: 0 });
  const r = reviewCalories({ profile: base, weights: w, entries: [], adjustments: [], targetKcal: 2900 });
  assert.equal(r.status, 'adjust');
  assert.ok(r.deltaKcal >= 100 && r.deltaKcal <= 250, `delta ${r.deltaKcal}`);
  const single = reviewCalories({ profile: base, weights: [w[w.length - 1]], entries: [], adjustments: [], targetKcal: 2900 });
  assert.equal(single.status, 'insufficient_data');
  const rate = weeklyRate(weightTrend(w));
  assert.ok(rate && Math.abs(rate.kgPerWeek) < 0.15);
});

test('Прогрессия: 80×10×3 с запасом → 82.5; 7/6/8 → без повышения; 2 провала → снижение; низкая готовность → держим', () => {
  const ex = getExercise('bench_press')!;
  const args = { exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2 };
  const up = recommend({ ...args, history: [{ date: '2026-09-28', repMin: 8, repMax: 10, sets: [set(80, 10, { rir: 2 }), set(80, 10, { rir: 2 }), set(80, 10, { rir: 1 })] }] });
  assert.equal(up.action, 'increase');
  assert.equal(up.weight, 82.5);
  const fail = { date: '2026-09-28', repMin: 8, repMax: 10, sets: [set(80, 7), set(80, 6), set(75, 8)] };
  const hold = recommend({ ...args, history: [fail] });
  assert.notEqual(hold.action, 'increase');
  assert.equal(hold.weight, 80);
  const down = recommend({ ...args, history: [fail, { date: '2026-09-25', repMin: 8, repMax: 10, sets: [set(80, 6), set(80, 7), set(80, 6)] }] });
  assert.equal(down.action, 'decrease');
  assert.ok(down.weight < 80);
  const tired = recommend({ ...args, band: 'reduce', history: [{ date: '2026-09-28', repMin: 8, repMax: 10, sets: [set(80, 10), set(80, 10), set(80, 10)] }] });
  assert.equal(tired.action, 'hold');
  const hard = recommend({ ...args, history: [{ date: '2026-09-28', repMin: 8, repMax: 10, sets: [set(80, 10, { feel: 'hard' }), set(80, 10, { feel: 'hard' }), set(80, 10, { feel: 'hard' })] }] });
  assert.equal(hard.action, 'hold', 'тяжело → закрепить вес');
});

test('Readiness: хороший день → по плану, плохой сон и усталость → восстановление', () => {
  const good: DailyCheckIn = { date: today(), sleepHours: 8, sleepQuality: 4, energy: 4, stress: 2, soreness: 2, pain: false, createdAt: 0 };
  const bad: DailyCheckIn = { ...good, sleepHours: 4.5, sleepQuality: 1, energy: 1, stress: 5, soreness: 5 };
  const g = computeReadiness(good, { sessions: [] });
  const b = computeReadiness(bad, { sessions: [] });
  assert.equal(g.band, 'go');
  assert.equal(b.band, 'recover');
  assert.ok(computeReadiness({ ...good, pain: true }, { sessions: [] }).score <= 55);
});

test('План: 2–6 дней, зал и дом — корректный сплит, расписание и доступное оборудование', () => {
  for (const loc of ['gym', 'home'] as const) {
    for (let d = 2; d <= 6; d++) {
      const p: UserProfile = { ...base, daysPerWeek: d, location: loc, equipment: loc === 'home' ? ['dumbbell', 'bench', 'pullupbar', 'band'] : base.equipment };
      const plan = generatePlan(p);
      assert.equal(plan.schedule.filter(Boolean).length, d, `дней ${d}`);
      for (const t of plan.templates) {
        assert.ok(t.exercises.length >= 3, `${t.name} пустой (${loc}, ${d})`);
        for (const pe of t.exercises) assert.ok(isAvailable(getExercise(pe.exerciseId)!, p.equipment, p.location), `${pe.exerciseId} недоступно`);
        assert.ok(t.estMinutes <= p.sessionMinutes + 8, `${t.name} ${t.estMinutes} мин`);
      }
      const vol = plannedWeeklySets(plan.templates, plan.schedule);
      assert.ok((vol.chest ?? 0) > 0 && (vol.back ?? 0) > 0 && (vol.quads ?? 0) > 0, 'все крупные группы нагружены');
    }
  }
  const avoid = generatePlan({ ...base, avoidExerciseIds: ['bench_press', 'ohp'] });
  assert.ok(!avoid.templates.some((t) => t.exercises.some((e) => e.exerciseId === 'bench_press' || e.exerciseId === 'ohp')));
});

test('Сегодня: ротация не теряет тренировку при пропуске', () => {
  const plan = generatePlan(base);
  const d = today();
  let trainingDay = d;
  for (let i = 0; i < 7; i++) if (plan.schedule[weekdayIndex(addDays(d, i))]) { trainingDay = addDays(d, i); break; }
  const first = resolveToday({ date: trainingDay, plan, sessions: [] });
  assert.equal(first.kind, 'workout');
  const done: WorkoutSession = { id: 'x', date: addDays(trainingDay, -1), name: first.template!.name, focus: '', source: 'plan', templateId: first.template!.id, startedAt: 1, finishedAt: 2, exercises: [], volumeFactor: 1, status: 'completed' };
  const next = resolveToday({ date: trainingDay, plan, sessions: [done] });
  assert.notEqual(next.template?.id, first.template?.id, 'после выполненной — следующая по ротации');
  const reduced = resolveToday({ date: trainingDay, plan, sessions: [], readiness: { score: 65, band: 'reduce', headline: '', volumeFactor: 0.85, rirDelta: 0, factors: [] } });
  assert.ok(reduced.totalSets < first.totalSets);
});

test('Генератор: низкая готовность → короче и меньше упражнений', () => {
  const normal = generateWorkout({ profile: base, sessions: [], minutes: 60, focus: 'auto' });
  const tired = generateWorkout({ profile: base, sessions: [], minutes: 60, focus: 'auto', readiness: { score: 40, band: 'recover', headline: '', volumeFactor: 0.5, rirDelta: 2, factors: [] } });
  const sets = (d: typeof normal) => d.draft.exercises.reduce((a, e) => a + e.sets, 0);
  assert.ok(normal.draft.exercises.length >= 4);
  assert.ok(sets(tired) < sets(normal), `${sets(tired)} < ${sets(normal)}`);
  assert.ok(tired.draft.exercises.length <= normal.draft.exercises.length);
});

test('Что добрать: утром — один приём (не весь день), вечером — белок без жира, реальные порции', () => {
  const morning = suggestMeals({ remaining: { kcal: 2700, protein: 145, fat: 70, carbs: 400 }, profile: base, todayEntries: [], recentProducts: [], hour: 9 });
  assert.ok(morning.options.length > 0);
  for (const o of morning.options) {
    assert.ok(o.total.kcal < 1100, `утренний вариант ${o.total.kcal} ккал`);
    for (const it of o.items) {
      assert.ok(!/сахар|м[её]д|кола/i.test(it.product.name), `пустые углеводы: ${it.product.name}`);
      assert.ok(it.grams <= 400, `${it.product.name} ${it.grams} г`);
    }
  }
  const t0 = Date.now();
  const evening = suggestMeals({ remaining: { kcal: 610, protein: 48, fat: 4, carbs: 70 }, profile: base, todayEntries: [], recentProducts: [], hour: 20 });
  const ms = Date.now() - t0;
  assert.ok(ms < 800, `быстро: ${ms} мс`);
  const o = evening.options[0];
  assert.ok(o, 'есть вариант');
  assert.ok(o.total.protein >= 30, `белок ${o.total.protein}`);
  assert.ok(o.total.fat <= 15, `жир ${o.total.fat}`);
  assert.ok(o.total.kcal <= 750, `ккал ${o.total.kcal}`);
  for (const opt of evening.options) assert.ok(!opt.items.some((i) => /лосос|треск|тунец|кревет/i.test(i.product.name)), 'нелюбимая рыба не предлагается');
  const over = suggestMeals({ remaining: { kcal: 300, protein: 30, fat: -15, carbs: 40 }, profile: base, todayEntries: [], recentProducts: [], hour: 18 });
  assert.ok(over.notes.some((n) => n.includes('Жиры уже превышены')));
});

test('Безопасность: красные флаги распознаются', () => {
  assert.equal(detectSafety('Сильная боль в груди после приседа'), 'emergency');
  assert.equal(detectSafety('потерял сознание на тренировке'), 'emergency');
  assert.equal(detectSafety('кажется порвал связку, отёк'), 'injury');
  assert.equal(detectSafety('Что мне поесть вечером?'), 'none');
  assert.equal(detectSafety('болят мышцы после ног, крепатура'), 'none');
});

test('Библиотека: уникальные id, техника и мышцы заполнены', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  assert.equal(ids.size, EXERCISES.length);
  assert.ok(EXERCISES.length >= 100);
  for (const e of EXERCISES) {
    assert.ok(e.cues.length >= 2 && e.primary.length >= 1 && e.media, e.id);
    assert.ok(e.defaultReps[0] <= e.defaultReps[1], e.id);
  }
});
