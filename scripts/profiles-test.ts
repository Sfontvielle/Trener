/**
 * Матрица профилей: мужчины и женщины, все цели и уровни, разный возраст, рост и вес, разные места тренировок.
 * Для каждого — 6 недель смоделированной истории (тренировки по плану с прогрессией, вес, питание, чек-ины, Health)
 * и прогон всех расчётов и решений: ничего не падает, нет NaN/undefined в числах и текстах, числа в разумных
 * границах, рекомендации — реально выставляемые веса. Плюс замер скорости на очень длинной истории.
 * Запуск: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DailyCheckIn, ExerciseSet, FoodEntry, GoalType, UserProfile, WeightEntry, WorkoutSession, ExperienceLevel, Sex } from '../src/types';
import { addDays, today } from '../src/utils/date';
import { bmrMifflin, computeNutritionTarget, shiftTargetKcal } from '../src/features/nutrition/targets';
import { generatePlan } from '../src/features/training/planGenerator';
import { resolveToday, plannedTemplateFor } from '../src/features/training/today';
import { historyFor, recommend } from '../src/features/training/progression';
import { getExercise } from '../src/data/exercises';
import { isAchievable, DEFAULT_GYM } from '../src/features/training/equipment';
import { readinessFor } from '../src/features/recovery/derive';
import { reviewCalories } from '../src/features/nutrition/adaptive';
import { estimateMaintenance } from '../src/features/science/maintenance';
import { stepGoal } from '../src/features/science/steps';
import { estimateRecovery } from '../src/features/training/engine/recovery';
import { healthContext, type HealthDay } from '../src/features/health/model';
import { coachToday } from '../src/features/coach/decisions/today';
import { coachAlerts } from '../src/features/coach/decisions/alerts';
import { weeklyDecisions } from '../src/features/coach/decisions/weekly';
import { goalPresets, rateWarning, recommendedPreset } from '../src/features/coach/decisions/goals';
import { compositionSignal } from '../src/features/coach/decisions/composition';
import { explainNutrition } from '../src/features/coach/decisions/macros';
import { decisionsContext } from '../src/features/coach/decisions/context';
import { buildWeeklyReview } from '../src/features/progress/review';
import { analyzeProgram } from '../src/features/training/adaptPlan';
import { localCoach } from '../src/features/coach/local/engine';
import { localInsights } from '../src/features/coach/insights';
import { buildDaySummary } from '../src/features/day/summary';
import { healthMonitor } from '../src/features/health/monitor';
import { statusOf } from '../src/features/labs/analysis';
import { LOCAL_FOODS } from '../src/data/foods';
import { macrosFor as foodMacros } from '../src/features/nutrition/status';

const D = today();
const BAD = /NaN|undefined|Infinity|\[object Object\]|null кг|null ккал/;

function rnd(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function profile(sex: Sex, goal: GoalType, level: ExperienceLevel, age: number, heightCm: number, weightKg: number, location: 'gym' | 'home', days: number): UserProfile {
  return {
    name: sex === 'male' ? 'Иван' : 'Анна', sex, age, heightCm, weightKg, goal, ratePctPerWeek: goal === 'bulk' ? 0.35 : goal === 'cut' ? 0.6 : 0, level, trainingYears: level === 'beginner' ? 0 : level === 'intermediate' ? 2 : 6,
    daysPerWeek: days, sessionMinutes: 60, location,
    equipment: location === 'gym' ? ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar', 'smith'] : ['dumbbell', 'bodyweight', 'band', 'pullupbar'],
    limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
    workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
  };
}

/** 6 недель истории: тренировки по плану с прогрессией, вес по цели, питание, чек-ины, Health */
function simulate(p: UserProfile, seed: number, weeks = 6) {
  const r = rnd(seed);
  const plan = generatePlan(p);
  const sessions: WorkoutSession[] = [];
  const checkins: Record<string, DailyCheckIn> = {};
  const health: Record<string, HealthDay> = {};
  const weights: WeightEntry[] = [];
  const entries: FoodEntry[] = [];
  const target = computeNutritionTarget(p);
  const dir = p.goal === 'bulk' ? 1 : p.goal === 'cut' ? -1 : 0;
  const foods = LOCAL_FOODS.slice(0, 20);
  for (let i = weeks * 7; i >= 1; i--) {
    const d = addDays(D, -i);
    const sleep = Math.round((6 + r() * 2.5) * 4) / 4;
    if (r() > 0.25) checkins[d] = { date: d, sleepHours: sleep, sleepMinutes: Math.round(sleep * 60), sleepQuality: 3, energy: (2 + Math.floor(r() * 3)) as 2, stress: (1 + Math.floor(r() * 4)) as 1, soreness: (1 + Math.floor(r() * 4)) as 1, pain: false, createdAt: 0 };
    health[d] = { date: d, sleepHours: sleep, steps: Math.round(4000 + r() * 8000), restingHr: Math.round(55 + r() * 10), hrvMs: Math.round(40 + r() * 30) };
    if (r() > 0.4) weights.push({ id: `w${i}`, date: d, kg: Math.round((p.weightKg + dir * 0.004 * p.weightKg * ((weeks * 7 - i) / 7) + (r() - 0.5)) * 10) / 10, createdAt: i } as WeightEntry);
    if (r() > 0.2) {
      let kcal = 0;
      let k = 0;
      while (kcal < target.kcal * (0.85 + r() * 0.3) && k < 30) {
        const f = foods[Math.floor(r() * foods.length)];
        const grams = 100 + Math.round(r() * 150);
        const m = foodMacros(f.per100, grams);
        entries.push({ id: `e${i}_${k}`, date: d, meal: (['breakfast', 'lunch', 'dinner', 'snack'] as const)[k % 4], productId: f.id, name: f.name, grams, macros: m, createdAt: k } as FoodEntry);
        kcal += m.kcal;
        k++;
      }
    }
    const tpl = plannedTemplateFor(d, plan, sessions);
    if (tpl && r() > 0.15) {
      const exercises = tpl.exercises.flatMap((pe, j) => {
        const ex = getExercise(pe.exerciseId);
        if (!ex) return [];
        const rec = recommend({ exercise: ex, plannedSets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: historyFor(ex.id, sessions) });
        const w = rec.weight || (ex.bodyweight ? 0 : Math.max(ex.increment * 4, Math.round((p.weightKg * (p.sex === 'male' ? 0.6 : 0.35)) / 2.5) * 2.5));
        const sets: ExerciseSet[] = Array.from({ length: pe.sets }, (_, s) => ({ id: `${i}${j}${s}`, weight: w, reps: Math.max(1, pe.repMin + Math.floor(r() * (pe.repMax - pe.repMin + 2)) - s), rir: Math.floor(r() * 4), done: true }));
        return [{ id: `we${i}${j}`, exerciseId: ex.id, plannedSets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, restSec: pe.restSec, sets }];
      });
      const t = new Date(`${d}T18:00:00`).getTime();
      sessions.push({ id: `s${i}`, date: d, name: tpl.name, focus: tpl.focus, source: 'plan', templateId: tpl.id, startedAt: t, finishedAt: t + 3600000, volumeFactor: 1, status: 'completed', exercises });
    }
  }
  return { plan, sessions, checkins, health, weights, entries, target };
}

