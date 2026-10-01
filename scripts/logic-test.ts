/**
 * Автотесты доменной логики FORM (без React Native).
 * Запуск: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CoachAction, DailyCheckIn, WorkoutExercise, ExerciseSet, MovementRestriction, UserProfile, WeightEntry, WorkoutSession } from '../src/types';
import { computeNutritionTarget } from '../src/features/nutrition/targets';
import { reviewCalories } from '../src/features/nutrition/adaptive';
import { weightTrend, weeklyRate } from '../src/features/progress/weightTrend';
import { recommend } from '../src/features/training/progression';
import { computeReadiness } from '../src/features/recovery/readiness';
import { alternativesFor, generatePlan, isAvailable, plannedWeeklySets } from '../src/features/training/planGenerator';
import { excludeExercise, getPrefs, includeExercise, markDiscomfort, toggleFavorite, withPrefs } from '../src/features/training/engine/prefs';
import { checkAllowed, progressStatus, scoreExercise } from '../src/features/training/engine/scoring';
import { analyzeWorkout, suggestOrder } from '../src/features/training/engine/order';
import { estimateMinutes } from '../src/features/training/engine/time';
import { actionKey, applyToExercises, validateAction } from '../src/features/coach/actions';
import { cameraGate, isValidGtin, normalizeBarcode, pickScanLens, ScanGate } from '../src/features/food/scanner';
import { currentIndexOf, navItems, nextIndex, nextSetLabel, prevIndex, remainingInfo, workoutProgress } from '../src/features/training/workoutNav';
import { chooseSplit, compareSplits } from '../src/features/training/engine/split';
import { estimateRecovery } from '../src/features/training/engine/recovery';
import { healthAvailability, fetchHealthDays, mergedMinutes } from '../src/services/health';
import { healthContext, type HealthDay } from '../src/features/health/model';
import { readinessFor } from '../src/features/recovery/derive';
import { applyPalette, colors, paletteFor, resolveScheme, themed } from '../src/theme';
import { buildJournal, dayMode } from '../src/features/journal/build';
import { workoutDebrief } from '../src/features/training/debrief';
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

import { warmupSets, platesPerSide } from '../src/features/training/warmup';
import { checkDeload } from '../src/features/training/deload';
import { lastWeekSummary } from '../src/features/progress/weekly';
import { frequentProducts, sameMealYesterday } from '../src/features/nutrition/quick';
import { startOfWeek } from '../src/utils/date';
import type { FoodEntry } from '../src/types';

test('Разминка и блины: присед 100 кг → 20×10, 50×5, 70×3, 85×1; блины 25+15 на сторону', () => {
  const w = warmupSets(getExercise('back_squat')!, 100);
  assert.deepEqual(w.map((x) => x.weight), [20, 50, 70, 85]);
  assert.deepEqual(warmupSets(getExercise('lateral_raise')!, 100), [], 'изоляции разминка не нужна');
  assert.deepEqual(platesPerSide(100), [25, 15]);
  assert.deepEqual(platesPerSide(82.5), [25, 5, 1.25]);
  assert.equal(platesPerSide(15), null);
});

test('Разгрузка: застой e1RM в базовых → предлагается; свежий прогресс → нет', () => {
  const plan = generatePlan(base);
  const mains = plan.templates.map((t) => t.exercises[0].exerciseId);
  const mk = (week: number, weight: number): WorkoutSession[] =>
    mains.map((id, i) => ({
      id: `s${week}-${i}`, date: addDays(today(), -(7 * (6 - week)) + i), name: 'x', focus: '', source: 'plan', templateId: plan.templates[i].id,
      startedAt: week * 1e6 + i, finishedAt: week * 1e6 + i + 1, volumeFactor: 1, status: 'completed',
      exercises: [{ id: 'we', exerciseId: id, plannedSets: 3, repMin: 6, repMax: 10, targetRir: 2, restSec: 120, sets: [set(weight, 8), set(weight, 8), set(weight, 8)] }],
    }));
  const flat = [0, 1, 2, 3, 4, 5].flatMap((wk) => mk(wk, 80));
  const stalled = checkDeload({ plan, sessions: flat, checkins: {}, adjustments: [], overrides: {} });
  assert.ok(stalled.suggest, stalled.reasons.join('; '));
  assert.ok(stalled.stalled.length >= 2);
  const growing = [0, 1, 2, 3, 4, 5].flatMap((wk) => mk(wk, 70 + wk * 2.5));
  const ok = checkDeload({ plan, sessions: growing, checkins: {}, adjustments: [], overrides: {} });
  assert.equal(ok.stalled.length, 0);
  assert.ok(!ok.suggest || ok.weeksTrained >= 6, ok.reasons.join('; '));
});

test('Итоги недели и быстрое логирование еды', () => {
  const plan = generatePlan(base);
  const lastMon = addDays(startOfWeek(today()), -7);
  const entry = (date: string, id: string, meal: FoodEntry['meal'], kcal = 600, protein = 40): FoodEntry => ({ id: date + id + meal, date, productId: id, name: id, grams: 100, macros: { kcal, protein, fat: 10, carbs: 50 }, meal, createdAt: 0 });
  const entries = [entry(lastMon, 'local:cottage_5', 'breakfast', 2000, 140), entry(addDays(lastMon, 1), 'local:cottage_5', 'breakfast', 2500, 100)];
  const sessions: WorkoutSession[] = [{ id: 'a', date: addDays(lastMon, 1), name: 'x', focus: '', source: 'plan', startedAt: 1, finishedAt: 2, volumeFactor: 1, status: 'completed', exercises: [] }];
  const w = lastWeekSummary({ sessions, plan, entries, target: computeNutritionTarget(base), weights: [], checkins: {} });
  assert.ok(w);
  assert.equal(w!.workouts, 1);
  assert.equal(w!.planned, 4);
  assert.equal(w!.loggedDays, 2);
  assert.equal(w!.proteinDays, 1);
  const d = today();
  const rep = sameMealYesterday([entry(addDays(d, -1), 'local:egg', 'breakfast'), entry(addDays(d, -1), 'local:oats_dry', 'breakfast')], d, 'breakfast');
  assert.equal(rep.length, 2);
  assert.equal(sameMealYesterday([entry(addDays(d, -1), 'local:egg', 'breakfast'), entry(d, 'local:egg', 'breakfast')], d, 'breakfast').length, 0, 'если уже поел — не предлагаем');
  const freq = frequentProducts([entry(d, 'local:egg', 'breakfast'), entry(addDays(d, -1), 'local:egg', 'lunch'), entry(d, 'local:rice_cooked', 'lunch')], {}, { 'local:egg': 110 }, d);
  assert.equal(freq.length, 1);
  assert.equal(freq[0].grams, 110);
});

// ─── Персональный программист: сплит, объём, исключения, ограничения, порядок, AI-валидация ───

const allIds = (plan: ReturnType<typeof generatePlan>) => plan.templates.flatMap((t) => t.exercises.map((e) => e.exerciseId));
const FOCUSES = ['auto', 'push', 'pull', 'legs', 'upper', 'lower', 'full'] as const;

test('1. 4 дня + предпочтение Upper/Lower → не Full Body', () => {
  const plan = generatePlan(withPrefs(base, { preferredSplit: 'upper_lower' }));
  assert.equal(plan.split, 'upper_lower');
  assert.ok(!plan.templates.some((t) => /full/i.test(t.name)), plan.templates.map((t) => t.name).join(', '));
  assert.ok(plan.splitChoice?.reasons.some((r) => r.includes('Ты выбрал')), 'объяснение выбора');
});

test('2. Исключённая становая тяга не появляется нигде', () => {
  const p = excludeExercise(base, 'deadlift');
  for (const d of [2, 3, 4, 5, 6]) {
    for (const sp of ['auto', 'fullbody', 'upper_lower', 'ppl'] as const) {
      const plan = generatePlan(withPrefs({ ...p, daysPerWeek: d }, { preferredSplit: sp }));
      assert.ok(!allIds(plan).includes('deadlift'), `план ${d}д ${sp}`);
    }
  }
  for (const focus of FOCUSES) {
    const r = generateWorkout({ profile: p, sessions: [], minutes: 75, focus });
    assert.ok(!r.draft.exercises.some((e) => e.exerciseId === 'deadlift'), `генератор ${focus}`);
  }
  assert.ok(!alternativesFor('romanian_deadlift', p).some((e) => e.id === 'deadlift'), 'и не предлагается как замена');
});

test('3. Поясница + тяжёлые наклоны/тяги → нет классической становой', () => {
  const lim = { id: 'l1', area: 'lower_back' as const, movements: ['hip_hinge', 'heavy_axial'] as MovementRestriction[], severity: 'moderate' as const, source: 'user' as const, createdAt: 0 };
  const p = withPrefs(base, { limitations: [lim] });
  for (const d of [3, 4, 5, 6]) {
    const plan = generatePlan({ ...p, daysPerWeek: d });
    const ids = allIds(plan);
    assert.ok(!ids.includes('deadlift') && !ids.includes('good_morning'), `${d} дн: ${ids.join(',')}`);
    assert.ok(plan.notes?.some((n) => n.includes('Становая')), 'объяснение, что отфильтровано');
  }
  for (const focus of ['lower', 'legs', 'full'] as const) {
    const r = generateWorkout({ profile: p, sessions: [], minutes: 75, focus });
    assert.ok(!r.draft.exercises.some((e) => e.exerciseId === 'deadlift'), focus);
  }
});

test('4. Избранный жим гантелей получает больший score и попадает в план', () => {
  const ex = getExercise('db_bench_press')!;
  const slot = { key: 'press', muscle: 'chest' as const, role: 'main' as const, patterns: ['h_push' as const] };
  const plain = scoreExercise(ex, slot, { profile: base, prefs: getPrefs(base), sessions: [] }).score;
  const p = toggleFavorite(base, 'db_bench_press');
  const fav = scoreExercise(ex, slot, { profile: p, prefs: getPrefs(p), sessions: [] }).score;
  assert.ok(fav > plain, `${fav} > ${plain}`);
  assert.ok(allIds(generatePlan(p)).includes('db_bench_press'));
});

test('5. Недельная цель груди 12 → в плане ~12 подходов, не 18', () => {
  const plan = generatePlan(base);
  const chest = plan.volume!.find((v) => v.muscle === 'chest')!;
  assert.equal(chest.target, 12);
  assert.ok(chest.planned >= 10 && chest.planned <= 14, `грудь ${chest.planned}`);
  for (const v of plan.volume!) if (v.target >= 6) assert.ok(v.planned <= v.target * 1.35 + 2, `${v.muscle} ${v.planned}/${v.target} — перебор`);
});

test('6. Стиль 2 подхода → большинство упражнений по 2, объём компенсирован', () => {
  const p = withPrefs(base, { setStyle: 2 });
  const plan = generatePlan(p);
  const all = plan.templates.flatMap((t) => t.exercises);
  const two = all.filter((e) => e.sets === 2).length;
  assert.ok(two / all.length >= 0.7, `${two}/${all.length}`);
  assert.ok(all.every((e) => e.sets <= 3), 'максимум 3 (основное упражнение)');
  for (const m of ['chest', 'quads', 'lats'] as const) {
    const v = plan.volume!.find((x) => x.muscle === m)!;
    assert.ok(v.planned >= v.target * 0.75, `${m} ${v.planned}/${v.target}`);
  }
  assert.ok(plan.notes?.some((n) => /2 подход|на 1 подход больше/.test(n)), 'объяснение компенсации');
});

test('7. Своя тренировка: разведение, жим, разгибания, наклонный → жим, наклонный, разведение, разгибания', () => {
  const pe = (id: string) => ({ exerciseId: id, sets: 3, repMin: 8, repMax: 12, targetRir: 2, restSec: 90 });
  const r = suggestOrder([pe('db_fly'), pe('bench_press'), pe('triceps_pushdown'), pe('incline_db_press')]);
  assert.ok(r.changed);
  assert.deepEqual(r.order.map((x) => x.exerciseId), ['bench_press', 'incline_db_press', 'db_fly', 'triceps_pushdown']);
  assert.ok(r.why.length > 20, 'есть объяснение');
});

test('8. «Дискомфорт при выполнении» → упражнения нет в следующей генерации', () => {
  const plan = generatePlan(base);
  const victim = plan.templates[0].exercises[0].exerciseId;
  const p = markDiscomfort(base, victim, 'shoulder');
  const next = generatePlan(p, { previous: plan });
  assert.ok(!allIds(next).includes(victim), victim);
  for (const focus of FOCUSES) assert.ok(!generateWorkout({ profile: p, sessions: [], minutes: 75, focus }).draft.exercises.some((e) => e.exerciseId === victim), focus);
  assert.ok(!checkAllowed(getExercise(victim)!, p, getPrefs(p)).ok);
  // Вернуть можно только явно
  assert.ok(checkAllowed(getExercise(victim)!, includeExercise(p, victim), getPrefs(includeExercise(p, victim))).ok);
});

test('9. Упражнение с прогрессом не заменяется при перестройке плана', () => {
  const plan = generatePlan(base);
  const t = plan.templates[0];
  const slotPe = t.exercises.find((e) => e.slot?.endsWith('.press'))!;
  // Пользователь вручную поставил в слот тренажёр — и прогрессирует в нём
  slotPe.exerciseId = 'machine_chest_press';
  const sessions: WorkoutSession[] = [0, 1, 2, 3].map((i) => ({
    id: `p${i}`, date: addDays(today(), -18 + i * 6), name: t.name, focus: '', source: 'plan', templateId: t.id, startedAt: i, finishedAt: i + 1, volumeFactor: 1, status: 'completed',
    exercises: [{ id: `we${i}`, exerciseId: 'machine_chest_press', plannedSets: 3, repMin: 8, repMax: 12, targetRir: 2, restSec: 120, sets: [set(60 + i * 5, 10), set(60 + i * 5, 9), set(60 + i * 5, 8)] }],
  }));
  assert.equal(progressStatus('machine_chest_press', sessions).status, 'progressing');
  const next = generatePlan({ ...base, sessionMinutes: 75 }, { previous: plan, sessions });
  const sameT = next.templates.find((x) => x.key === t.key)!;
  const kept = sameT.exercises.find((e) => e.slot === slotPe.slot)!;
  assert.equal(kept.exerciseId, 'machine_chest_press');
  assert.ok(kept.why?.includes('прогресс'), kept.why);
});

test('10. 4 дня в авто → не Full Body; Full Body — только где уместен', () => {
  assert.notEqual(generatePlan(base).split, 'fullbody');
  assert.notEqual(generatePlan({ ...base, daysPerWeek: 5 }).split, 'fullbody');
  assert.notEqual(generatePlan({ ...base, daysPerWeek: 3, sessionMinutes: 70 }).split, 'fullbody', '3 дня, средний, 70 мин');
  assert.equal(generatePlan({ ...base, daysPerWeek: 2 }).split, 'fullbody');
  // Генератор «Авто» берёт день текущего сплита, а не «Всё тело» по умолчанию
  const plan = generatePlan(base);
  const r = generateWorkout({ profile: base, sessions: [], minutes: 70, focus: 'auto', plan });
  assert.ok(!/Всё тело/.test(r.draft.name), r.draft.name);
});

test('11. Тренировки укладываются во время', () => {
  for (const minutes of [40, 50, 60, 75, 90]) {
    for (const d of [3, 4, 5]) {
      for (const style of ['auto', 2, 3] as const) {
        const p = withPrefs({ ...base, daysPerWeek: d, sessionMinutes: minutes }, { setStyle: style });
        const plan = generatePlan(p);
        for (const t of plan.templates) assert.ok(t.estMinutes <= minutes + 6, `${minutes} мин, ${d} дн, стиль ${style}: ${t.name} ${t.estMinutes}`);
      }
    }
    const r = generateWorkout({ profile: base, sessions: [], minutes, focus: 'auto' });
    assert.ok(estimateMinutes(r.draft.exercises) <= minutes + 4, `генератор ${minutes}: ${estimateMinutes(r.draft.exercises)}`);
  }
  const quick = generateWorkout({ profile: base, sessions: [], minutes: 25, focus: 'auto', quick: true });
  assert.ok(quick.draft.exercises.length >= 3 && estimateMinutes(quick.draft.exercises) <= 30);
});

test('12. AI-действие с исключённым упражнением отклоняется валидацией', () => {
  const p = excludeExercise(base, 'deadlift');
  const plan = generatePlan(p);
  const todayExercises = plan.templates.find((t) => t.key?.startsWith('lo'))!.exercises;
  const from = todayExercises[0].exerciseId;
  const ctx = { profile: p, plan, todayExercises };
  const act = (type: CoachAction['type'], params: CoachAction['params']): CoachAction => ({ id: 'a', type, label: 'x', params });
  const bad = validateAction(act('replace_exercise', { exerciseId: from, toExerciseId: 'deadlift', scope: 'today' }), ctx);
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && bad.reason.includes('Не предлагать'), !bad.ok ? bad.reason : '');
  assert.equal(validateAction(act('favorite_exercise', { exerciseId: 'deadlift' }), ctx).ok, false);
  assert.equal(validateAction(act('replace_exercise', { exerciseId: 'bench_press_unknown', toExerciseId: 'leg_press' }), ctx).ok, false, 'неизвестное упражнение');
  assert.equal(validateAction(act('change_sets', { exerciseId: from, sets: 12 }), ctx).ok, false, 'границы чисел');
  assert.equal(validateAction(act('adjust_calories', { deltaKcal: 900 }), ctx).ok, false);
  // Допустимая замена проходит, отказ «больше не предлагать» — блокирует
  const good = act('replace_exercise', { exerciseId: from, toExerciseId: alternativesFor(from, p)[0].id, scope: 'today' });
  assert.equal(validateAction(good, ctx).ok, true);
  assert.equal(validateAction(good, { ...ctx, rejected: [actionKey(good)] }).ok, false);
  // Применение к списку упражнений сохраняет состав
  const swapped = applyToExercises(todayExercises, good);
  assert.equal(swapped.length, todayExercises.length);
  assert.ok(swapped.some((e) => e.exerciseId === good.params.toExerciseId));
});

test('Миграция: старый avoidExerciseIds → исключения без потерь', () => {
  const legacy = { ...base, avoidExerciseIds: ['ohp'] };
  const prefs = getPrefs(legacy);
  assert.equal(prefs.excluded[0].exerciseId, 'ohp');
  assert.equal(prefs.preferredSplit, 'auto');
  assert.ok(!allIds(generatePlan(legacy)).includes('ohp'));
  const back = includeExercise(legacy, 'ohp');
  assert.deepEqual(back.avoidExerciseIds, []);
});

test('Анализатор своей тренировки: 4 упражнения на грудь по 4 подхода → предупреждение и исправление', () => {
  const pe = (id: string) => ({ exerciseId: id, sets: 4, repMin: 8, repMax: 12, targetRir: 2, restSec: 90 });
  const list = [pe('bench_press'), pe('incline_db_press'), pe('db_fly'), pe('cable_crossover')];
  const issues = analyzeWorkout({ list, profile: base, prefs: getPrefs(base), sessions: [], weeklyTargets: { chest: 12 } });
  const over = issues.find((i) => i.id === 'over-chest');
  assert.ok(over && over.fix);
  const fixed = over!.fix!(list);
  assert.ok(fixed.reduce((a, x) => a + x.sets, 0) <= 9);
  const p = excludeExercise(base, 'db_fly');
  assert.ok(analyzeWorkout({ list, profile: p, prefs: getPrefs(p), sessions: [] }).some((i) => i.level === 'danger'), 'конфликт с исключением');
});

// ─── Итерация: сканер, тренировка по одному упражнению, сплит-движок, восстановление, Health, темы, дневник ───

test('Т1. Штрихкод: callback приходит 10 раз → обрабатывается один раз до «ещё раз»', () => {
  const gate = new ScanGate();
  const accepted = Array.from({ length: 10 }, () => gate.accept('4607001771630')).filter(Boolean);
  assert.equal(accepted.length, 1, 'один поиск/одно добавление');
  assert.equal(gate.ignored, 9);
  assert.equal(gate.state, 'locked');
  gate.retry();
  assert.equal(gate.accept('4607001771630'), '4607001771630', 'после retry снова принимает');
  const g2 = new ScanGate();
  assert.equal(g2.accept('4607001771631'), null, 'неверная контрольная цифра (полу-резкий кадр) отбрасывается');
  assert.equal(g2.state, 'scanning');
  assert.ok(isValidGtin('5449000000996') && isValidGtin('96385074'));
  assert.equal(normalizeBarcode('01234565', 'upc_e'), '012345000065', 'UPC-E разворачивается в UPC-A');
  assert.equal(normalizeBarcode('96385074', 'ean8'), '96385074', 'EAN-8 остаётся как есть');
});

test('Т2. Камера: нет разрешения → понятный фолбэк, а не пустой экран', () => {
  assert.equal(cameraGate(null), 'loading');
  assert.equal(cameraGate({ granted: false, canAskAgain: true }), 'ask');
  assert.equal(cameraGate({ granted: false, canAskAgain: false }), 'settings');
  assert.equal(cameraGate({ granted: true, canAskAgain: true }), 'ready');
  assert.equal(pickScanLens(['Back Camera', 'Back Dual Wide Camera', 'Back Triple Camera']), 'Back Triple Camera', 'виртуальная камера с макро-фокусом');
  assert.equal(pickScanLens(['Back Camera']), 'Back Camera');
  assert.equal(pickScanLens([]), undefined);
});

const wex = (id: string, done: number, total = 3): WorkoutExercise => ({
  id: `we-${id}`, exerciseId: id, plannedSets: total, repMin: 8, repMax: 12, targetRir: 2, restSec: 90,
  sets: Array.from({ length: total }, (_, i) => ({ id: `${id}-${i}`, weight: 50, reps: 10, done: i < done })),
});
const activeOf = (exs: WorkoutExercise[], currentIndex?: number): WorkoutSession => ({ id: 'a', date: today(), name: 'Upper A', focus: '', source: 'plan', startedAt: 1, exercises: exs, volumeFactor: 1, status: 'active', currentIndex });

test('Т4–6. Тренировка: одно текущее упражнение, «следующее» = именно следующее, статусы навигатора', () => {
  const s = activeOf([wex('bench_press', 3), wex('incline_db_press', 1), wex('lat_pulldown', 0), wex('seated_cable_row', 3)]);
  assert.equal(currentIndexOf(s), 1, 'без сохранённого индекса — первое незавершённое');
  assert.equal(nextIndex(s, 2), 3, 'следующее по порядку, даже если оно уже выполнено');
  assert.equal(nextIndex(s, 3), -1);
  assert.equal(prevIndex(s, 0), -1);
  const items = navItems(s, 2);
  assert.deepEqual(items.map((x) => x.state), ['completed', 'partial', 'current', 'completed']);
  assert.ok(Math.abs(workoutProgress(s) - 7 / 12) < 1e-9);
  const rem = remainingInfo(s);
  assert.equal(rem.exercises, 2);
  assert.ok(rem.minutes > 0);
  assert.equal(currentIndexOf({ ...s, currentIndex: 3 }), 3, 'сохранённый индекс главнее');
  assert.equal(currentIndexOf({ ...s, currentIndex: 9 }), 1, 'битый индекс не ломает экран');
});

test('Т7–8. Переход назад и перезапуск: подходы и позиция сохраняются (сериализация как в persist)', () => {
  const s = activeOf([wex('bench_press', 2), wex('lat_pulldown', 0)], 1);
  // Переход = смена currentIndex, подходы не трогаются
  const back: WorkoutSession = { ...s, currentIndex: prevIndex(s, 1) };
  assert.equal(back.exercises[0].sets.filter((x) => x.done).length, 2);
  // Перезапуск: состояние уходит в хранилище JSON-ом и возвращается
  const restored = JSON.parse(JSON.stringify(back)) as WorkoutSession;
  assert.equal(currentIndexOf(restored), 0);
  assert.equal(restored.exercises[0].sets.filter((x) => x.done).length, 2);
  assert.equal(nextSetLabel(restored, 0, (w) => String(w), () => ''), '50 × 8–12', 'таймер отдыха знает следующий подход');
});

test('Т9. Сплит-движок: выбирает лучший вариант под человека, а не по таблице', () => {
  const pick = (p: Partial<UserProfile>, t: Partial<ReturnType<typeof getPrefs>> = {}) => chooseSplit({ ...base, ...p }, { ...getPrefs(base), ...t }, []);
  const d4 = pick({});
  assert.equal(d4.split, 'upper_lower');
  assert.ok(d4.candidates.length >= 4, 'сравнивается несколько кандидатов');
  assert.ok(d4.candidates[0].score >= d4.candidates[d4.candidates.length - 1].score);
  assert.ok(d4.candidates.find((c) => c.split === 'fullbody')!.cons.length > 0, 'у Full Body есть объяснённые минусы');
  assert.equal(pick({ daysPerWeek: 3, level: 'beginner', sessionMinutes: 60 }).split, 'fullbody', 'новичку 3 дня — Full Body');
  assert.notEqual(pick({ daysPerWeek: 3 }).split, 'fullbody', 'среднему уровню 3×70 мин — не Full Body');
  assert.equal(pick({}, { priorityMuscles: ['biceps', 'triceps'] }).split, 'torso_limbs', 'приоритет рук меняет выбор');
  assert.equal(pick({ daysPerWeek: 6 }).split, 'ppl_x2');
  const cmp = compareSplits(d4, 'fullbody');
  assert.ok(cmp.summary.length > 10);
  const plan = generatePlan({ ...base, training: { ...getPrefs(base), preferredSplit: 'bro' } });
  assert.equal(plan.split, 'bro');
  assert.ok(plan.templates.length >= 4);
});

test('Т10. «Повышенное восстановление» не даёт бесконтрольный рост объёма', () => {
  const d = today();
  const ck = (sleep: number, sore: number, energy: number) => Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
    const date = addDays(d, -i);
    return [date, { date, sleepHours: sleep, sleepQuality: 3, energy, stress: 3, soreness: sore, pain: false, createdAt: 0 } as DailyCheckIn];
  }));
  const bad = ck(5.4, 4, 2);
  const good = ck(8, 2, 4);
  const enhBad = estimateRecovery({ profile: 'enhanced', sessions: [], checkins: bad });
  assert.ok(enhBad.factor <= 1, `плохой сон + усталость → не больше базы (${enhBad.factor})`);
  assert.ok(enhBad.reasons.some((r) => r.includes('не компенсирует')));
  const enhNoData = estimateRecovery({ profile: 'enhanced', sessions: [] });
  assert.ok(enhNoData.factor <= 1.05, `без данных — не больше +5% (${enhNoData.factor})`);
  const enhGood = estimateRecovery({ profile: 'enhanced', sessions: [], checkins: good });
  const stdGood = estimateRecovery({ profile: 'standard', sessions: [], checkins: good });
  assert.ok(enhGood.factor >= stdGood.factor && enhGood.factor <= 1.15, `${enhGood.factor} vs ${stdGood.factor}`);
  const planBad = generatePlan(base, { recovery: enhBad });
  const planStd = generatePlan(base);
  const vol = (p: ReturnType<typeof generatePlan>) => p.volume!.reduce((a, v) => a + v.target, 0);
  assert.ok(vol(planBad) <= vol(planStd), 'цель объёма не выросла');
});

test('Т11–12. Apple Health: отказ — приложение работает; данные есть — попадают в готовность с личной базой', async () => {
  // В node (как в Expo Go) нативного модуля нет: статус «нужна сборка», чтение — пустое, без исключений
  assert.equal(healthAvailability(), 'needs_dev_build');
  assert.deepEqual(await fetchHealthDays(7), []);
  const d = today();
  const c: DailyCheckIn = { date: d, sleepHours: 7.5, sleepQuality: 4, energy: 4, stress: 2, soreness: 2, pain: false, createdAt: 0 };
  const withoutHealth = readinessFor(d, { [d]: c }, []);
  assert.deepEqual(readinessFor(d, { [d]: c }, [], {}), withoutHealth, 'пустой Health = как без него');
  assert.equal(readinessFor(d, {}, [], {}), undefined);

  const days: Record<string, HealthDay> = {};
  for (let i = 1; i <= 14; i++) days[addDays(d, -i)] = { date: addDays(d, -i), restingHr: 52, hrvMs: 60, sleepHours: 7.5 };
  days[d] = { date: d, restingHr: 61, hrvMs: 45, sleepHours: 6.2, steps: 8430 };
  const h = healthContext(days, d)!;
  assert.equal(h.rhrBaseline, 52);
  assert.equal(h.rhrDelta, 9);
  assert.equal(h.hrvDeltaPct, -25);
  const r = readinessFor(d, {}, [], days)!;
  assert.equal(r.source, 'health', 'без чек-ина — по данным Health');
  assert.ok(r.factors.some((f) => f.label.includes('HRV')) && r.factors.some((f) => f.label.includes('Пульс')));
  const rc = readinessFor(d, { [d]: c }, [], days)!;
  assert.ok(rc.score < withoutHealth!.score, 'HRV ниже базы и пульс выше снижают готовность при том же чек-ине');
  assert.equal(Math.round(mergedMinutes([[0, 3_600_000], [1_800_000, 7_200_000], [10_800_000, 14_400_000]])), 180, 'пересекающиеся записи сна сливаются');
});

test('Т13. Темы: системная/тёмная/светлая, акценты, перекраска стилей и сохранение выбора', () => {
  assert.equal(resolveScheme('system', 'light'), 'light');
  assert.equal(resolveScheme('system', 'dark'), 'dark');
  assert.equal(resolveScheme('system', null), 'dark', 'по умолчанию — тёмная FORM');
  assert.equal(resolveScheme('light', 'dark'), 'light');
  const dark = paletteFor('dark', 'lime');
  const light = paletteFor('light', 'lime');
  assert.equal(dark.accent, '#C8F53C');
  assert.notEqual(light.bg, dark.bg);
  assert.equal(light.surface, '#FFFFFF');
  assert.notEqual(light.accent, dark.accent, 'на светлом фоне акцент затемнён (читаемость)');
  const st = themed({ box: { backgroundColor: colors.surface, borderColor: colors.accent, color: '#123456' } });
  applyPalette('light', 'blue');
  assert.equal(st.box.backgroundColor, '#FFFFFF');
  assert.equal(st.box.borderColor, paletteFor('light', 'blue').accent);
  assert.equal(st.box.color, '#123456', 'не-токены не трогаются');
  assert.equal(colors.bg, light.bg);
  applyPalette('dark', 'lime');
  assert.equal(st.box.backgroundColor, dark.surface);
  // Сохранение выбора после перезапуска проверяется e2e: scripts/e2e-web.cjs
});

test('Т15. Дневник: автоматические события по времени, рекорд после тренировки, план — пунктиром', () => {
  const d = today();
  const t = (h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
  const prev: WorkoutSession = { id: 'p', date: addDays(d, -3), name: 'Upper A', focus: '', source: 'plan', startedAt: t(9) - 3 * 864e5, finishedAt: t(10) - 3 * 864e5, volumeFactor: 1, status: 'completed', exercises: [{ ...wex('bench_press', 3), sets: [set(80, 8), set(80, 8)] }] };
  const cur: WorkoutSession = { id: 'c', date: d, name: 'Upper A', focus: '', source: 'plan', startedAt: t(18, 40), finishedAt: t(19, 42), volumeFactor: 1, status: 'completed', exercises: [{ ...wex('bench_press', 3), sets: [set(90, 8), set(85, 8)] }] };
  const ev = buildJournal({
    date: d,
    checkin: { date: d, sleepHours: 7, sleepQuality: 4, energy: 4, stress: 2, soreness: 2, pain: false, createdAt: t(8, 10) },
    weights: [{ id: 'w', date: d, kg: 81.6, createdAt: t(9) }],
    entries: [{ id: 'e', date: d, productId: 'x', name: 'Овсянка', grams: 80, macros: { kcal: 610, protein: 30, fat: 10, carbs: 90 }, meal: 'breakfast', createdAt: t(10, 15) }],
    sessions: [prev, cur],
    notes: [{ id: 'n', date: d, at: t(12), text: 'Плохо спал' }],
  });
  assert.deepEqual(ev.map((e) => e.kind), ['checkin', 'weight', 'meal', 'note', 'workout_done', 'pr']);
  assert.ok(ev.every((e, i) => i === 0 || e.at >= ev[i - 1].at), 'по времени');
  assert.ok(ev.find((e) => e.kind === 'pr')!.sub!.includes('90'));
  const planned = buildJournal({ date: d, weights: [], entries: [], sessions: [], planned: { name: 'Upper A', at: t(18, 30) } });
  assert.equal(planned[0].planned, true);
  assert.equal(dayMode(8, false), 'morning');
  assert.equal(dayMode(15, true), 'after_workout');
  assert.equal(dayMode(21, true), 'evening');
  const deb = workoutDebrief(cur, [prev, cur]);
  assert.equal(deb.prs.length, 1);
  assert.ok(deb.lines.some((l) => l.includes('прогресс')));
});
