/**
 * Автотесты доменной логики RYNJI (без React Native).
 * Запуск: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CoachAction, DailyCheckIn, WorkoutExercise, ExerciseSet, MovementRestriction, UserProfile, WeightEntry, WorkoutSession , FoodEntry } from '../src/types';
import { computeNutritionTarget , bmrMifflin, fiberTarget } from '../src/features/nutrition/targets';
import { reviewCalories } from '../src/features/nutrition/adaptive';
import { weightTrend, weeklyRate } from '../src/features/progress/weightTrend';
import { effectiveIncrement, recommend, workingSets } from '../src/features/training/progression';
import { computeReadiness , negativeSignals } from '../src/features/recovery/readiness';
import { alternativesFor, generatePlan, isAvailable, plannedWeeklySets } from '../src/features/training/planGenerator';
import { excludeExercise, getPrefs, includeExercise, markDiscomfort, toggleFavorite, withPrefs } from '../src/features/training/engine/prefs';
import { checkAllowed, progressStatus, scoreExercise } from '../src/features/training/engine/scoring';
import { analyzeWorkout, suggestOrder } from '../src/features/training/engine/order';
import { estimateMinutes } from '../src/features/training/engine/time';
import { actionKey, applyToExercises, validateAction } from '../src/features/coach/actions';
import { cameraGate, isValidGtin, normalizeBarcode, pickScanLens, ScanGate } from '../src/features/food/scanner';
import { currentIndexOf, navItems, nextIndex, nextSetLabel, prevIndex, remainingInfo, workoutProgress , isExerciseDone } from '../src/features/training/workoutNav';
import { chooseSplit, compareSplits } from '../src/features/training/engine/split';
import { estimateRecovery } from '../src/features/training/engine/recovery';
import { healthAvailability, fetchHealthDays, mergedMinutes , READ_TYPES } from '../src/services/health';
import { healthContext, type HealthDay } from '../src/features/health/model';
import { readinessFor } from '../src/features/recovery/derive';
import { applyPalette, colors, paletteFor, resolveScheme, themed } from '../src/theme';
import { buildJournal, dayMode } from '../src/features/journal/build';
import { workoutDebrief } from '../src/features/training/debrief';
import { generateWorkout } from '../src/features/training/generator';
import { resolveToday } from '../src/features/training/today';
import { suggestMeals } from '../src/features/nutrition/suggest';
import { detectSafety } from '../src/features/coach/safety';
import { localCoach } from '../src/features/coach/local/engine';
import { KB } from '../src/features/coach/local/kb';
import { extractFacts } from '../src/features/coach/local/memory';
import { readLabs } from '../src/features/coach/local/labs';
import { keyHit } from '../src/features/coach/local/text';
import { localizeWorkoutName } from '../src/features/training/names';
import { getExercise, EXERCISES } from '../src/data/exercises';
import { addDays, today, weekdayIndex , formatHours, formatSleep , startOfWeek } from '../src/utils/date';
import { foodAvoidance, healthTraining, parseLimitText } from '../src/features/profile/health';
import { setLimits } from '../src/features/training/engine/volume';
import { sessionEnergy, roundKcal } from '../src/features/training/energy';
import { comparePeriods, progressNarrative } from '../src/features/progress/series';
import { analyzeProgram } from '../src/features/training/adaptPlan';
import { goalProgress } from '../src/features/progress/goal';
import { techniqueFor } from '../src/features/exercises/technique';
import { KB_SOURCES } from '../src/features/coach/local/kbSources';
import { BRAND } from '../src/config/brand';
import { estimateMaintenance } from '../src/features/science/maintenance';
import { DEFAULT_GYM, equipmentStep, isAchievable, plateLayout, roundToEquipment } from '../src/features/training/equipment';
import { warmupPlan , warmupSets, platesPerSide } from '../src/features/training/warmup';
import { autoregulate } from '../src/features/training/autoreg';
import { missedWorkoutProposal, muscleOverlap } from '../src/features/training/schedule';
import { lastPortion, usualMeal , frequentProducts, sameMealYesterday } from '../src/features/nutrition/quick';
import { dedupeWorkouts, pickDailyWeight, stepsFromSources } from '../src/features/health/dedupe';
import { measurementDue } from '../src/features/progress/reminders';
import { migrateCheckins } from '../src/stores/checkins';
import { localInsights } from '../src/features/coach/insights';
import { macrosFor, sumFiber, sumMacros, fiberLabel } from '../src/features/nutrition/status';
import { bodyNarrative, bodyTrend, rollingAverage7, waistTrend } from '../src/features/science/bodyTrend';
import { decideCalories } from '../src/features/science/calories';
import { stepGoal } from '../src/features/science/steps';
import { CATEGORY_LABEL, categoryForScore, sleepBaseline, sleepMinutesOf, withSleep } from '../src/features/science/recovery';
import { dayInsights } from '../src/features/science/insights';
import { buildDaySummary, dayMarkers } from '../src/features/day/summary';
import { healthUiState } from '../src/features/health/state';
import { LOCAL_FOODS } from '../src/data/foods';
import { mapOffProduct } from '../src/services/foodApi';
import { PICKER_CATALOG, joinItems, splitItems, toggleItem } from '../src/features/profile/pickerCatalog';

import { checkDeload } from '../src/features/training/deload';
import { lastWeekSummary } from '../src/features/progress/weekly';

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
  assert.ok(plan.splitChoice?.reasons.some((r) => r.includes('Выбран формат')), 'объяснение выбора');
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
  // В node нативного модуля нет (как в сборке без HealthKit): статус «модуль отсутствует», чтение — пустое, без исключений
  assert.equal(healthAvailability(), 'module_missing');
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
  // Регрессия Render Error в Expo Go: RN замораживает стили, отданные в нативную часть.
  // Смена темы не должна их мутировать — должны появляться новые объекты.
  const frozen = st.box;
  Object.freeze(frozen);
  assert.doesNotThrow(() => applyPalette('light', 'orange'));
  assert.notEqual(st.box, frozen, 'новый объект для новой темы');
  assert.equal(st.box.borderColor, paletteFor('light', 'orange').accent);
  assert.equal(frozen.borderColor, dark.accent, 'старый объект не тронут');
  applyPalette('dark', 'lime');
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

test('Локальный коуч: отвечает без сервера по тренировкам, питанию и медицине', () => {
  const profile = excludeExercise(base, 'leg_press');
  const plan = generatePlan(profile);
  const todayW = resolveToday({ date: today(), plan, sessions: [] });
  const target = computeNutritionTarget(profile);
  const ask = (question: string) => localCoach({ question, profile, target, entries: [], recentProducts: [], todayW, insights: [], sessions: [], weights: [], adjustments: [], plan, checkins: {} });
  const protein = ask('Сколько мне белка?');
  assert.equal(protein.intent, 'kb:protein');
  assert.ok(protein.text.includes(String(target.protein)) || /г/.test(protein.text));
  const sub = ask('Чем заменить присед?');
  assert.equal(sub.intent, 'exercise_sub');
  assert.ok(!sub.text.includes('Жим ногами'), 'исключённое упражнение не предлагается');
  const sick = ask('можно ли тренироваться при простуде');
  assert.equal(sick.intent, 'kb:sick');
  assert.ok(sick.text.includes('врач'));
  assert.equal(ask('у меня температура 38').intent, 'kb:sick');
  assert.equal(ask('расскажи про стероиды курс').intent, 'kb:aas_risks');
  assert.equal(ask('Разбери мою неделю').intent, 'week');
  assert.equal(ask('сколько креатина пить').intent, 'kb:creatine');
  assert.equal(ask('плохо спал что делать').intent, 'kb:sleep');
  // База знаний: у каждой статьи уникальный id и непустой ответ
  assert.equal(new Set(KB.map((k) => k.id)).size, KB.length);
  for (const k of KB) assert.ok(k.answer({ weightKg: 80, goal: 'bulk', proteinG: 160, kcal: 2800, level: 'intermediate' }).length > 40, k.id);
});

test('Тренер: «что мне сегодня делать» — план дня без обязательного чек-ина, с кнопкой «Начать»', () => {
  const plan = generatePlan(base);
  const target = computeNutritionTarget(base);
  // День с тренировкой: ищем ближайшую дату, где по плану тренировка
  let date = today();
  for (let i = 0; i < 7 && plan.schedule[weekdayIndex(date)] === null; i++) date = addDays(date, 1);
  const todayW = resolveToday({ date, plan, sessions: [] });
  const r = localCoach({ question: 'Что мне сегодня делать?', profile: base, target, entries: [], recentProducts: [], todayW, insights: [], sessions: [], weights: [], adjustments: [], plan, checkins: {} });
  assert.equal(r.intent, 'today');
  assert.ok(r.text.includes(todayW.template!.name), 'называет тренировку');
  assert.ok(!/чек-ин, четыре|Пройди утренний чек-ин/i.test(r.text), 'не требует чек-ин');
  assert.ok(r.actions.some((a) => a.type === 'start_today'));
});

test('Тренер: программа на зону мышц учитывает исключения и даёт кнопки «Начать» и «В план»', () => {
  const profile = excludeExercise(base, 'incline_db_press');
  const plan = generatePlan(profile);
  const ask = (question: string) => localCoach({ question, profile, target: computeNutritionTarget(profile), entries: [], recentProducts: [], todayW: resolveToday({ date: today(), plan, sessions: [] }), insights: [], sessions: [], weights: [], adjustments: [], plan, checkins: {} });
  const r = ask('хочу упражнение на верх груди');
  assert.equal(r.intent, 'target');
  assert.ok(!/1\. \*\*Жим гантелей на наклонной/.test(r.text), 'исключённое не первым');
  const start = r.actions.find((a) => a.type === 'start_custom_workout');
  assert.ok(start && !start.params.exerciseIds!.includes('incline_db_press'));
  assert.ok(r.actions.some((a) => a.type === 'add_to_plan'));
  assert.equal(ask('как накачать ширину спины').intent, 'target');
  assert.equal(ask('упражнения на низ пресса').intent, 'target');
  // Создание своего упражнения
  const c = ask('создай упражнение жим гантелей на полу');
  assert.equal(c.intent, 'create_exercise');
  const ex = c.actions[0].params.exercise!;
  assert.equal(ex.category, 'chest');
  assert.ok(ex.custom && ex.equipment.includes('dumbbell'));
});

test('Тренер: фармакология — без доз и схем; анализы — разбор чисел; общий вопрос — не тревога', () => {
  const plan = generatePlan(base);
  const ask = (question: string) => localCoach({ question, profile: base, target: computeNutritionTarget(base), entries: [], recentProducts: [], todayW: resolveToday({ date: today(), plan, sessions: [] }), insights: [], sessions: [], weights: [], adjustments: [], plan, checkins: {} });
  for (const q of ['сколько колоть тестостерон на массу', 'распиши курс на сушку', 'какая дозировка гормона роста']) {
    const r = ask(q);
    assert.equal(r.intent, 'pharma_refusal', q);
    assert.ok(!/\d+\s*мг/.test(r.text), 'никаких доз');
  }
  assert.equal(ask('кленбутерол для сушки').intent, 'kb:fatburner_drugs');
  const labs = ask('ттг 5.2, ферритин 18, витамин д 45');
  assert.equal(labs.intent, 'labs');
  assert.match(labs.text, /ТТГ 5,2/);
  assert.match(labs.text, /⬇️ \*\*Ферритин/);
  assert.match(labs.text, /✅ \*\*Витамин D/);
  assert.equal(readLabs('сахар 20 грамм в день', 'male').length, 0, 'граммы — не анализ');
  assert.equal(detectSafety('можно ли тренироваться при аритмии'), 'none');
  assert.equal(detectSafety('у меня аритмия сейчас'), 'emergency');
  assert.equal(ask('можно ли тренироваться при аритмии').intent, 'kb:blood_pressure');
  assert.equal(ask('низкий тестостерон симптомы').intent, 'kb:low_t');
  assert.equal(ask('у меня гастрит что есть').intent, 'kb:gastritis_reflux');
  assert.equal(ask('привет').intent, 'greeting');
  assert.ok(KB.length >= 130, `в базе ${KB.length} статей`);
});

test('Тренер: память — факты из сообщений и их учёт в ответах', () => {
  const d = today();
  const facts = [...extractFacts('У меня гипотиреоз, пью эутирокс. Я не ем рыбу.', d), ...extractFacts('болит правое плечо при жиме', d), ...extractFacts('можно ли пить кофе?', d)];
  assert.deepEqual(facts.map((f) => f.category), ['health', 'food', 'injury']);
  const memory = facts.map((f, i) => ({ ...f, id: `m${i}`, createdAt: Date.now(), source: 'user' as const }));
  const plan = generatePlan(base);
  const ask = (question: string, previousQuestion?: string) => localCoach({ question, profile: base, target: computeNutritionTarget(base), entries: [], recentProducts: [], todayW: resolveToday({ date: today(), plan, sessions: [] }), insights: [], sessions: [], weights: [], adjustments: [], plan, checkins: {}, memory, previousQuestion });
  const m = ask('что ты обо мне помнишь');
  assert.equal(m.intent, 'memory');
  assert.match(m.text, /гипотиреоз/);
  assert.match(ask('ттг это что').text, /Учитываю, что ты рассказывал: «У меня гипотиреоз/);
  // Уточнение к прошлому вопросу
  assert.match(ask('а если дома?', 'упражнения на ягодицы').intent, /target/);
  assert.ok(keyHit('как накачать ширину спины', 'ширин спин'));
  assert.ok(!keyHit('температура 38', 'темп повтор'));
});

test('Русификация: старые названия тренировок переводятся', () => {
  assert.equal(localizeWorkoutName('Upper A'), 'Верх А');
  assert.equal(localizeWorkoutName('Full Body C'), 'Всё тело В');
  assert.equal(localizeWorkoutName('Push'), 'Жимовая');
  assert.equal(localizeWorkoutName('Своя тренировка'), 'Своя тренировка');
  const plan = generatePlan(base);
  for (const t of plan.templates) assert.ok(!/[A-Za-z]/.test(t.name), t.name);
});


// ─── Этап RYNJI ──────────────────────────────────────────────────────────────

test('Бренд: название хранится в одном месте', () => {
  assert.equal(BRAND, 'RYNJI');
});

test('Здоровье: свободный текст → ограничения движений (не диагноз)', () => {
  const sh = parseLimitText('Правое плечо — больно в жиме над головой');
  assert.equal(sh.length, 1);
  assert.equal(sh[0].area, 'shoulder');
  assert.ok(sh[0].movements.includes('overhead_press'));
  const back = parseLimitText('протрузия L5');
  assert.equal(back[0].area, 'lower_back');
  assert.ok(back[0].movements.includes('heavy_axial'), 'зона без движений → типичные провокаторы');
  assert.equal(parseLimitText('колени в порядке').length, 0, 'отрицание не создаёт ограничение');
  const doc = parseLimitText('без осевой нагрузки 3 месяца', 'doctor');
  assert.equal(doc[0].source, 'doctor');
  assert.ok(doc[0].movements.includes('heavy_axial'));
  assert.equal(parseLimitText('паховая грыжа').filter((l) => l.area === 'lower_back').length, 0, 'паховая грыжа — не позвоночник');
});

test('Здоровье влияет на план: травма убирает движения, давление — без отказа', () => {
  const p = { ...base, health: { injuries: 'Плечо болит при жиме над головой', chronic: 'гипертония', painfulMovements: 'глубокий присед', medical: '', allergies: [], intolerances: [], forbiddenFoods: [], other: '' } };
  const prefs = getPrefs(p);
  assert.ok(prefs.limitations.some((l) => l.area === 'shoulder' && l.id.startsWith('auto_')));
  assert.equal(checkAllowed(getExercise('ohp')!, p, prefs).ok, false, 'жим стоя не назначается');
  assert.equal(checkAllowed(getExercise('back_squat')!, p, prefs).ok, false, 'глубокий присед не назначается');
  const plan = generatePlan(p);
  const ids = plan.templates.flatMap((t) => t.exercises.map((e) => e.exerciseId));
  assert.ok(!ids.includes('ohp') && !ids.includes('back_squat'), ids.join(','));
  assert.ok(plan.templates.every((t) => t.exercises.every((e) => e.targetRir >= 2)), 'гипертония: запас ≥2 повтора');
  assert.ok(plan.notes?.some((n) => /давлени/.test(n)));
  assert.equal(healthTraining(p).minRir, 2);
  // производные ограничения не записываются в сохранённые предпочтения
  assert.equal(withPrefs(p, { setStyle: 2 }).training!.limitations.length, 0);
});

test('Здоровье влияет на питание: аллергены и непереносимости не попадают в подбор', () => {
  const p = { ...base, likedFoods: ['Творог'], health: { injuries: '', chronic: '', painfulMovements: '', medical: '', allergies: ['Творог'], intolerances: ['Лактоза'], forbiddenFoods: [], other: '' } };
  const fa = foodAvoidance(p);
  assert.ok(fa.restrictions.includes('lactose'));
  const r = suggestMeals({ remaining: { kcal: 900, protein: 60, fat: 25, carbs: 90 }, profile: p, todayEntries: [], recentProducts: [] });
  const names = r.options.flatMap((o) => o.items.map((i) => i.product.name.toLowerCase()));
  assert.ok(names.length > 0);
  assert.ok(!names.some((x) => /творог|молок|кефир|йогурт|скир/.test(x)), names.join(', '));
});

test('Подходы: новое упражнение — 2 подхода, пять подходов не назначаются', () => {
  const l = setLimits('auto', 'intermediate');
  assert.equal(l.start('main'), 2);
  assert.ok(l.max('main') <= 4 && l.softMax('main') <= 4);
  for (const lvl of ['beginner', 'intermediate', 'advanced'] as const) {
    const plan = generatePlan({ ...base, level: lvl });
    const max = Math.max(...plan.templates.flatMap((t) => t.exercises.map((e) => e.sets)));
    assert.ok(max <= 4, `${lvl}: максимум ${max} подходов`);
  }
});

test('Калории тренировки: оценка по MET без псевдоточности; часы — приоритет', () => {
  const t0 = new Date(`${today()}T18:00:00`).getTime();
  const mk = (min: number, feel?: 'hard' | 'ok') => ({ id: `s${min}`, weight: 80, reps: 8, done: true, completedAt: t0 + min * 60000, feel });
  const s: WorkoutSession = {
    id: 'w1', date: today(), name: 'Тест', focus: '', source: 'custom', startedAt: t0, finishedAt: t0 + 50 * 60000, volumeFactor: 1, status: 'completed',
    exercises: [
      { id: 'a', exerciseId: 'back_squat', plannedSets: 3, repMin: 6, repMax: 10, targetRir: 2, restSec: 180, sets: [mk(5, 'hard'), mk(10, 'hard'), mk(15, 'hard')] },
      { id: 'b', exerciseId: 'lateral_raise', plannedSets: 3, repMin: 12, repMax: 20, targetRir: 1, restSec: 60, sets: [mk(30), mk(32), mk(34)] },
    ],
  };
  const e = sessionEnergy(s, 80, {});
  assert.equal(e.source, 'estimate');
  assert.ok(e.kcal >= 150 && e.kcal <= 400, `оценка ${e.kcal}`);
  assert.equal(e.kcal % 5, 0, 'округлено');
  assert.ok(e.perExercise.back_squat > e.perExercise.lateral_raise, 'тяжёлый присед дороже махов');
  const h: Record<string, HealthDay> = { [today()]: { date: today(), workouts: [{ start: t0 + 60000, minutes: 49, kcal: 312, strength: true }] } };
  const m = sessionEnergy(s, 80, h);
  assert.equal(m.source, 'health');
  assert.equal(m.kcal, 310);
  assert.equal(roundKcal(137.42), 135);
});

test('Прогресс: сравнение периодов и вывод без причинности', () => {
  const weights: WeightEntry[] = [];
  for (let i = 60; i >= 0; i--) weights.push({ id: `w${i}`, date: addDays(today(), -i), kg: 80 + (i % 3) * 0.05, createdAt: 0 });
  const metrics = [
    { id: 'm1', date: addDays(today(), -40), kind: 'waist' as const, value: 86 },
    { id: 'm2', date: addDays(today(), -2), kind: 'waist' as const, value: 84.5 },
  ];
  const sess = (d: number, w: number): WorkoutSession => ({ id: `s${d}`, date: addDays(today(), -d), name: 'A', focus: '', source: 'plan', startedAt: Date.now() - d * 86400000, finishedAt: Date.now() - d * 86400000 + 3600000, volumeFactor: 1, status: 'completed', exercises: [{ id: 'x', exerciseId: 'bench_press', plannedSets: 2, repMin: 6, repMax: 10, targetRir: 2, restSec: 120, sets: [set(w, 8), set(w, 8)] }, { id: 'y', exerciseId: 'back_squat', plannedSets: 2, repMin: 6, repMax: 10, targetRir: 2, restSec: 120, sets: [set(w + 20, 8)] }] });
  const sessions = [sess(45, 80), sess(38, 80), sess(10, 85), sess(3, 87.5)];
  const c = comparePeriods({ days: 30, weights, metrics, sessions, entries: [] });
  assert.ok(c.weight && Math.abs(c.weight.delta) < 0.3);
  assert.equal(c.waist?.delta, -1.5);
  assert.ok((c.strengthPct ?? 0) > 2);
  const text = progressNarrative(c)!;
  assert.match(text, /вес почти не изменился, но талия уменьшилась на 1,5 см, а силовые выросли/);
  assert.ok(!/(потому|из-за|благодаря)/.test(text), 'без причинно-следственных слов');
});

test('Адаптация программы: пропуски → предложение с объяснением, не применяется само', () => {
  const plan = generatePlan({ ...base, daysPerWeek: 5 });
  const sessions: WorkoutSession[] = [];
  for (let w = 0; w < 4; w++) for (const d of [1, 3]) sessions.push({ id: `s${w}${d}`, date: addDays(today(), -(w * 7 + d)), name: 'A', focus: '', source: 'plan', startedAt: Date.now() - (w * 7 + d) * 86400000, finishedAt: Date.now(), volumeFactor: 1, status: 'completed', exercises: [] });
  const props = analyzeProgram({ profile: { ...base, daysPerWeek: 5 }, plan, sessions, checkins: {} });
  assert.ok(props.length >= 1);
  assert.equal(props[0].change.daysPerWeek, 2);
  assert.ok(props[0].why[0].includes('3 недели'));
  if (props[0].kind === 'split') assert.match(props[0].splitWhy ?? '', /Всё тело/);
  assert.equal(analyzeProgram({ profile: base, plan, sessions: sessions.slice(0, 2), checkins: {} }).length, 0, 'мало истории — без выводов');
});

test('Тренер советует сам: белок ниже цели несколько дней, отказ от совета учитывается', () => {
  const plan = generatePlan(base);
  const target = computeNutritionTarget(base);
  const entries = [1, 2, 3].map((i) => ({ id: `e${i}`, date: addDays(today(), -i), productId: 'local:rice_cooked', name: 'Рис', grams: 800, macros: { kcal: 1100, protein: 40, fat: 5, carbs: 230 }, meal: 'lunch' as const, createdAt: 0 }));
  const args = { profile: base, todayW: resolveToday({ date: today(), plan, sessions: [] }), sessions: [], entries, target, weights: [], adjustments: [], plan, checkins: {}, hour: 10 };
  const tips = localInsights(args);
  const protein = tips.find((t) => t.key === 'protein_low_days');
  assert.ok(protein && /белок ниже цели/.test(protein.text));
  const after = localInsights({ ...args, advice: [{ key: 'protein_low_days', date: today(), text: '', status: 'dismissed', at: 0 }] });
  assert.ok(!after.some((t) => t.key === 'protein_low_days'), 'сегодня отклонён — не повторяем');
});

test('Тренер: вопрос о программе — объяснение формата под пользователя', () => {
  const plan = generatePlan(base);
  const r = localCoach({ question: 'подходит ли мне мой сплит?', profile: base, target: computeNutritionTarget(base), entries: [], recentProducts: [], todayW: resolveToday({ date: today(), plan, sessions: [] }), insights: [], sessions: [], weights: [], adjustments: [], plan, checkins: {} });
  assert.equal(r.intent, 'program');
  assert.match(r.text, /Сейчас:/);
});

test('Техника: положение, амплитуда, дыхание и стабилизаторы для каждого упражнения', () => {
  for (const ex of EXERCISES) {
    const t = techniqueFor(ex);
    assert.ok(t.setup.length && t.range && t.breathing && t.safety.length, ex.id);
    assert.ok(!t.stabilizers.some((m) => ex.primary.includes(m) || ex.secondary.includes(m)), `${ex.id}: стабилизатор не дублирует рабочие мышцы`);
  }
  assert.ok(techniqueFor(getExercise('back_squat')!).stabilizers.includes('abs'));
});

test('Источники: у ключевых тем есть проверенные первоисточники', () => {
  for (const id of ['protein', 'creatine', 'volume', 'sleep', 'vitamin_d']) {
    assert.ok(KB_SOURCES[id]?.refs?.length, id);
    for (const r of KB_SOURCES[id].refs!) assert.match(r.url, /^https:\/\//);
  }
  assert.ok(Object.keys(KB_SOURCES).every((id) => KB.some((e) => e.id === id)), 'источники привязаны к существующим статьям');
});

test('Прогресс к цели: целевой вес и честное «нет данных»', () => {
  const ws: WeightEntry[] = [{ id: 'a', date: addDays(today(), -30), kg: 90, createdAt: 0 }, { id: 'b', date: today(), kg: 88, createdAt: 0 }];
  const g = goalProgress({ ...base, goal: 'cut', targetWeightKg: 85 }, ws);
  assert.ok(g.pct !== null && g.pct > 0 && g.pct < 1);
  assert.match(g.headline, /→ 85,0 кг/);
  assert.equal(goalProgress(base, []).pct, null);
});

test('Сложность подхода: «До отказа» считается тяжёлым для прогрессии', () => {
  const ex = getExercise('bench_press')!;
  const hist = [{ date: addDays(today(), -3), repMin: 6, repMax: 10, sets: [set(80, 10, { feel: 'max', rir: 0 }), set(80, 10, { feel: 'max', rir: 0 }), set(80, 10, { feel: 'max', rir: 0 })] }];
  const r = recommend({ exercise: ex, plannedSets: 3, repMin: 6, repMax: 10, targetRir: 2, history: hist });
  assert.equal(r.action, 'hold', 'до отказа на верхней границе — сначала закрепить вес');
});

// ─── Научный слой и новые сценарии ──────────────────────────────────────────

test('Калории: Mifflin–St Jeor — эталонный расчёт и клетчатка 14 г/1000 ккал', () => {
  // Муж., 30 лет, 180 см, 80 кг: 800 + 1125 − 150 + 5 = 1780
  assert.equal(bmrMifflin({ sex: 'male', age: 30, heightCm: 180 }, 80), 1780);
  assert.equal(bmrMifflin({ sex: 'female', age: 30, heightCm: 165 }, 60), 600 + 1031.25 - 150 - 161);
  const t = computeNutritionTarget(base);
  assert.ok(t.fiber && t.fiber === fiberTarget(t.kcal), 'клетчатка в цели');
  assert.equal(fiberTarget(2000), 30);
  assert.equal(fiberTarget(1000), 20, 'не ниже 20 г');
});

test('Макросы: белок 1,6–2,2 г/кг, жиры в AMDR 20–35%, сумма сходится с калориями', () => {
  for (const goal of ['bulk', 'cut', 'maintain', 'recomp'] as const) {
    const t = computeNutritionTarget({ ...base, goal });
    assert.ok(t.protein / base.weightKg >= 1.6 - 1e-9 && t.protein / base.weightKg <= 2.3, `${goal} белок ${t.protein}`);
    const fatPct = (t.fat * 9) / t.kcal;
    assert.ok(fatPct >= 0.2 - 0.01 && fatPct <= 0.35 + 0.01, `${goal} жиры ${fatPct}`);
    const sum = t.protein * 4 + t.fat * 9 + t.carbs * 4;
    assert.ok(Math.abs(sum - t.kcal) / t.kcal < 0.04, `${goal}: ${sum} vs ${t.kcal}`);
  }
});

test('Тренд веса: 7-дневное среднее требует ≥3 взвешиваний; одно взвешивание не меняет решения', () => {
  const ref = today();
  assert.equal(rollingAverage7([{ id: '1', date: ref, kg: 80, createdAt: 0 }], ref), null);
  const w3: WeightEntry[] = [0, -2, -4].map((d, i) => ({ id: String(i), date: addDays(ref, d), kg: 80 + i * 0.2, createdAt: 0 }));
  assert.equal(rollingAverage7(w3, ref)?.kg, 80.2);
  // Скачок одного дня +1,5 кг почти не двигает EMA-тренд
  const ws: WeightEntry[] = Array.from({ length: 21 }, (_, i) => ({ id: `w${i}`, date: addDays(ref, -20 + i), kg: 80, createdAt: 0 }));
  ws[20] = { ...ws[20], kg: 81.5 };
  const tr = weightTrend(ws);
  assert.ok(tr[tr.length - 1].trend < 80.2, `тренд ${tr[tr.length - 1].trend}`);
});

test('Тренд талии: регрессия за 6 недель, нужно ≥14 дней между замерами', () => {
  const ref = today();
  const m = (d: number, v: number) => ({ id: `m${d}`, date: addDays(ref, d), kind: 'waist' as const, value: v });
  assert.equal(waistTrend([m(-5, 85), m(0, 85.5)], ref), null, 'мало дней');
  const wt = waistTrend([m(-28, 84), m(-21, 84.5), m(-14, 85), m(-7, 85.5), m(0, 86)], ref)!;
  assert.ok(Math.abs(wt.cmPerWeek - 0.5) < 0.01, String(wt.cmPerWeek));
  assert.ok(Math.abs(wt.changeCm - 2) < 0.05);
  const stable = bodyTrend([], [m(-28, 85), m(0, 85.2)], ref);
  assert.match(bodyNarrative(stable, 'bulk', 0.3).join(' '), /талия практически стабильна/);
});

test('Адаптация калорий (набор): решения маленькие, объяснимые, без +500', () => {
  const baseIn = { goal: 'bulk' as const, targetKgPerWeek: 0.3, waistCmPerWeek: null, waistDays: 0, strength: 'unknown' as const, coverage: 0.9, daysSinceLastChange: 30, bodyWeightKg: 80 };
  assert.equal(decideCalories({ ...baseIn, actualKgPerWeek: null }).action, 'insufficient');
  const inBand = decideCalories({ ...baseIn, actualKgPerWeek: 0.3 });
  assert.equal(inBand.action, 'hold');
  assert.match(inBand.reasons.join(' '), /Средний вес растёт в целевом диапазоне\. Калорийность пока менять не нужно\./);
  const fast = decideCalories({ ...baseIn, actualKgPerWeek: 0.9 });
  assert.equal(fast.action, 'decrease');
  assert.ok(Math.abs(fast.deltaKcal) <= 200 && Math.abs(fast.deltaKcal) >= 100);
  const flatStalled = decideCalories({ ...baseIn, actualKgPerWeek: 0, strength: 'stalled' });
  assert.equal(flatStalled.action, 'increase');
  assert.ok(flatStalled.deltaKcal > 0 && flatStalled.deltaKcal <= 200, 'не +500');
  assert.equal(decideCalories({ ...baseIn, actualKgPerWeek: 0, strength: 'progressing' }).action, 'hold', 'силовые растут — подождать');
  const waist = decideCalories({ ...baseIn, actualKgPerWeek: 0.3, waistCmPerWeek: 0.5, waistDays: 28 });
  assert.equal(waist.action, 'decrease', 'талия растёт непропорционально весу');
  assert.equal(decideCalories({ ...baseIn, actualKgPerWeek: 0.9, daysSinceLastChange: 5 }).action, 'wait', 'не чаще раза в 14 дней');
  assert.equal(Math.abs(decideCalories({ ...baseIn, actualKgPerWeek: 0.9, coverage: 0.3 }).deltaKcal), 100, 'мало данных — минимальный шаг');
});

test('Прогрессия: 50×10,10,10 (8–10) → 52,5 кг; 50×9,9,8 → 50 кг и добрать повторы', () => {
  const ex = { ...getExercise('bench_press')!, increment: 2.5 };
  const h = (reps: number[]) => [{ date: addDays(today(), -3), repMin: 8, repMax: 10, plannedSets: 3, sets: reps.map((r) => set(50, r, { feel: 'ok', rir: 2 })) }];
  const up = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: h([10, 10, 10]) });
  assert.equal(up.action, 'increase');
  assert.equal(up.weight, 52.5);
  assert.equal(up.delta, '+2,5 кг');
  const hold = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: h([9, 9, 8]) });
  assert.equal(hold.weight, 50);
  assert.equal(hold.action, 'reps');
  assert.equal(hold.delta, '+1 повтор');
});

test('Провал: неполная тренировка и неудачное повышение не повышают вес; низкая готовность — без повышения', () => {
  const ex = { ...getExercise('bench_press')!, increment: 2.5 };
  const partial = [{ date: addDays(today(), -3), repMin: 8, repMax: 10, plannedSets: 3, sets: [set(50, 10, { rir: 2 }), set(50, 10, { rir: 2 })] }];
  const r1 = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: partial });
  assert.equal(r1.action, 'hold');
  assert.equal(r1.weight, 50);
  const failedIncrease = [
    { date: addDays(today(), -3), repMin: 8, repMax: 10, plannedSets: 3, sets: [set(52.5, 7), set(52.5, 6), set(52.5, 6)] },
    { date: addDays(today(), -7), repMin: 8, repMax: 10, plannedSets: 3, sets: [set(50, 10, { rir: 2 }), set(50, 10, { rir: 2 }), set(50, 10, { rir: 2 })] },
  ];
  const r2 = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: failedIncrease });
  assert.equal(r2.weight, 50, 'возврат к прежнему весу');
  assert.equal(r2.action, 'decrease');
  const ready = [{ date: addDays(today(), -3), repMin: 8, repMax: 10, plannedSets: 3, sets: [10, 10, 10].map((r) => set(50, r, { rir: 2 })) }];
  for (const band of ['reduce', 'light', 'recover'] as const) {
    const r = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: ready, band });
    assert.ok(r.weight <= 50, `${band}: ${r.weight}`);
    assert.notEqual(r.action, 'increase');
  }
});

test('Питание: суммы КБЖУ и клетчатка — неизвестная клетчатка не равна нулю', () => {
  const e = (kcal: number, fiber?: number) => ({ macros: fiber === undefined ? { kcal, protein: 10, fat: 5, carbs: 20 } : { kcal, protein: 10, fat: 5, carbs: 20, fiber } });
  assert.deepEqual(sumMacros([e(100), e(200)]), { kcal: 300, protein: 20, fat: 10, carbs: 40 });
  assert.deepEqual(sumFiber([e(100), e(200)]), { g: null, complete: false, known: 0 });
  assert.equal(fiberLabel(sumFiber([e(100), e(200)])), '—');
  const mixed = sumFiber([e(100, 3), e(200)]);
  assert.equal(mixed.g, 3);
  assert.equal(mixed.complete, false);
  assert.equal(fiberLabel(mixed), '≥3 г');
  assert.equal(fiberLabel(sumFiber([e(1, 2.5), e(1, 1)])), '4 г');
  // Пересчёт порции: клетчатка только если известна на 100 г
  assert.equal(macrosFor({ kcal: 100, protein: 1, fat: 1, carbs: 1, fiber: 10 }, 50).fiber, 5);
  assert.equal(macrosFor({ kcal: 100, protein: 1, fat: 1, carbs: 1 }, 50).fiber, undefined);
  // Локальная база: овсянка с клетчаткой, плов — без данных
  assert.equal(LOCAL_FOODS.find((f) => f.id === 'local:oats_dry')?.per100.fiber, 10.1);
  assert.equal(LOCAL_FOODS.find((f) => f.id === 'local:plov')?.per100.fiber, undefined);
  // Open Food Facts: fiber_100g есть → берём; нет → undefined
  assert.equal(mapOffProduct({ code: '4600000000003', product_name: 'Хлебцы', nutriments: { 'energy-kcal_100g': 380, proteins_100g: 10, fat_100g: 3, carbohydrates_100g: 70, fiber_100g: 12 } })?.per100.fiber, 12);
  assert.equal(mapOffProduct({ code: '4600000000003', product_name: 'Хлебцы', nutriments: { 'energy-kcal_100g': 380, proteins_100g: 10, fat_100g: 3, carbohydrates_100g: 70 } })?.per100.fiber, undefined);
});

test('Завершение тренировки: после последнего подхода всё выполнено, прогресс 100%', () => {
  const we = (id: string, done: boolean[]): WorkoutExercise => ({ id, exerciseId: 'bench_press', sets: done.map((d, i) => set(50, 8, { id: `${id}${i}`, done: d })), repMin: 8, repMax: 10, targetRir: 2, restSec: 90, plannedSets: done.length } as WorkoutExercise);
  const s = { id: 's', date: today(), name: 'A', startedAt: 0, status: 'active', exercises: [we('a', [true, true]), we('b', [true, false])], volumeFactor: 1 } as unknown as WorkoutSession;
  assert.equal(nextIndex(s, 0), 1);
  assert.ok(workoutProgress(s) < 1);
  s.exercises[1].sets[1].done = true;
  assert.equal(workoutProgress(s), 1);
  assert.ok(s.exercises.every(isExerciseDone), 'кнопка «Завершить тренировку» показывается');
});

test('DaySummary: тренировка, питание, чек-ин, Health и замеры за выбранный день', () => {
  const d0 = addDays(today(), -10);
  const sess = { id: 's1', date: d0, name: 'Верх A', startedAt: new Date(`${d0}T18:00:00`).getTime(), finishedAt: new Date(`${d0}T19:05:00`).getTime(), status: 'completed', volumeFactor: 1, exercises: [{ id: 'we1', exerciseId: 'bench_press', repMin: 8, repMax: 10, targetRir: 2, restSec: 90, plannedSets: 2, sets: [set(60, 10, { rir: 2 }), set(60, 9, { rir: 1 })] }] } as unknown as WorkoutSession;
  const src = {
    sessions: [sess],
    entries: [{ id: 'e1', date: d0, productId: 'local:oats_dry', name: 'Овсянка', grams: 80, macros: { kcal: 300, protein: 10, fat: 5, carbs: 50, fiber: 8 }, meal: 'breakfast' as const, createdAt: 0 }],
    checkins: { [d0]: { date: d0, sleepHours: 7.717, sleepMinutes: 463, sleepQuality: 4 as const, energy: 4 as const, stress: 2 as const, soreness: 2 as const, pain: false, createdAt: 0 } },
    health: { [d0]: { date: d0, steps: 6820, restingHr: 55, hrvMs: 60 } },
    weights: [{ id: 'w', date: d0, kg: 80.4, createdAt: 0 }],
    metrics: [{ id: 'm', date: d0, kind: 'waist' as const, value: 84 }],
  };
  const s = buildDaySummary(d0, src);
  assert.equal(s.workouts.length, 1);
  assert.equal(s.workouts[0].minutes, 65);
  assert.equal(s.workouts[0].workingSets, 2);
  assert.equal(s.workouts[0].exercises[0].sets[1].rir, 1);
  assert.equal(s.nutrition?.kcal, 300);
  assert.equal(s.nutrition?.fiber, 8);
  assert.equal(s.nutrition?.meals[0].slot, 'breakfast');
  assert.equal(s.checkin?.sleepMinutes, 463);
  assert.equal(s.health?.steps, 6820);
  assert.equal(s.weightKg, 80.4);
  assert.deepEqual(s.measurements, [{ kind: 'waist', value: 84 }]);
  assert.equal(buildDaySummary(addDays(d0, 1), src).hasAny, false, 'другой день — пусто');
  const mk = dayMarkers([d0, addDays(d0, 1)], src);
  assert.equal(mk[d0].trained, true);
  assert.equal(mk[addDays(d0, 1)].trained, false);
});

test('Сон: колесо часы+минуты хранит минуты; старые записи без sleepMinutes читаются', () => {
  const old = { sleepHours: 7.5 };
  assert.equal(sleepMinutesOf(old), 450, 'миграция на чтении');
  const c = withSleep({ date: today(), sleepHours: 0, sleepQuality: 3, energy: 3, stress: 3, soreness: 2, pain: false, createdAt: 0 } as DailyCheckIn, 7 * 60 + 43, 'manual');
  assert.equal(c.sleepMinutes, 463);
  assert.equal(formatSleep(c.sleepMinutes), '7 ч 43 мин');
  assert.ok(Math.abs(c.sleepHours - 7.717) < 0.001, 'старое поле синхронно');
  assert.equal(c.sleepSource, 'manual');
  assert.equal(formatHours(7.999), '8:00', 'без «7:60»');
});

test('Шаги: цель от личной базы Apple Health, плавный рост, не ограничиваем тех, кто ходит много', () => {
  const ref = today();
  const hd = (steps: number) => Object.fromEntries(Array.from({ length: 21 }, (_, i) => [addDays(ref, -1 - i), { date: addDays(ref, -1 - i), steps }]));
  const low = stepGoal({ age: 30, profileSteps: 5000, health: hd(5000), ref });
  assert.equal(low.source, 'health');
  assert.equal(low.target, 5500, '+~10%, не скачок до 10 000');
  const high = stepGoal({ age: 30, profileSteps: 5000, health: hd(14000), ref });
  assert.equal(high.target, 14000, 'не просим ходить меньше');
  const noData = stepGoal({ age: 65, profileSteps: 4000, ref });
  assert.equal(noData.source, 'profile');
  assert.deepEqual(noData.benefitRange, [6000, 8000]);
  assert.equal(stepGoal({ age: 30, profileSteps: 2000, ref }).target, 4000, 'минимум 4000');
});

test('Готовность: категории без процентов и причины относительно личной нормы', () => {
  const ref = today();
  const ci = (date: string, sleepHours: number): DailyCheckIn => ({ date, sleepHours, sleepQuality: 3, energy: 3, stress: 3, soreness: 2, pain: false, createdAt: 0 });
  const hist = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [addDays(ref, -1 - i), ci(addDays(ref, -1 - i), 8)]));
  const base8 = sleepBaseline(ref, hist);
  assert.equal(base8, 8);
  const r = computeReadiness({ ...ci(ref, 6), energy: 2 }, { sessions: [], sleepBaseline: base8 });
  assert.ok(r.category && ['reduced', 'low'].includes(r.category), String(r.category));
  assert.ok(r.reasons?.some((x) => /ниже твоей обычной/.test(x)));
  const ins = dayInsights({ readiness: r, sleepBaseline: base8, sleepHours: 6 });
  assert.ok(ins.includes('Сон значительно ниже вашей обычной продолжительности. Сегодня нагрузку повышать не будем.'));
  assert.equal(CATEGORY_LABEL[categoryForScore(90)], 'Высокая');
  assert.equal(sleepBaseline(ref, {}), undefined, 'без истории — нет базы');
});

test('Apple Health: явные состояния без «фальшивого успеха»', () => {
  assert.equal(healthUiState({ av: 'expo_go', enabled: false, lastSyncAt: null, lastError: null, hasData: false }).kind, 'unavailable');
  assert.equal(healthUiState({ av: 'module_missing', enabled: true, lastSyncAt: null, lastError: null, hasData: false }).kind, 'unavailable');
  assert.equal(healthUiState({ av: 'available', enabled: false, lastSyncAt: null, lastError: null, hasData: false }).kind, 'not_connected');
  const err = healthUiState({ av: 'available', enabled: true, lastSyncAt: 1, lastError: 'Error: boom', hasData: true });
  assert.equal(err.kind, 'error');
  assert.equal(err.kind === 'error' && err.detail, 'Error: boom');
  assert.equal(healthUiState({ av: 'available', enabled: true, lastSyncAt: 1, lastError: null, hasData: false }).kind, 'no_permission');
  assert.equal(healthUiState({ av: 'available', enabled: true, lastSyncAt: 5, lastError: null, hasData: true }).kind, 'connected');
  assert.deepEqual([...READ_TYPES].sort(), ['HKCategoryTypeIdentifierSleepAnalysis', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'HKQuantityTypeIdentifierRestingHeartRate', 'HKQuantityTypeIdentifierStepCount', 'HKWorkoutTypeIdentifier'].sort(), 'только нужные разрешения');
});

test('Онбординг: у каждой категории «+» есть каталог; выбор без дублей, свой вариант, текстовые поля', () => {
  for (const k of Object.keys(PICKER_CATALOG) as (keyof typeof PICKER_CATALOG)[]) assert.ok(PICKER_CATALOG[k].popular.length >= 5, k);
  let l = toggleItem([], 'Орехи');
  l = toggleItem(l, 'орехи');
  assert.deepEqual(l, [], 'повторный выбор снимает, регистр не важен');
  l = toggleItem(toggleItem(l, 'Ёжевика'), 'Свой вариант');
  assert.deepEqual(l, ['Ёжевика', 'Свой вариант']);
  assert.deepEqual(splitItems('Плечо, колено;\nпоясница'), ['Плечо', 'колено', 'поясница']);
  assert.equal(joinItems(['Плечо', 'Колено']), 'Плечо, Колено');
});

test('Сканер: один штрихкод = одно событие даже при 30 кадрах/с', () => {
  const g = new ScanGate();
  const hits = Array.from({ length: 30 }, () => g.accept('4006381333931', 'ean13')).filter(Boolean);
  assert.equal(hits.length, 1);
  assert.equal(g.ignored, 29);
  g.retry();
  assert.equal(g.accept('4006381333931', 'ean13'), '4006381333931');
});

test('Старые данные: записи без новых полей открываются', () => {
  const oldEntry = { id: 'x', date: today(), productId: 'p', name: 'Старое', grams: 100, macros: { kcal: 100, protein: 1, fat: 1, carbs: 1 }, meal: 'lunch' as const, createdAt: 0 };
  const s = buildDaySummary(today(), { sessions: [], entries: [oldEntry], checkins: { [today()]: { date: today(), sleepHours: 6.5, sleepQuality: 3, energy: 3, stress: 3, soreness: 3, pain: false, createdAt: 0 } }, weights: [], metrics: [] });
  assert.equal(s.nutrition?.fiber, null);
  assert.equal(s.checkin?.sleepMinutes, 390);
  const oldTarget = { kcal: 2500, protein: 160, fat: 70, carbs: 300 };
  assert.equal((oldTarget as { fiber?: number }).fiber ?? fiberTarget(oldTarget.kcal), 35, 'цель клетчатки для старого плана');
});

test('Миграция чек-инов v1 → v2: минуты сна из часов, повреждённые записи пропускаются', () => {
  const v1 = { byDate: { '2025-01-01': { date: '2025-01-01', sleepHours: 7.25, sleepQuality: 3, energy: 3, stress: 3, soreness: 2, pain: false, createdAt: 1 }, bad: { date: 'x' } } };
  const m = migrateCheckins(v1, 1);
  assert.equal(m.byDate['2025-01-01'].sleepMinutes, 435);
  assert.equal(m.byDate['2025-01-01'].sleepSource, 'manual');
  assert.equal(m.byDate['2025-01-01'].sleepHours, 7.25, 'старое поле сохранено');
  assert.equal(Object.keys(m.byDate).length, 1);
  assert.deepEqual(migrateCheckins(undefined, 1), { byDate: {} });
});

test('Шаг весов учится по истории: стек 5 кг → +5, а не +2,5; мало данных — стандартный шаг', () => {
  const ex = { ...getExercise('bench_press')!, increment: 2.5 };
  const h = (w: number, reps = 10) => ({ date: addDays(today(), -3), repMin: 8, repMax: 10, plannedSets: 2, sets: [set(w, reps, { rir: 2 }), set(w, reps, { rir: 2 })] });
  assert.equal(effectiveIncrement(2.5, [h(50), h(45)]), 5);
  assert.equal(effectiveIncrement(2.5, [h(50)]), 2.5, 'один вес — шаг не выводим');
  assert.equal(effectiveIncrement(2, [h(12.5), h(15)]), 2.5, 'гантели с шагом 2,5');
  assert.equal(effectiveIncrement(2.5, [h(52.5), h(50)]), 2.5);
  const r = recommend({ exercise: ex, plannedSets: 2, repMin: 8, repMax: 10, targetRir: 2, history: [h(50), h(45)] });
  assert.equal(r.weight, 55);
});

// ─── Итерация «меньше ручного ввода» ────────────────────────────────────────

const days = (n: number, ref = today()) => Array.from({ length: n }, (_, i) => addDays(ref, -n + i));
const food = (date: string, kcal: number, meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'lunch', productId = 'p', grams = 100) => ({ id: `${date}-${productId}-${meal}`, date, productId, name: productId, grams, macros: { kcal, protein: 0, fat: 0, carbs: 0 }, meal, createdAt: new Date(`${date}T08:00:00`).getTime() });

test('Персональный maintenance: ест ~2800 и вес стабилен 4 недели → расход ≈ 2800; мало данных → null', () => {
  const ds = days(28);
  const entries = ds.map((d) => food(d, 2800));
  const weights: WeightEntry[] = ds.filter((_, i) => i % 2 === 0).map((d, i) => ({ id: `w${i}`, date: d, kg: 80 + (i % 2 ? 0.3 : -0.3), createdAt: 0 }));
  const m = estimateMaintenance(entries, weights)!;
  assert.ok(m, 'оценка есть');
  assert.ok(Math.abs(m.kcal - 2800) <= 100, String(m.kcal));
  assert.equal(m.confidence, 'high');
  assert.match(m.text, /расход ≈/);
  // Набирает 0,25 кг/нед при 2800 → расход ≈ 2800 − 275
  const gaining: WeightEntry[] = ds.map((d, i) => ({ id: `g${i}`, date: d, kg: 80 + (0.25 / 7) * i, createdAt: 0 }));
  const g = estimateMaintenance(entries, gaining)!;
  assert.ok(Math.abs(g.kcal - 2525) <= 50, String(g.kcal));
  assert.equal(estimateMaintenance(entries.slice(-7), weights), null, '7 дней — мало');
  // Неполные дни (перекус записан, остальное нет) не занижают оценку
  const partial = [...entries, ...days(28).filter((_, i) => i % 9 === 0).map((d) => ({ ...food(d, 300, 'snack', 'x'), id: `x${d}` }))];
  assert.ok(Math.abs(estimateMaintenance(partial, weights)!.kcal - m.kcal) <= 150);
});

test('Калории по тренду веса: плато 3 недели при хорошем дневнике → +150 с понятной причиной', () => {
  const baseIn = { goal: 'bulk' as const, targetKgPerWeek: 0.3, waistCmPerWeek: null, waistDays: 0, strength: 'progressing' as const, coverage: 0.85, daysSinceLastChange: 30, bodyWeightKg: 80 };
  const flat = decideCalories({ ...baseIn, actualKgPerWeek: 0.02, trendDays: 21 });
  assert.equal(flat.deltaKcal, 150);
  assert.match(flat.summary, /Вес практически не меняется 3 нед\. при хорошем соблюдении питания.*Увеличить цель на 150 ккал\./);
  const short = decideCalories({ ...baseIn, actualKgPerWeek: 0.02, trendDays: 12 });
  assert.equal(short.action, 'hold', 'меньше 3 недель и силовые растут — ждём');
  assert.ok(Math.abs(decideCalories({ ...baseIn, strength: 'unknown', actualKgPerWeek: 0.9 }).deltaKcal) <= 200, 'без скачков');
});

test('Калории по весу + талии: понятный итог одной фразой', () => {
  const baseIn = { goal: 'bulk' as const, targetKgPerWeek: 0.3, strength: 'progressing' as const, coverage: 0.9, daysSinceLastChange: 30, bodyWeightKg: 80, trendDays: 21 };
  const ok = decideCalories({ ...baseIn, actualKgPerWeek: 0.3, waistCmPerWeek: 0.05, waistDays: 28 });
  assert.equal(ok.summary, 'Вес растёт в целевом диапазоне, талия стабильна, силовые показатели растут. Калории менять не нужно.');
  const fat = decideCalories({ ...baseIn, strength: 'unknown', actualKgPerWeek: 0.7, waistCmPerWeek: 0.8, waistDays: 28 });
  assert.equal(fat.deltaKcal, -150);
  assert.equal(fat.summary, 'Вес растёт, талия также увеличивается. Снизить цель на 150 ккал.');
});

test('Оборудование: только реальные веса — штанга, гантели, тренажёр, раскладка блинов', () => {
  const bench = getExercise('bench_press')!;
  const db = getExercise('db_bench_press')!;
  const lat = getExercise('lat_pulldown')!;
  assert.equal(roundToEquipment(81.7, bench), 82.5);
  assert.ok(isAchievable(82.5, bench) && !isAchievable(81.7, bench));
  assert.equal(roundToEquipment(23, db, DEFAULT_GYM, 'up'), 24, 'гантели 20 → 22 → 24');
  assert.equal(roundToEquipment(52.5, lat, DEFAULT_GYM, 'up'), 55);
  assert.equal(roundToEquipment(52.5, lat, DEFAULT_GYM, 'down'), 50);
  assert.deepEqual(plateLayout(82.5, bench)?.perSide, [25, 5, 1.25]);
  const myGym = { ...DEFAULT_GYM, plates: [20, 10, 5] };
  assert.equal(plateLayout(82.5, bench, myGym), null, 'без «блинчиков» 1,25 — не набирается');
  assert.equal(roundToEquipment(82.5, bench, myGym), 80);
  assert.equal(equipmentStep(bench, myGym), 10);
  // Прогрессия не рекомендует невыставляемый вес
  const h = [{ date: addDays(today(), -3), repMin: 8, repMax: 10, plannedSets: 2, sets: [set(80, 10, { rir: 2 }), set(80, 10, { rir: 2 })] }];
  assert.equal(recommend({ exercise: bench, plannedSets: 2, repMin: 8, repMax: 10, targetRir: 2, history: h, gym: myGym }).weight, 90);
  const dh = [{ date: addDays(today(), -3), repMin: 8, repMax: 12, plannedSets: 2, sets: [set(22, 12, { rir: 2 }), set(22, 12, { rir: 2 })] }];
  assert.equal(recommend({ exercise: db, plannedSets: 2, repMin: 8, repMax: 12, targetRir: 2, history: dh }).weight, 24);
});

test('Разминка: по весу, опыту, разогреву и привычке; не считается рабочим объёмом', () => {
  const sq = getExercise('back_squat')!;
  assert.deepEqual(warmupPlan({ ex: sq, workWeight: 100 }).map((x) => x.weight), [20, 50, 70, 85]);
  assert.deepEqual(warmupPlan({ ex: sq, workWeight: 100, level: 'beginner' }).map((x) => x.weight), [20, 50, 70]);
  assert.deepEqual(warmupPlan({ ex: sq, workWeight: 100, warmedSimilar: true }), [{ weight: 70, reps: 3 }]);
  assert.deepEqual(warmupPlan({ ex: sq, workWeight: 100, previousCount: 2 }).map((x) => x.weight), [70, 85]);
  assert.deepEqual(warmupPlan({ ex: sq, workWeight: 30 }), [], 'лёгкий вес — без разминки');
  assert.deepEqual(warmupPlan({ ex: getExercise('lateral_raise')!, workWeight: 100 }), [], 'изоляция');
  for (const w of warmupPlan({ ex: sq, workWeight: 97.5 })) assert.ok(isAchievable(w.weight, sq), `${w.weight} выставляется`);
  assert.equal(workingSets([set(20, 10, { warmup: true }), set(100, 5)]).length, 1);
});

test('Авторегуляция: 80×10 @RIR4 → +шаг; 80×6 @RIR0 → снизить; ниже цели, но с запасом — вес оставить', () => {
  const we = (sets: ExerciseSet[]) => ({ id: 'w', exerciseId: 'bench_press', repMin: 8, repMax: 10, targetRir: 2, restSec: 120, plannedSets: 3, sets }) as WorkoutExercise;
  const up = autoregulate(we([set(80, 10, { rir: 4 }), set(80, 0, { done: false }), set(80, 0, { done: false })]), 2.5);
  assert.equal(up?.kind, 'increase');
  assert.equal(up && 'weight' in up ? up.weight : 0, 82.5);
  const down = autoregulate(we([set(80, 6, { rir: 0 }), set(80, 0, { done: false })]), 2.5);
  assert.equal(down?.kind, 'decrease');
  assert.equal(down && 'weight' in down ? down.weight : 0, 75);
  assert.equal(autoregulate(we([set(80, 7, { rir: 3 }), set(80, 0, { done: false })]), 2.5)?.kind, 'keep');
  assert.equal(autoregulate(we([set(80, 9, { rir: 2 }), set(80, 0, { done: false })]), 2.5), null, 'по плану');
  assert.equal(autoregulate(we([set(80, 10, { rir: 4 })]), 2.5), null, 'подходов не осталось');
});

test('Готовность осторожно: один HRV ниже базы — по плану; совокупность признаков — облегчение', () => {
  const c: DailyCheckIn = { date: today(), sleepHours: 7.8, sleepQuality: 4, energy: 4, stress: 2, soreness: 2, pain: false, hrvMs: 40, createdAt: 0 };
  const one = computeReadiness(c, { sessions: [], hrvBaseline: 62, sleepBaseline: 7.8 });
  assert.equal(one.band, 'go');
  assert.match(one.headline, /Один показатель/);
  const many = computeReadiness({ ...c, sleepHours: 5.5, energy: 2, hrvMs: 40 }, { sessions: [], hrvBaseline: 62, sleepBaseline: 7.8 });
  assert.notEqual(many.band, 'go');
  assert.ok(negativeSignals({ ...c, sleepHours: 4.5 }, {}, []) >= 2, 'сон < 5 ч — сильный признак');
});

test('Перенос пропущенной тренировки: последовательность сохраняется, те же мышцы не подряд', () => {
  const plan = generatePlan({ ...base, daysPerWeek: 4 });
  // Найти тренировочный день, за которым следует отдых, и день отдыха после тренировки
  let slotThenRest: string | undefined;
  let restAfterSlot: string | undefined;
  for (let i = 0; i < 14; i++) {
    const d = addDays(today(), i);
    const s1 = !!plan.schedule[weekdayIndex(d)];
    const s2 = !!plan.schedule[weekdayIndex(addDays(d, 1))];
    if (s1 && !s2 && !slotThenRest) slotThenRest = d;
    if (!s1 && !!plan.schedule[weekdayIndex(addDays(d, -1))] && !restAfterSlot) restAfterSlot = d;
  }
  const evening = missedWorkoutProposal({ date: slotThenRest!, hour: 21, plan, sessions: [], overrides: {} })!;
  assert.equal(evening.kind, 'tomorrow');
  assert.match(evening.text, /Перенести её на завтра\?/);
  assert.equal(evening.overrides[0].mode, 'rest');
  assert.equal(evening.overrides[1].templateId, evening.template.id, 'завтра (по плану отдых) — перенесённая');
  assert.equal(missedWorkoutProposal({ date: slotThenRest!, hour: 10, plan, sessions: [], overrides: {} }), null, 'днём не предлагаем');
  const morning = missedWorkoutProposal({ date: restAfterSlot!, hour: 8, plan, sessions: [], overrides: {} })!;
  assert.equal(morning.kind, 'today');
  assert.equal(morning.overrides[0].templateId, morning.template.id);
  // Пересечение мышц: шаблон сам с собой — 1
  assert.equal(muscleOverlap(plan.templates[0], plan.templates[0]), 1);
});

test('Питание: «обычный завтрак» из повторяющейся комбинации; последняя порция', () => {
  const ref = today();
  const prods = { oats: { id: 'oats', name: 'Овсянка', per100: { kcal: 370, protein: 13, fat: 7, carbs: 60 }, source: 'local' as const }, cott: { id: 'cott', name: 'Творог', per100: { kcal: 120, protein: 17, fat: 5, carbs: 2 }, source: 'local' as const }, egg: { id: 'egg', name: 'Яйцо', per100: { kcal: 155, protein: 13, fat: 11, carbs: 1 }, source: 'local' as const } };
  const es = [1, 2, 3, 4].flatMap((i) => [food(addDays(ref, -i), 300, 'breakfast', 'oats', i === 4 ? 60 : 80), food(addDays(ref, -i), 240, 'breakfast', 'cott', 200)]);
  es.push(food(addDays(ref, -2), 155, 'breakfast', 'egg', 100));
  const u = usualMeal(es as never, prods as never, ref, 'breakfast')!;
  assert.deepEqual(u.items.map((x) => x.product.id).sort(), ['cott', 'oats']);
  assert.equal(u.items.find((x) => x.product.id === 'oats')!.grams, 80, 'медиана порции');
  assert.equal(u.days, 4);
  assert.equal(usualMeal(es.slice(0, 4) as never, prods as never, ref, 'breakfast'), null, 'мало дней');
  const eatenToday = [...es, food(ref, 1, 'breakfast', 'oats'), food(ref, 1, 'breakfast', 'cott')];
  assert.equal(usualMeal(eatenToday as never, prods as never, ref, 'breakfast'), null, 'уже съеден');
  assert.deepEqual(lastPortion('rice', { rice: 180 }, [], { grams: 100 }), { grams: 180, source: 'last' });
  assert.deepEqual(lastPortion('chicken', {}, [food(ref, 1, 'lunch', 'chicken', 220) as never], undefined), { grams: 220, source: 'last' }, 'из истории');
  assert.deepEqual(lastPortion('new', {}, [], { grams: 30 }), { grams: 30, source: 'serving' });
});

test('Apple Health без дублей: сон, тренировки из двух приложений, вес, шаги', () => {
  const h = 3600_000;
  assert.equal(mergedMinutes([[0, 2 * h], [h, 3 * h], [5 * h, 6 * h]]), 240, 'iPhone + Watch — объединение');
  const ws = dedupeWorkouts([{ start: 0, minutes: 60, strength: true }, { start: 5 * 60000, minutes: 50, kcal: 300, strength: false, source: 'Strava' }, { start: 3 * h, minutes: 30, strength: false }]);
  assert.equal(ws.length, 2);
  assert.equal(ws[0].kcal, 300, 'оставлена запись с энергией');
  assert.equal(ws[0].strength, true);
  assert.equal(pickDailyWeight([{ at: 2000, kg: 81 }, { at: 1000, kg: 80.4 }]), 80.4, 'утреннее');
  assert.equal(stepsFromSources([{ source: 'iPhone', count: 5000 }, { source: 'Watch', count: 4800 }, { source: 'iPhone', count: 1000 }]), 6000, 'максимум по источникам, не сумма');
});

test('Напоминания о замерах: вес часто, талия раз в неделю, обхваты реже, одно за раз', () => {
  const ref = today();
  const w = (d: number): WeightEntry => ({ id: `w${d}`, date: addDays(ref, -d), kg: 80, createdAt: 0 });
  assert.equal(measurementDue([], [], ref)?.kind, 'weight');
  assert.equal(measurementDue([w(5), w(6), w(7)], [], ref)?.kind, 'weight', '5 дней без веса');
  assert.equal(measurementDue([w(1), w(2), w(3)], [], ref)?.text, 'Пора обновить замер талии');
  assert.equal(measurementDue([w(1), w(2), w(3)], [{ id: 'm', date: addDays(ref, -3), kind: 'waist', value: 84 }], ref), null);
  assert.equal(measurementDue([w(1), w(2), w(3)], [{ id: 'm', date: addDays(ref, -3), kind: 'waist', value: 84 }, { id: 'a', date: addDays(ref, -30), kind: 'arm', value: 38 }], ref)?.kind, 'arm');
});