function deepCheck(label: string, v: unknown, path = ''): void {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${label}: ${path} = ${v}`);
  else if (typeof v === 'string') assert.ok(!BAD.test(v), `${label}: ${path} = «${v}»`);
  else if (Array.isArray(v)) v.forEach((x, i) => deepCheck(label, x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) deepCheck(label, x, `${path}.${k}`);
}

const SEXES: Sex[] = ['male', 'female'];
const GOALS: GoalType[] = ['bulk', 'cut', 'recomp', 'maintain'];
const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];
const BODIES: [number, number, number][] = [
  [19, 158, 48],
  [30, 172, 68],
  [42, 185, 95],
  [63, 165, 120],
];

test('Матрица профилей (М/Ж × цели × уровни × тела): все расчёты и решения без ошибок, числа в разумных границах', () => {
  let n = 0;
  let seed = 7;
  for (const sex of SEXES) for (const goal of GOALS) for (const level of LEVELS) for (const [age, h, w] of BODIES) {
    const location = (seed++ % 3 === 0 ? 'home' : 'gym') as 'gym' | 'home';
    const p = profile(sex, goal, level, age, h, w, location, 2 + (seed % 5));
    const label = `${sex}/${goal}/${level}/${age}л/${h}см/${w}кг/${location}`;
    const sim = simulate(p, seed);
    const t = sim.target;
    // Питание
    assert.ok(t.kcal >= (sex === 'male' ? 1500 : 1250) && t.kcal <= 6000, `${label}: ккал ${t.kcal}`);
    assert.ok(t.protein >= 50 && t.protein <= 300, `${label}: белок ${t.protein}`);
    assert.ok(t.fat >= 35, `${label}: жиры ${t.fat}`);
    assert.ok(Math.abs(t.protein * 4 + t.fat * 9 + t.carbs * 4 - t.kcal) <= t.kcal * 0.12 || t.carbs === 60, `${label}: КБЖУ не сходятся с калориями`);
    const shifted = shiftTargetKcal(p, t, w, 150, 'тест');
    assert.equal(shifted.kcal, t.kcal + 150);
    // План
    assert.ok(sim.plan.templates.length >= 1, `${label}: план пуст`);
    for (const tpl of sim.plan.templates) {
      assert.ok(tpl.exercises.length >= 2, `${label}: в «${tpl.name}» меньше 2 упражнений`);
      for (const pe of tpl.exercises) {
        const ex = getExercise(pe.exerciseId);
        assert.ok(ex, `${label}: нет упражнения ${pe.exerciseId}`);
        if (location === 'home') assert.ok(!ex!.equipment.some((e) => ['barbell', 'machine', 'cable', 'smith'].includes(e)), `${label}: дома назначено «${ex!.name}»`);
        // Рекомендация следующего веса — реально выставляемый вес
        const rec = recommend({ exercise: ex!, plannedSets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: historyFor(ex!.id, sim.sessions), gym: DEFAULT_GYM });
        assert.ok(rec.weight >= 0 && Number.isFinite(rec.weight), `${label}: вес ${rec.weight}`);
        if (rec.action === 'increase') assert.ok(isAchievable(rec.weight, ex!, DEFAULT_GYM), `${label}: ${ex!.name} ${rec.weight} кг не выставить`);
        assert.ok(!BAD.test(rec.rationale), `${label}: ${rec.rationale}`);
      }
    }
    // Готовность, восстановление, шаги, расход
    const readiness = readinessFor(D, sim.checkins, sim.sessions, sim.health);
    const rec = estimateRecovery({ profile: 'auto', sessions: sim.sessions, checkins: sim.checkins, health: sim.health });
    assert.ok(rec.factor >= 0.85 && rec.factor <= 1.15);
    const steps = stepGoal({ age, profileSteps: 7000, health: sim.health });
    assert.ok(steps.target >= 4000 && steps.target <= 15000);
    const maintenance = estimateMaintenance(sim.entries, sim.weights);
    const review = reviewCalories({ profile: p, weights: sim.weights, entries: sim.entries, adjustments: [], targetKcal: t.kcal, sessions: sim.sessions });
    assert.ok(Math.abs(review.deltaKcal) <= 150, `${label}: шаг калорий ${review.deltaKcal}`);
    // Решения тренера
    const tw = resolveToday({ date: D, plan: sim.plan, sessions: sim.sessions, readiness });
    const coach = coachToday({ date: D, profile: p, today: tw, readiness, checkin: sim.checkins[D], health: sim.health, healthCtx: healthContext(sim.health, D), sessions: sim.sessions, target: t, maintenance, calorieReview: review, steps, signals: [] });
    deepCheck(label, coach);
    for (const d of coach.decisions) assert.ok(d.what && d.confidence, `${label}: решение без «что»/уверенности`);
    const alerts = coachAlerts({ ref: D, goal, targetKgPerWeek: 0.2, bodyWeightKg: w, weights: sim.weights, metrics: [], sessions: sim.sessions, plan: sim.plan, checkins: sim.checkins, health: sim.health, labs: [], signals: [] });
    assert.ok(alerts.length <= 3);
    deepCheck(label, alerts);
    const wr = buildWeeklyReview({ profile: p, plan: sim.plan, target: t, sessions: sim.sessions, entries: sim.entries, weights: sim.weights, metrics: [], checkins: sim.checkins, readiness: (d) => readinessFor(d, sim.checkins, sim.sessions, sim.health)?.score });
    const weekly = weeklyDecisions({ profile: p, plan: sim.plan, target: t, review: wr, calories: review, proposals: analyzeProgram({ profile: p, plan: sim.plan, sessions: sim.sessions, checkins: sim.checkins }), sessions: sim.sessions, health: sim.health, weighIns: sim.weights.length });
    deepCheck(label, weekly);
    deepCheck(label, compositionSignal({ goal, weights: sim.weights, metrics: [], sessions: sim.sessions }));
    deepCheck(label, explainNutrition(p, t, w, maintenance));
    deepCheck(label, goalPresets(goal, level, w));
    recommendedPreset({ goal, level, sex, heightCm: h, weightKg: w });
    rateWarning(goal, level, p.ratePctPerWeek, w);
    assert.ok(!BAD.test(decisionsContext({ coach, alerts, signals: [], labs: [], enhanced: false })));
    deepCheck(label, localInsights({ profile: p, todayW: tw, checkin: sim.checkins[D], readiness, sessions: sim.sessions, entries: sim.entries, target: t, weights: sim.weights, adjustments: [], plan: sim.plan, checkins: sim.checkins }));
    deepCheck(label, buildDaySummary(addDays(D, -1), { sessions: sim.sessions, entries: sim.entries, checkins: sim.checkins, health: sim.health, weights: sim.weights, metrics: [], plan: sim.plan }));
    // Чат: основные вопросы
    for (const q of ['Что мне сегодня делать?', 'Почему такие калории?', 'Сколько мне белка?', 'Чем заменить присед?', 'Почему не повышаем жим лёжа?', 'Разбери мою неделю']) {
      const a = localCoach({ question: q, profile: p, target: t, entries: sim.entries, recentProducts: [], todayW: tw, readiness, insights: [], sessions: sim.sessions, weights: sim.weights, adjustments: [], plan: sim.plan, checkins: sim.checkins, coach });
      assert.ok(a.text.length > 10 && !BAD.test(a.text), `${label}: чат «${q}» → ${a.text.slice(0, 120)}`);
    }
    n++;
  }
  assert.equal(n, 2 * 4 * 3 * 4);
});

test('Женщины vs мужчины: калории ниже при тех же параметрах, свои референсы анализов', () => {
  const m = computeNutritionTarget(profile('male', 'maintain', 'intermediate', 30, 170, 65, 'gym', 3));
  const f = computeNutritionTarget(profile('female', 'maintain', 'intermediate', 30, 170, 65, 'gym', 3));
  assert.equal(Math.round(bmrMifflin({ sex: 'male', age: 30, heightCm: 170 }, 65) - bmrMifflin({ sex: 'female', age: 30, heightCm: 170 }, 65)), 166, 'Mifflin: +5 / −161');
  assert.ok(f.kcal < m.kcal);
  // Гематокрит 44% без референса в бланке: для женщины выше общего ориентира (36–46 → нет), для 47% — да
  const r = { id: 'x', markerId: 'hct', name: 'Гематокрит', value: 47, unit: '%' };
  assert.equal(statusOf(r, 'female'), 'high');
  assert.equal(statusOf(r, 'male'), 'normal');
  // Мониторинг здоровья работает одинаково, без «мужских» допущений
  assert.deepEqual(healthMonitor({ enhanced: true, bp: [], health: {}, labs: [], weights: [], metrics: [], sex: 'female' }), []);
});

test('Скорость: 2 года истории (≈400 тренировок, 9000 записей еды) — расчёты Главной быстрее 300 мс', () => {
  const p = profile('female', 'bulk', 'intermediate', 28, 168, 60, 'gym', 4);
  const sim = simulate(p, 99, 104);
  assert.ok(sim.sessions.length > 250, `${sim.sessions.length} тренировок`);
  const t0 = performance.now();
  const readiness = readinessFor(D, sim.checkins, sim.sessions, sim.health);
  const tw = resolveToday({ date: D, plan: sim.plan, sessions: sim.sessions, readiness });
  const maintenance = estimateMaintenance(sim.entries, sim.weights);
  const review = reviewCalories({ profile: p, weights: sim.weights, entries: sim.entries, adjustments: [], targetKcal: sim.target.kcal, sessions: sim.sessions });
  coachToday({ date: D, profile: p, today: tw, readiness, health: sim.health, sessions: sim.sessions, target: sim.target, maintenance, calorieReview: review, steps: stepGoal({ age: 28, profileSteps: 7000, health: sim.health }), signals: [] });
  coachAlerts({ ref: D, goal: 'bulk', targetKgPerWeek: 0.2, bodyWeightKg: 60, weights: sim.weights, metrics: [], sessions: sim.sessions, plan: sim.plan, checkins: sim.checkins, health: sim.health, labs: [], signals: [] });
  localInsights({ profile: p, todayW: tw, readiness, sessions: sim.sessions, entries: sim.entries, target: sim.target, weights: sim.weights, adjustments: [], plan: sim.plan, checkins: sim.checkins });
  const ms = performance.now() - t0;
  console.log(`  расчёты Главной на 2 годах истории: ${Math.round(ms)} мс`);
  assert.ok(ms < 300, `${Math.round(ms)} мс`);
});
