/**
 * Тесты Coach Engine, анализов и мониторинга здоровья (детерминированная логика, без React Native).
 * Запуск: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BodyMetric, DailyCheckIn, ExerciseSet, LabReport, UserProfile, WeightEntry, WorkoutPlan, WorkoutSession } from '../src/types';
import { addDays, startOfWeek, today } from '../src/utils/date';
import { getExercise } from '../src/data/exercises';
import { matchMarker } from '../src/features/labs/catalog';
import { normalizeUnit, toCanonical } from '../src/features/labs/normalize';
import { detectDate, detectLab, parseLabText, parseLine } from '../src/features/labs/parse';
import { compareWithPrevious, consecutiveRise, healthFlags, interpretResult, markerSeries, statusOf } from '../src/features/labs/analysis';
import { draftFromExtracted, draftFromParsed, draftIssues, parseRefText, reportFromDraft } from '../src/features/labs/report';
import { bpCategory, bpSignals, healthGate, healthMonitor, labSignals, newLabChanges, rhrTrend } from '../src/features/health/monitor';
import type { HealthDay } from '../src/features/health/model';
import { recommend, historyFor } from '../src/features/training/progression';
import { decideCalories, MAX_STEP_KCAL } from '../src/features/science/calories';
import { computeNutritionTarget, shiftTargetKcal } from '../src/features/nutrition/targets';
import { estimateRecovery } from '../src/features/training/engine/recovery';
import { resolveToday } from '../src/features/training/today';
import { coachToday, clockSleep, historyLine } from '../src/features/coach/decisions/today';
import { coachAlerts, MAX_ALERTS, weeklySleep } from '../src/features/coach/decisions/alerts';
import { goalPresets, presetForRate, rateWarning, recommendedPreset } from '../src/features/coach/decisions/goals';
import { compositionSignal, COMPOSITION_CAVEAT, strengthChangePct } from '../src/features/coach/decisions/composition';
import { explainNutrition } from '../src/features/coach/decisions/macros';
import { maintenanceConfidence, progressionConfidence, readinessConfidence } from '../src/features/coach/decisions/confidence';
import { confidenceText } from '../src/features/coach/decisions/types';
import { weeklyDecisions } from '../src/features/coach/decisions/weekly';
import { buildWeeklyReview } from '../src/features/progress/review';
import { reviewCalories } from '../src/features/nutrition/adaptive';

const base: UserProfile = {
  name: 'Тест', sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 3, sessionMinutes: 70, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};
const D = today();
const set = (weight: number, reps: number, rir?: number): ExerciseSet => ({ id: Math.random().toString(36), weight, reps, done: true, rir });
const benchSession = (daysAgo: number, w: number, reps: number[], rir?: number): WorkoutSession => ({
  id: `s${daysAgo}`, date: addDays(D, -daysAgo), name: 'Верх', focus: '', source: 'plan', templateId: 't1', startedAt: Date.now() - daysAgo * 86400000, finishedAt: Date.now() - daysAgo * 86400000 + 3600000, volumeFactor: 1, status: 'completed',
  exercises: [{ id: `we${daysAgo}`, exerciseId: 'bench_press', plannedSets: reps.length, repMin: 8, repMax: 10, targetRir: 2, restSec: 120, sets: reps.map((r) => set(w, r, rir)) }],
});
const plan: WorkoutPlan = {
  id: 'p', createdAt: 0, split: 'fullbody', daysPerWeek: 7, schedule: ['t1', 't1', 't1', 't1', 't1', 't1', 't1'], rotation: ['t1'], name: 'Тест',
  templates: [{ id: 't1', name: 'Верх A', focus: 'Грудь, спина', estMinutes: 50, exercises: [{ exerciseId: 'bench_press', sets: 3, repMin: 8, repMax: 10, targetRir: 2, restSec: 120 }] }],
} as unknown as WorkoutPlan;

// ─── Анализы: разбор, единицы, сопоставление ────────────────────────────────

const INVITRO = `ИНВИТРО
Пациент: Иванов И.И.  Дата рождения: 12.03.1990
Дата взятия образца: 04.10.2026
Телефон: 8 800 200 363 0
Гемоглобин (HGB) 168 г/л 132 - 173
Гематокрит (HCT) 52,4 % 39 - 49 H
Холестерин общий 5,9 ммоль/л < 5,2 H
Холестерин ЛПНП 3,9 ммоль/л < 3,0 H
Холестерин ЛПВП 0,9 ммоль/л > 1,0 L
Аланинаминотрансфераза (АЛТ) 52 Ед/л < 41 H
Тестостерон общий ↑ 38,5 нмоль/л 8,64-29`;

test('Анализы: Инвитро — лаборатория, дата взятия (не дата рождения), строки и флаги', () => {
  const p = parseLabText(INVITRO);
  assert.equal(p.lab, 'Инвитро');
  assert.equal(p.date, '2026-10-04');
  const byId = Object.fromEntries(p.rows.map((r) => [r.markerId, r]));
  assert.equal(byId.hgb.value, 168);
  assert.equal(byId.hct.value, 52.4);
  assert.equal(byId.hct.flag, 'H');
  assert.equal(byId.hct.refLow, 39);
  assert.equal(byId.chol.value, 5.9, 'общий холестерин не путается с ЛПНП');
  assert.equal(byId.ldl.value, 3.9);
  assert.equal(byId.ldl.refHigh, 3.0);
  assert.equal(byId.hdl.flag, 'L');
  assert.equal(byId.alt.unit, 'ед/л');
  assert.equal(byId.testo.flag, 'H', 'стрелка перед значением');
  assert.ok(!p.rows.some((r) => /телефон/i.test(r.name)), 'служебные строки отброшены');
});

test('Анализы: Хеликс и другие бренды — парсер не привязан к лаборатории', () => {
  const t = `Лабораторная служба Хеликс\nДата исследования: 01.09.26\nHematocrit 45.1 % 39.0 - 49.0\nФерритин 85 мкг/л 30-400\nГлюкоза 5,4 ммоль/л 4,1–5,9`;
  const p = parseLabText(t);
  assert.equal(detectLab(t), 'Хеликс');
  assert.equal(p.date, '2026-09-01');
  assert.deepEqual(p.rows.map((r) => r.markerId).sort(), ['ferritin', 'glu', 'hct']);
  // Неизвестная лаборатория — всё равно разбирается
  const other = parseLabText('ООО «Лаборатория здоровья»\nАЛТ 30 U/L 0-41');
  assert.equal(other.lab, undefined);
  assert.equal(other.rows[0].markerId, 'alt');
  assert.equal(other.rows[0].unit, 'ед/л');
  assert.equal(detectDate('Дата рождения 01.01.1990\nРезультат от 15.08.2026'), '2026-08-15');
  assert.equal(parseLine('Стр. 1 из 2'), null);
});

test('Единицы: нормализация и безопасный пересчёт только однозначных единиц', () => {
  assert.equal(normalizeUnit('mmol/L'), 'ммоль/л');
  assert.equal(normalizeUnit('U/L'), 'ед/л');
  assert.equal(normalizeUnit('x10^9/L'), '10^9/л');
  const t = toCanonical('testo', 600, 'нг/дл', 250, 830)!;
  assert.equal(t.unit, 'нмоль/л');
  assert.ok(Math.abs(t.value - 20.82) < 0.05, `600 нг/дл ≈ 20,8 нмоль/л (${t.value})`);
  assert.equal(toCanonical('alt', 30, 'мккат/л'), undefined, 'неизвестная единица — без пересчёта');
  assert.equal(matchMarker('Холестерин ЛПНП')?.id, 'ldl');
  assert.equal(matchMarker('Холестерин общий')?.id, 'chol');
  assert.equal(matchMarker('Гликированный гемоглобин HbA1c')?.id, 'hba1c');
});

test('Черновик → отчёт: оригинал (значение, единица, референс) сохраняется, нормализация рядом', () => {
  const draft = draftFromParsed(parseLabText('Тестостерон общий 600 нг/дл 250 - 830'), { kind: 'text' }, D);
  assert.deepEqual(draftIssues(draft), []);
  const rep = reportFromDraft(draft, 1);
  const r = rep.results[0];
  assert.equal(r.value, 600);
  assert.equal(r.unit, 'нг/дл');
  assert.equal(r.refText, '250 – 830');
  assert.equal(r.normalized?.unit, 'нмоль/л');
  assert.equal(rep.confirmed, true);
  assert.ok(draftIssues({ ...draft, rows: [{ ...draft.rows[0], valueText: 'отр.' }] }).some((x) => x.includes('нет числового')));
  assert.deepEqual(parseRefText('< 41'), { refHigh: 41 });
  // Ответ сервера распознавания: сопоставление и единицы делает приложение
  const x = draftFromExtracted({ lab: 'Хеликс', date: '2026-09-01', rows: [{ name: 'Гематокрит', value: '47,5', unit: '%', refText: '39-49', flag: '' }, { name: 'Гематокрит (HCT)', value: '47', unit: '%', refText: '', flag: '' }] }, { kind: 'image' }, D);
  assert.equal(x.rows.length, 1, 'дубликаты показателя схлопываются');
  assert.equal(x.rows[0].markerId, 'hct');
  assert.equal(x.rows[0].confidence, 'high');
});

const rep = (id: string, date: string, rows: [string, number, string, number?, number?][]): LabReport => ({
  id, date, source: { kind: 'manual' }, confirmed: true, createdAt: Date.parse(date),
  results: rows.map(([markerId, value, unit, refLow, refHigh], i) => ({ id: `${id}${i}`, markerId, name: markerId, value, unit, refLow, refHigh })),
});

test('Анализы: «Что изменилось с прошлого анализа» и история показателя', () => {
  const reports = [
    rep('a', '2026-03-01', [['hct', 47.0, '%', 40, 50], ['ldl', 3.1, 'ммоль/л', undefined, 3.0], ['alt', 30, 'ед/л', undefined, 41]]),
    rep('b', '2026-09-01', [['hct', 49.1, '%', 40, 50], ['ldl', 3.5, 'ммоль/л', undefined, 3.0], ['alt', 31, 'ед/л', undefined, 41], ['ferritin', 90, 'мкг/л', 30, 400]]),
  ];
  const cmp = compareWithPrevious(reports);
  const by = Object.fromEntries(cmp.items.map((c) => [c.markerId, c]));
  assert.equal(by.hct.text, '↑ 2,1 п.п.');
  assert.equal(by.ldl.text, '↑ 0,4');
  assert.equal(by.alt.text, 'без существенных изменений');
  assert.equal(by.ferritin.direction, 'new');
  assert.equal(markerSeries(reports, 'hct').length, 2);
  assert.equal(statusOf(reports[1].results[1]), 'high');
});

test('Анализы: интерпретация без диагнозов, серьёзные пороги, рост три раза подряд', () => {
  const reports = [rep('a', '2026-01-01', [['hct', 48, '%', 40, 50]]), rep('b', '2026-04-01', [['hct', 51, '%', 40, 50]]), rep('c', '2026-07-01', [['hct', 55, '%', 40, 50]])];
  const series = markerSeries(reports, 'hct');
  assert.ok(consecutiveRise(series, 3));
  const { status, findings } = interpretResult(reports[2].results[0], series, 'male');
  assert.equal(status, 'high');
  assert.ok(findings.some((f) => f.level === 'doctor'), 'гематокрит >54% — к врачу (Bhasin 2018)');
  assert.ok(findings.some((f) => /Это не диагноз/.test(f.text)));
  assert.ok(!findings.some((f) => /диагноз:/i.test(f.text)));
  const flags = healthFlags(reports, 'male');
  assert.equal(flags[0].markerId, 'hct');
  // Калий ≥6 — срочно
  const k = healthFlags([rep('k', '2026-07-01', [['k', 6.3, 'ммоль/л', 3.5, 5.1]])], 'male');
  assert.equal(k[0].level, 'urgent');
});

// ─── Мониторинг здоровья (давление, пульс, анализы) ─────────────────────────

const bp = (daysAgo: number, s: number, d: number) => ({ id: `${daysAgo}${s}`, date: addDays(D, -daysAgo), systolic: s, diastolic: d, createdAt: daysAgo });

test('Давление: категории ACC/AHA 2017 и решения по среднему, не по одному измерению', () => {
  assert.equal(bpCategory(118, 76), 'normal');
  assert.equal(bpCategory(125, 78), 'elevated');
  assert.equal(bpCategory(134, 82), 'stage1');
  assert.equal(bpCategory(142, 88), 'stage2');
  assert.equal(bpCategory(185, 100), 'crisis');
  assert.deepEqual(bpSignals([bp(3, 145, 92)]), [], 'одно измерение ≥140 — ещё не вывод');
  const high = bpSignals([bp(5, 144, 92), bp(3, 146, 94), bp(1, 142, 90)]);
  assert.equal(high[0].level, 'doctor');
  assert.ok(/обсудить результат с врачом/.test(high[0].text));
  const crisis = bpSignals([bp(0, 190, 115)]);
  assert.equal(crisis[0].level, 'urgent');
  assert.ok(/103|112/.test(crisis[0].text));
});

test('Пульс покоя: сравнение с личной нормой; «стоп-сигнал» нагрузки при значимых сигналах', () => {
  const h: Record<string, HealthDay> = {};
  for (let i = 0; i <= 35; i++) h[addDays(D, -i)] = { date: addDays(D, -i), restingHr: i <= 6 ? 64 : 55 };
  const t = rhrTrend(h)!;
  assert.equal(t.baseline, 55);
  assert.equal(t.delta, 9);
  const signals = healthMonitor({ enhanced: false, bp: [], health: h, labs: [], weights: [], metrics: [] });
  assert.equal(signals[0].id, 'rhr_rise');
  assert.equal(healthGate(signals).blockIncrease, false, 'monitor — наблюдаем, не блокируем');
  const doc = healthMonitor({ enhanced: false, bp: [bp(5, 150, 95), bp(2, 148, 94)], health: {}, labs: [], weights: [], metrics: [] });
  assert.equal(healthGate(doc).blockIncrease, true);
  assert.equal(healthGate(doc).stop, false);
  assert.equal(healthGate(bpSignals([bp(0, 200, 125)])).stop, true);
});

test('Enhanced: рост наблюдаемых показателей в трёх анализах подряд → обсудить с врачом, без советов по препаратам', () => {
  const reports = [rep('a', addDays(D, -200), [['hgb', 150, 'г/л', 130, 170]]), rep('b', addDays(D, -100), [['hgb', 158, 'г/л', 130, 170]]), rep('c', addDays(D, -10), [['hgb', 168, 'г/л', 130, 170]])];
  const s = labSignals(reports, 'male', true);
  const rise = s.find((x) => x.id === 'lab_rise_hgb')!;
  assert.ok(rise, 'сигнал роста в пределах референса');
  assert.ok(/обсудить динамику с врачом/.test(rise.text));
  const all = JSON.stringify(s);
  assert.ok(!/(доз|курс|цикл|принимайте|снизьте|добавьте|отмените)/i.test(all), 'никаких инструкций по препаратам');
  assert.equal(labSignals(reports, 'male', false).length, 0, 'без Enhanced — только значимые отклонения');
  assert.equal(newLabChanges(reports)?.changed, 1);
});

test('Enhanced: статус не добавляет объём сам по себе — только фактические данные', () => {
  const ck = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [addDays(D, -i), { date: addDays(D, -i), sleepHours: 8, sleepQuality: 4, energy: 4, stress: 2, soreness: 2, pain: false, createdAt: 0 } as DailyCheckIn]));
  const enh = estimateRecovery({ profile: 'enhanced', sessions: [], checkins: ck });
  const std = estimateRecovery({ profile: 'standard', sessions: [], checkins: ck });
  assert.equal(enh.factor, std.factor);
  assert.equal(enh.capacity, std.capacity);
});

// ─── Прогрессия и калории ───────────────────────────────────────────────────

test('Прогрессия: 80×10@2 три раза → 82,5 кг × 8–10; 80×9/8/7 → прогресс повторами; запрет повышения по здоровью', () => {
  const ex = getExercise('bench_press')!;
  const h = historyFor('bench_press', [benchSession(2, 80, [10, 10, 10], 2), benchSession(5, 80, [10, 10, 10], 2), benchSession(9, 80, [10, 10, 10], 2)]);
  const up = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: h });
  assert.equal(up.action, 'increase');
  assert.equal(up.weight, 82.5);
  assert.equal(up.repMin, 8);
  const reps = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: historyFor('bench_press', [benchSession(2, 80, [9, 8, 7], 1)]) });
  assert.equal(reps.action, 'reps');
  assert.equal(reps.weight, 80);
  const held = recommend({ exercise: ex, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, history: h, noIncrease: 'есть показатели здоровья, которые стоит обсудить с врачом.' });
  assert.equal(held.action, 'hold');
  assert.equal(held.weight, 80);
  assert.ok(/врачом/.test(held.rationale));
});

test('Калории: шаг корректировки 100–150 ккал, никогда 500–700', () => {
  const baseIn = { goal: 'bulk' as const, targetKgPerWeek: 0.28, waistCmPerWeek: null, waistDays: 0, strength: 'unknown' as const, coverage: 0.9, daysSinceLastChange: 30, bodyWeightKg: 80, trendDays: 21 };
  for (const r of [-0.5, -0.2, 0, 0.1, 0.6, 0.9, 1.5]) {
    const d = decideCalories({ ...baseIn, actualKgPerWeek: r });
    assert.ok(Math.abs(d.deltaKcal) <= MAX_STEP_KCAL, `темп ${r}: ${d.deltaKcal}`);
    if (d.deltaKcal) assert.ok(Math.abs(d.deltaKcal) >= 100);
  }
  assert.equal(decideCalories({ ...baseIn, actualKgPerWeek: 1.5 }).deltaKcal, -150);
  assert.equal(decideCalories({ ...baseIn, goal: 'cut', targetKgPerWeek: -0.5, actualKgPerWeek: 0.3 }).deltaKcal, -150);
});

test('КБЖУ: изменение калорий сохраняет базу (персональный расход) и пересчитывает макросы', () => {
  const t0 = computeNutritionTarget(base, { observedTdee: 2900, observedConfidence: 'high' });
  assert.equal(t0.source, 'adaptive');
  assert.equal(t0.observedTdee, 2900);
  const t1 = shiftTargetKcal(base, t0, 80, 150, 'вес не растёт');
  assert.equal(t1.kcal, t0.kcal + 150, 'ровно +150, без скачка к формуле');
  assert.equal(t1.protein, t0.protein, 'белок в г/кг не зависит от калорий');
  assert.ok(t1.carbs > t0.carbs, 'добавленные калории уходят в углеводы');
  assert.equal(t1.observedTdee, 2900);
  assert.equal(t1.adjustmentKcal, 150);
  assert.ok(t1.steps.some((s) => s.label === 'Адаптивная корректировка'));
  const e = explainNutrition(base, t1, 80, null);
  assert.equal(e.rows.length, 5);
  assert.ok(e.rows[1].why.includes('1,6–2,2 г/кг'));
  assert.ok(e.rows[0].why.includes('фактический расход'));
});

// ─── Пресеты цели и состав ──────────────────────────────────────────────────

test('Пресеты набора: зависят от опыта; быстрый не рекомендуется по умолчанию; предупреждение без запрета', () => {
  const ps = goalPresets('bulk', 'intermediate', 80);
  assert.deepEqual(ps.map((p) => p.id), ['conservative', 'balanced', 'fast']);
  assert.equal(ps[2].label, 'Более быстрый набор');
  assert.ok(ps[0].kgPerWeek < ps[1].kgPerWeek && ps[1].kgPerWeek < ps[2].kgPerWeek);
  assert.ok(goalPresets('bulk', 'advanced', 80)[1].ratePct < goalPresets('bulk', 'beginner', 80)[1].ratePct);
  assert.equal(recommendedPreset({ goal: 'bulk', level: 'beginner', sex: 'male', heightCm: 180, weightKg: 75 }).id, 'balanced');
  assert.equal(recommendedPreset({ goal: 'bulk', level: 'intermediate', sex: 'male', heightCm: 180, weightKg: 75, waistCm: 95 }).id, 'conservative', 'талия/рост ≥0,5');
  assert.equal(recommendedPreset({ goal: 'bulk', level: 'advanced', sex: 'male', heightCm: 180, weightKg: 80 }).id, 'balanced');
  assert.equal(recommendedPreset({ goal: 'bulk', level: 'beginner', sex: 'male', heightCm: 175, weightKg: 90 }).id, 'conservative', 'ИМТ ≥27');
  assert.equal(presetForRate('bulk', 'intermediate', 0.35), 'balanced');
  assert.equal(rateWarning('bulk', 'intermediate', 0.35, 80), null);
  assert.equal(rateWarning('bulk', 'intermediate', 0.5, 80)?.level, 'caution');
  assert.equal(rateWarning('bulk', 'intermediate', 1.0, 80)?.level, 'strong');
  const all = JSON.stringify([ps, goalPresets('cut', 'beginner', 80)]);
  assert.ok(!/гарант/i.test(all), 'никаких «гарантий»');
});

const weighSeries = (fromKg: number, toKg: number, days = 42): WeightEntry[] => Array.from({ length: days / 2 + 1 }, (_, i) => ({ id: `w${i}`, date: addDays(D, -days + i * 2), kg: fromKg + ((toKg - fromKg) * i) / (days / 2) }));
const waist = (fromCm: number, toCm: number): BodyMetric[] => [0, 14, 28, 42].map((d, i) => ({ id: `m${i}`, date: addDays(D, -42 + d), kind: 'waist', value: fromCm + ((toCm - fromCm) * i) / 3 }));
const strengthSessions = (a: number, b: number): WorkoutSession[] => [benchSession(40, a, [8, 8]), benchSession(38, a, [8, 8]), benchSession(3, b, [8, 8]), benchSession(1, b, [8, 8])].map((s, i) => ({ ...s, id: `x${i}`, exercises: [...s.exercises, { ...s.exercises[0], id: `sq${i}`, exerciseId: 'back_squat', sets: s.exercises[0].sets.map((x) => ({ ...x, weight: x.weight + 30 })) }] }));

test('Состав: вес +1,2 / талия +0,2 / силовые растут — качественно; вес +2,5 / талия +3 / силовые стоят — возможно, слишком быстро', () => {
  const good = compositionSignal({ goal: 'bulk', weights: weighSeries(80, 81.2), metrics: waist(84, 84.2), sessions: strengthSessions(80, 85) });
  assert.equal(good.kind, 'positive');
  assert.equal(good.caveat, COMPOSITION_CAVEAT);
  const bad = compositionSignal({ goal: 'bulk', weights: weighSeries(80, 82.5), metrics: waist(84, 87), sessions: strengthSessions(80, 80) });
  assert.equal(bad.kind, 'aggressive');
  assert.ok(/возможно, профицит слишком большой/.test(bad.text));
  assert.ok(!/(жира набрано|мышц набрано|кг мышц)/.test(good.text + bad.text), 'никаких точных «мышцы/жир»');
  assert.equal(compositionSignal({ goal: 'bulk', weights: [], metrics: [], sessions: [] }).kind, 'insufficient');
  assert.ok((strengthChangePct(strengthSessions(80, 85), addDays(D, -42), D)?.pct ?? 0) > 3);
});

// ─── Coach Today ────────────────────────────────────────────────────────────

const todayInput = (sessions: WorkoutSession[], extra: Partial<Parameters<typeof coachToday>[0]> = {}) => {
  const tw = resolveToday({ date: D, plan, sessions, readiness: extra.readiness });
  const target = computeNutritionTarget(base);
  return { date: D, profile: base, today: tw, health: {}, sessions, target, maintenance: null, steps: null, signals: [], ...extra };
};

test('Coach Today: фокус «увеличить жим с 80 до 82,5», с данными тренировок и уверенностью', () => {
  const sessions = [benchSession(2, 80, [10, 10, 10], 2), benchSession(5, 80, [10, 10, 10], 2), benchSession(9, 80, [10, 10, 10], 2)];
  const c = coachToday(todayInput(sessions));
  assert.equal(c.kind, 'workout');
  assert.equal(c.title, 'Верх A');
  assert.ok(c.focus, 'есть главный фокус');
  assert.ok(/увеличить жим штанги лёжа с 80 до 82,5 кг/.test(c.focus!.what), c.focus!.what);
  assert.equal(c.focus!.data.length, 3, 'провенанс: три последние тренировки');
  assert.ok(c.focus!.data[0].includes('80 кг × 10/10/10, RIR 2'));
  assert.equal(c.focus!.confidence, 'high');
  assert.ok(c.nutrition && c.nutrition.label.includes('тренировочный день'));
  const n = c.decisions.find((d) => d.id === 'nutrition')!;
  assert.equal(n.confidence, 'low');
  assert.ok(confidenceText(n).startsWith('Уверенность: низкая — недостаточно истории, пока исходная формула'));
  assert.ok(c.why.length >= 1 && c.why.length <= 3);
});

test('Coach Today: сигналы здоровья запрещают повышение; срочный сигнал — отдых', () => {
  const sessions = [benchSession(2, 80, [10, 10, 10], 2), benchSession(5, 80, [10, 10, 10], 2)];
  const doc = bpSignals([bp(5, 150, 95), bp(2, 148, 94)]);
  const c = coachToday(todayInput(sessions, { signals: doc }));
  assert.ok(!/увеличить/.test(c.focus!.what), 'не «+нагрузка» при флагах здоровья');
  assert.ok(c.decisions.some((d) => d.id === 'health_hold'));
  assert.ok(c.why.some((w) => /не повышаем/.test(w)));
  const urgent = coachToday(todayInput(sessions, { signals: bpSignals([bp(0, 195, 120)]) }));
  assert.equal(urgent.mode, 'Отдых');
  assert.equal(urgent.focus!.id, 'health_stop');
});

test('Coach Today: сниженная готовность → фокус на восстановлении; сон в формате 7:43', () => {
  const sessions = [benchSession(2, 80, [10, 10, 10], 2)];
  const checkin: DailyCheckIn = { date: D, sleepHours: 463 / 60, sleepMinutes: 463, sleepQuality: 2, energy: 2, stress: 4, soreness: 4, pain: false, createdAt: 1 };
  const readiness = { score: 45, band: 'light' as const, headline: 'Облегчённая: −30% объёма, запас 3 повтора', volumeFactor: 0.7, rirDelta: 1, factors: [], reasons: ['мало энергии'] };
  const c = coachToday(todayInput(sessions, { readiness, checkin }));
  assert.equal(c.sleep?.text, '7:43');
  assert.equal(clockSleep(463), '7:43');
  assert.equal(c.focus!.id, 'focus_recovery');
  assert.ok(/без повышения/.test(c.focus!.what));
  assert.equal(readinessConfidence(readiness, checkin, undefined).level, 'medium');
});

test('Уверенность: формула → низкая; прогрессия по истории и RIR', () => {
  assert.equal(maintenanceConfidence(null, null).level, 'low');
  assert.equal(progressionConfidence([]).level, 'low');
  const h = historyFor('bench_press', [benchSession(2, 80, [10, 10], 2), benchSession(5, 80, [10, 10], 2), benchSession(9, 80, [10, 10], 2)]);
  assert.equal(progressionConfidence(h).level, 'high');
  assert.equal(progressionConfidence(historyFor('bench_press', [benchSession(2, 80, [10, 10]), benchSession(5, 80, [10, 10])])).level, 'medium');
  assert.ok(historyLine(h[0]).endsWith('80 кг × 10/10, RIR 2'));
});

// ─── Coach Alerts ───────────────────────────────────────────────────────────

const alertArgs = (o: Partial<Parameters<typeof coachAlerts>[0]> = {}) => ({ ref: D, goal: 'bulk' as const, targetKgPerWeek: 0.28, bodyWeightKg: 80, weights: [], metrics: [], sessions: [], plan: null, checkins: {}, health: {}, labs: [], signals: [], ...o });

test('Alerts: вес растёт быстрее цели 2 недели, пора измерить талию, верх диапазона дважды', () => {
  const weights = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, date: addDays(D, -14 + i * 2), kg: 80 + i * 0.25 }));
  const a = coachAlerts(alertArgs({ weights, metrics: [{ id: 'm', date: addDays(D, -10), kind: 'waist', value: 84 }] }));
  assert.ok(a.some((x) => x.id === 'weight_fast'));
  assert.ok(a.some((x) => x.id === 'waist_due'));
  const sessions = [benchSession(2, 80, [10, 10, 10], 2), benchSession(5, 80, [10, 10, 10], 2)];
  const b = coachAlerts(alertArgs({ sessions, plan }));
  const top = b.find((x) => x.id === 'top_bench_press')!;
  assert.ok(top && /82,5 кг/.test(top.text));
  // Флаги здоровья — выше всего и отменяют «можно увеличить»
  const c = coachAlerts(alertArgs({ sessions, plan, signals: bpSignals([bp(5, 150, 95), bp(2, 148, 94)]) }));
  assert.equal(c[0].level, 'warning');
  assert.ok(c[0].id.startsWith('h_'));
  assert.ok(!c.some((x) => x.id.startsWith('top_')));
});

test('Alerts: сон ухудшается 3 недели; новые анализы с 3 изменёнными показателями; не больше 3', () => {
  const start = startOfWeek(D);
  const checkins: Record<string, DailyCheckIn> = {};
  [8, 7.5, 7].forEach((h, w) => {
    for (let i = 0; i < 5; i++) {
      const d = addDays(start, -7 * (3 - w) + i);
      checkins[d] = { date: d, sleepHours: h, sleepQuality: 3, energy: 3, stress: 3, soreness: 2, pain: false, createdAt: 0 };
    }
  });
  assert.deepEqual(weeklySleep(D, checkins, {}, 3), [8, 7.5, 7]);
  const labs = [rep('a', addDays(D, -200), [['hct', 45, '%'], ['ldl', 3.0, 'ммоль/л'], ['alt', 25, 'ед/л'], ['glu', 5.0, 'ммоль/л']]), rep('b', addDays(D, -5), [['hct', 48, '%'], ['ldl', 3.6, 'ммоль/л'], ['alt', 35, 'ед/л'], ['glu', 5.05, 'ммоль/л']])];
  const weights = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, date: addDays(D, -14 + i * 2), kg: 80 + i * 0.25 }));
  const a = coachAlerts(alertArgs({ checkins, labs, weights, metrics: [{ id: 'm', date: addDays(D, -10), kind: 'waist', value: 84 }] }));
  assert.equal(a.length, MAX_ALERTS);
  assert.equal(a[0].id, 'labs_changed');
  assert.ok(/изменились 3/.test(a[0].title));
  assert.ok(a.some((x) => x.id === 'sleep_down'));
});

// ─── Weekly Review как у тренера ────────────────────────────────────────────

test('Weekly: метрики и решения — калории, объём, конкретные упражнения с причиной', () => {
  const lastMon = addDays(startOfWeek(D), -7);
  const sessions = [0, 2, 4].map((k) => ({ ...benchSession(0, 80, [10, 10, 10], 2), id: `wk${k}`, date: addDays(lastMon, k) }));
  const weights = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, date: addDays(D, -22 + i * 2), kg: 80 }));
  const target = computeNutritionTarget(base);
  const review = buildWeeklyReview({ profile: base, plan, target, sessions, entries: [], weights, metrics: [], checkins: {}, readiness: () => undefined });
  const calories = reviewCalories({ profile: base, weights, entries: [], adjustments: [], targetKcal: target.kcal, sessions });
  const w = weeklyDecisions({ profile: base, plan, target, review, calories, proposals: [], sessions, health: {}, weighIns: weights.length });
  assert.equal(w.metrics.workoutsDone, 3);
  assert.ok(w.decisions.some((d) => d.id === 'w_kcal'));
  const ex = w.decisions.find((d) => d.id === 'w_ex_bench_press')!;
  assert.ok(ex && /увеличить вес 80 → 82,5 кг/.test(ex.what), ex?.what);
  assert.ok(ex.why.length > 10);
  assert.ok(Math.abs(w.calorieDelta) <= 150);
  for (const d of w.decisions) {
    assert.ok(d.what && d.why !== undefined && Array.isArray(d.data) && d.confidence, `решение ${d.id} содержит что/почему/данные/уверенность`);
  }
});

// ─── Чат: ответы «почему» из решений; ИИ-объяснение отдельно от расчётов ─────

import { localCoach } from '../src/features/coach/local/engine';
import { decisionsContext } from '../src/features/coach/decisions/context';
import { buildDaySummary } from '../src/features/day/summary';
import { maintenanceConfidence as mc2 } from '../src/features/coach/decisions/confidence';

test('Чат: «почему не повышаем жим?» — ответ из решения с данными и уверенностью; без данных — честно «недостаточно»', () => {
  const sessions = [benchSession(2, 80, [9, 8, 7], 1), benchSession(6, 80, [8, 8, 7], 1)];
  const input = todayInput(sessions);
  const coach = coachToday(input);
  const ask = (question: string) => localCoach({ question, profile: base, target: input.target, entries: [], recentProducts: [], todayW: input.today, insights: [], sessions, weights: [], adjustments: [], plan, checkins: {}, coach });
  const r = ask('Почему сегодня не повышаем жим лёжа?');
  assert.equal(r.intent, 'why_decision');
  assert.ok(/добрать повторы/.test(r.text), r.text);
  assert.ok(/На основе: .*80 кг × 9\/8\/7/.test(r.text), 'ссылается на реальные тренировки');
  assert.ok(/Уверенность: /.test(r.text));
  const none = ask('Почему ты не повышаешь вес в приседе?');
  assert.equal(none.intent, 'why_insufficient');
  assert.ok(/данных недостаточно/.test(none.text));
  const kcal = ask('Почему у меня такие калории?');
  assert.equal(kcal.intent, 'why_decision');
  assert.ok(/ккал/.test(kcal.text) && /Уверенность: низкая/.test(kcal.text));
});

test('Контекст для ИИ: решения переданы готовыми числами, с правилом «нет данных — скажи об этом»', () => {
  const sessions = [benchSession(2, 80, [10, 10, 10], 2), benchSession(5, 80, [10, 10, 10], 2), benchSession(9, 80, [10, 10, 10], 2)];
  const coach = coachToday(todayInput(sessions));
  const labs = [rep('a', '2026-03-01', [['hct', 47, '%', 40, 50]]), rep('b', '2026-09-01', [['hct', 49.1, '%', 40, 50]])];
  const ctx = decisionsContext({ coach, alerts: [], signals: [], labs, enhanced: true });
  assert.ok(ctx.includes('РЕШЕНИЯ ТРЕНЕРА'));
  assert.ok(ctx.includes('с 80 до 82,5 кг'), 'фокус передан как готовое решение');
  assert.ok(/уверенность: высокая/.test(ctx));
  assert.ok(ctx.includes('Гематокрит ↑ 2,1 п.п.'), 'изменения анализов посчитаны приложением');
  assert.ok(/данных недостаточно/.test(ctx));
  assert.ok(/Не обсуждать схемы, дозы, препараты/.test(ctx), 'граница безопасности Enhanced');
});

test('Здоровье и нагрузка: ЛПНП — к врачу, но прогрессию не останавливает; гематокрит >54% — останавливает повышение', () => {
  const ldl = labSignals([rep('a', addDays(D, -200), [['ldl', 3.6, 'ммоль/л', undefined, 3.0]]), rep('b', addDays(D, -5), [['ldl', 3.9, 'ммоль/л', undefined, 3.0]])], 'male');
  assert.ok(ldl.some((s) => s.level === 'doctor'));
  assert.equal(healthGate(ldl).blockIncrease, false);
  const hct = labSignals([rep('c', addDays(D, -5), [['hct', 55, '%', 40, 50]])], 'male');
  assert.equal(healthGate(hct).blockIncrease, true);
});

test('Уверенность в калориях: формула подтверждена фактом → высокая; расходятся → низкая с подсказкой', () => {
  const t = computeNutritionTarget(base);
  const m = { kcal: t.tdee + 50, avgIntake: 2900, kgPerWeek: 0.2, days: 28, loggedDays: 24, weighIns: 14, confidence: 'high' as const, text: '', basis: { kind: 'estimate' as const, sources: [] } };
  assert.equal(mc2(t, m).level, 'high');
  assert.equal(mc2(t, { ...m, kcal: t.tdee + 400 }).level, 'low');
  assert.ok(/можно перейти/.test(mc2(t, { ...m, kcal: t.tdee + 400 }).note));
});

test('DaySummary: анализ и давление попадают в ленту дня', () => {
  const labs = [rep('a', D, [['hct', 52, '%', 40, 50], ['alt', 30, 'ед/л', undefined, 41]])];
  const s = buildDaySummary(D, { sessions: [], entries: [], checkins: {}, weights: [], metrics: [], labs, bp: [bp(0, 128, 82)] });
  assert.equal(s.labs.length, 1);
  assert.equal(s.labs[0].outOfRange, 1);
  assert.deepEqual(s.bp[0], { systolic: 128, diastolic: 82, pulse: undefined });
  assert.ok(s.hasAny);
});
