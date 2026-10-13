/**
 * Дневник тренировок, суперсеты и упражнения на время (по мотивам Fitsession / YouCan).
 * Запуск: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExerciseSet, WorkoutExercise, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '../src/types';
import { agendaProgress, weekAgenda } from '../src/features/training/weekAgenda';
import { addDays, startOfWeek, today } from '../src/utils/date';
import { getExercise } from '../src/data/exercises';
import { fmtSec } from '../src/utils/format';
import { historyFor, isPersonalRecord, recommend, TIME_STEP_SEC } from '../src/features/training/progression';
import { makeWorkoutExercise, buildSession } from '../src/features/training/session';
import { afterSetTarget, linkWithNext, normalizeSupersets, supersetLabels, supersetMembers, toggleLinkAfter, unlinkSuperset } from '../src/features/training/workoutNav';
import { exerciseSeries, feelIndex, journalDay, journalSections, periodStats, prCounts, repeatPlanned, sessionEmoji, sessionKind, sessionPrCount, setsLine, setText, targetMuscles, weekStreak, weekTitle, workoutKind } from '../src/features/training/journal';

const D = today();
let n = 0;
const set = (weight: number, reps: number, done = true, extra: Partial<ExerciseSet> = {}): ExerciseSet => ({ id: `s${n++}`, weight, reps, done, ...extra });
const we = (exerciseId: string, sets: ExerciseSet[], extra: Partial<WorkoutExercise> = {}): WorkoutExercise => ({ id: `we${n++}`, exerciseId, plannedSets: sets.length, repMin: 6, repMax: 10, targetRir: 2, restSec: 90, sets, ...extra });
const session = (daysAgo: number, exercises: WorkoutExercise[], extra: Partial<WorkoutSession> = {}): WorkoutSession => {
  const startedAt = Date.parse(`${addDays(D, -daysAgo)}T10:00:00`);
  return { id: `ws${n++}`, date: addDays(D, -daysAgo), name: 'Грудь и трицепс', focus: '', source: 'plan', startedAt, finishedAt: startedAt + 55 * 60000, volumeFactor: 1, status: 'completed', exercises, ...extra };
};

test('упражнения на время: планка, боковая планка, прогулка фермера помечены; формат секунд', () => {
  assert.equal(getExercise('plank')?.metric, 'time');
  assert.equal(getExercise('side_plank')?.metric, 'time');
  assert.equal(getExercise('farmers_walk')?.metric, 'time');
  assert.equal(getExercise('bench_press')?.metric, undefined);
  assert.equal(fmtSec(30), '0:30');
  assert.equal(fmtSec(75), '1:15');
  assert.equal(fmtSec(600), '10:00');
});

test('прогрессия на время: верх диапазона → +5 с; ниже — держать; первый раз — диапазон в секундах', () => {
  const plank = getExercise('plank')!;
  const fresh = recommend({ exercise: plank, plannedSets: 3, repMin: 30, repMax: 60, targetRir: 2, history: [] });
  assert.equal(fresh.action, 'new');
  assert.match(fresh.rationale, /0:30–1:00/);
  const top = recommend({ exercise: plank, plannedSets: 3, repMin: 30, repMax: 60, targetRir: 2, history: [{ date: D, sets: [set(0, 60), set(0, 60), set(0, 62)], repMin: 30, repMax: 60, plannedSets: 3 }] });
  assert.equal(top.action, 'reps');
  assert.equal(top.delta, `+${TIME_STEP_SEC} с`);
  assert.equal(top.repMax, 65);
  assert.doesNotMatch(top.rationale, /повтор/);
  const mid = recommend({ exercise: plank, plannedSets: 3, repMin: 30, repMax: 60, targetRir: 2, history: [{ date: D, sets: [set(0, 45), set(0, 40)], repMin: 30, repMax: 60, plannedSets: 2 }] });
  assert.equal(mid.action, 'hold');
  assert.match(mid.rationale, /0:45 \/ 0:40/);
  // Низкая готовность или запрет повышения — время не растёт
  const low = recommend({ exercise: plank, plannedSets: 2, repMin: 30, repMax: 60, targetRir: 2, band: 'light', history: [{ date: D, sets: [set(0, 60), set(0, 60)], repMin: 30, repMax: 60, plannedSets: 2 }] });
  assert.equal(low.action, 'hold');
  // С весом: время в верху диапазона → прибавить вес
  const farmer = getExercise('farmers_walk')!;
  const fw = recommend({ exercise: farmer, plannedSets: 2, repMin: 30, repMax: 60, targetRir: 2, history: [{ date: D, sets: [set(24, 60), set(24, 60)], repMin: 30, repMax: 60, plannedSets: 2 }] });
  assert.equal(fw.action, 'increase');
  assert.ok(fw.weight > 24);
});

test('новое упражнение на время: подходы предзаполнены +5 секунд, а не +1', () => {
  const prev = session(3, [we('plank', [set(0, 40), set(0, 40)], { repMin: 30, repMax: 60 })]);
  const w = makeWorkoutExercise({ exerciseId: 'plank', sets: 2, repMin: 30, repMax: 60, targetRir: 2, restSec: 60 }, { sessions: [prev], customs: [], volumeFactor: 1, rirDelta: 0 })!;
  assert.equal(w.recommendation?.action, 'hold');
  assert.equal(w.sets[0].reps, 40);
  const prevTop = session(3, [we('plank', [set(0, 60), set(0, 60)], { repMin: 30, repMax: 60 })]);
  const w2 = makeWorkoutExercise({ exerciseId: 'plank', sets: 2, repMin: 30, repMax: 60, targetRir: 2, restSec: 60 }, { sessions: [prevTop], customs: [], volumeFactor: 1, rirDelta: 0 })!;
  assert.equal(w2.sets[0].reps, 65);
});

test('рекорд на время: при том же весе — дольше; больший вес — рекорд; меньший — нет', () => {
  const plank = getExercise('plank')!;
  const farmer = getExercise('farmers_walk')!;
  const hist = historyFor('plank', [session(5, [we('plank', [set(0, 50), set(0, 45)])])]);
  assert.equal(isPersonalRecord(plank, set(0, 55), hist), true);
  assert.equal(isPersonalRecord(plank, set(0, 50), hist), false);
  const fh = historyFor('farmers_walk', [session(5, [we('farmers_walk', [set(24, 60)])])]);
  assert.equal(isPersonalRecord(farmer, set(26, 30), fh), true);
  assert.equal(isPersonalRecord(farmer, set(20, 90), fh), false);
  assert.equal(isPersonalRecord(farmer, set(24, 65), fh), true);
});

test('строки подходов как в дневнике: вес × повторы, без веса — повторы, на время — минуты:секунды', () => {
  const sets = [set(70, 10), set(80, 10), set(90, 8), set(40, 5, true, { warmup: true }), set(100, 3, false)];
  assert.equal(setsLine(sets), '70 кг × 10, 80 кг × 10, 90 кг × 8');
  assert.equal(setsLine([set(0, 12), set(0, 12)]), '12, 12');
  assert.equal(setsLine([set(0, 30), set(0, 45)], { timed: true }), '0:30, 0:45');
  assert.equal(setText(set(24, 40), { timed: true }), '24 кг × 0:40');
  assert.equal(setText(set(100, 5), { unit: 'lb' }), '220,5 lb × 5');
});

test('тип тренировки по мышцам: жимовая, тяговая, ноги, верх, всё тело', () => {
  assert.equal(workoutKind([{ exerciseId: 'bench_press', sets: 3 }, { exerciseId: 'ohp', sets: 3 }, { exerciseId: 'triceps_pushdown', sets: 2 }].filter((x) => getExercise(x.exerciseId))), 'push');
  assert.equal(workoutKind([{ exerciseId: 'barbell_row', sets: 3 }, { exerciseId: 'barbell_curl', sets: 2 }]), 'pull');
  assert.equal(workoutKind([{ exerciseId: 'back_squat', sets: 3 }, { exerciseId: 'romanian_deadlift', sets: 3 }, { exerciseId: 'db_calf_raise', sets: 2 }].filter((x) => getExercise(x.exerciseId))), 'legs');
  assert.equal(workoutKind([{ exerciseId: 'bench_press', sets: 3 }, { exerciseId: 'barbell_row', sets: 3 }]), 'upper');
  assert.equal(workoutKind([{ exerciseId: 'bench_press', sets: 3 }, { exerciseId: 'back_squat', sets: 3 }, { exerciseId: 'barbell_row', sets: 3 }]), 'full');
  assert.equal(workoutKind([]), 'full');
  assert.equal(sessionKind(session(1, [we('back_squat', [set(100, 5), set(100, 5)])])), 'legs');
});

test('ощущение тренировки → смайл дневника; ближайший вариант по тяжести', () => {
  assert.equal(feelIndex(undefined), -1);
  assert.equal(feelIndex(7), 1);
  assert.equal(feelIndex(9.6), 3);
  assert.equal(sessionEmoji({ sessionRpe: 5 }), '😌');
  assert.equal(sessionEmoji({}), undefined);
});

test('итоги недели: тренировки, минуты, подходы, тоннаж (без упражнений на время), рекорды; серия недель', () => {
  const mon = startOfWeek(D);
  const a = session(0, [we('bench_press', [set(80, 10), set(80, 10)]), we('plank', [set(0, 60)])], { date: mon, startedAt: Date.parse(`${addDays(mon, -14)}T10:00:00`) });
  a.finishedAt = a.startedAt + 50 * 60000;
  const b = session(0, [we('bench_press', [set(85, 8), set(85, 8)])], { date: mon, startedAt: Date.parse(`${mon}T10:00:00`) });
  b.finishedAt = b.startedAt + 40 * 60000;
  const st = periodStats([a, b], mon, addDays(mon, 6));
  assert.equal(st.workouts, 2);
  assert.equal(st.minutes, 90);
  assert.equal(st.sets, 5);
  assert.equal(st.tonnage, 80 * 20 + 85 * 16);
  assert.equal(sessionPrCount(b, [a, b]), 1, 'жим 85×8 > 80×10 по e1RM');
  assert.equal(st.prs, 1);
  // Быстрый подсчёт для ленты совпадает с подробным
  const many = Array.from({ length: 40 }, (_, k) => session(40 - k, [we('bench_press', [set(60 + (k % 7) * 2.5, 8 + (k % 3)), set(60, 8)]), we('back_squat', [set(80 + (k % 5) * 5, 5)])]));
  const fast = prCounts(many);
  for (const s of many) assert.equal(fast.get(s.id), sessionPrCount(s, many), `тренировка ${s.date}`);
  // Серия: тренировки 3 недели подряд (включая текущую)
  const weeks = [0, 7, 14].map((k) => session(0, [], { date: addDays(mon, -k) }));
  assert.equal(weekStreak(weeks, D), 3);
  assert.equal(weekStreak([session(0, [], { date: addDays(mon, -7) })], D), 1, 'на этой неделе ещё нет — считаем с прошлой');
  assert.equal(weekStreak([], D), 0);
});

test('лента по неделям: новые сверху, заголовки «Эта неделя», «Прошлая неделя», даты; подписи дней', () => {
  const mon = startOfWeek(D);
  const list = [session(0, [], { date: mon }), session(0, [], { date: addDays(mon, -7) }), session(0, [], { date: addDays(mon, -21) }), session(0, [], { date: addDays(mon, -20), status: 'discarded' })];
  const secs = journalSections(list, D);
  assert.deepEqual(secs.map((s) => s.title).slice(0, 2), ['Эта неделя', 'Прошлая неделя']);
  assert.equal(secs.length, 3);
  assert.equal(secs[2].sessions.length, 1, 'удалённая тренировка не попадает');
  assert.match(weekTitle('2026-09-21', '2026-10-13'), /^21–27 сентября$/);
  assert.match(weekTitle('2026-09-28', '2026-10-20'), /^28 сен – 4 окт$/);
  assert.equal(weekTitle('2025-12-29', '2027-03-10'), '29 дек – 4 янв 2026', 'другой год — с годом');
  assert.equal(weekTitle('2025-12-29', '2026-03-10'), '29 дек – 4 янв');
  assert.equal(journalDay(D, D), 'Сегодня');
  assert.equal(journalDay(addDays(D, -1), D), 'Вчера');
  assert.equal(journalDay('2026-10-08', '2026-10-11'), 'Четверг');
});

test('«Повторить»: те же упражнения, число рабочих подходов, диапазоны и суперсеты; пропущенные — нет', () => {
  const s = session(2, [
    we('bench_press', [set(80, 10), set(80, 9), set(40, 8, true, { warmup: true })], { repMin: 6, repMax: 10, superset: 'x' }),
    we('barbell_row', [set(70, 10), set(70, 10), set(70, 10)], { repMin: 8, repMax: 12, superset: 'x' }),
    we('barbell_curl', [], { plannedSets: 3 }),
  ]);
  const p = repeatPlanned(s);
  assert.deepEqual(p.map((x) => [x.exerciseId, x.sets, x.repMin, x.repMax]), [['bench_press', 2, 6, 10], ['barbell_row', 3, 8, 12]]);
  assert.ok(p[0].superset && p[0].superset === p[1].superset, 'суперсет сохранён');
  // Повтор строит тренировку с прогрессией тренера: история — прошлая тренировка
  const built = buildSession({ name: s.name, focus: '', source: 'custom', planned: p, ctx: { sessions: [s], customs: [], volumeFactor: 1, rirDelta: 0 } });
  assert.equal(built.exercises.length, 2);
  assert.equal(built.exercises[0].superset, built.exercises[1].superset);
  assert.equal(built.exercises[0].recommendation?.weight, 80);
  // Ни одного выполненного — повторяем как было запланировано
  const empty = session(1, [we('back_squat', [set(100, 5, false)], { plannedSets: 3 })]);
  assert.deepEqual(repeatPlanned(empty).map((x) => x.sets), [3]);
});

test('суперсеты: нормализация, участники, подписи A1/A2, объединение и разделение', () => {
  const L = (keys: (string | undefined)[]) => keys.map((k, i) => ({ id: String(i), ...(k ? { superset: k } : {}) }));
  assert.deepEqual(normalizeSupersets(L(['a', 'a', undefined, 'a', 'b', 'b', 'c'])).map((x) => x.superset), ['ss0', 'ss0', undefined, undefined, 'ss4', 'ss4', undefined]);
  const list = normalizeSupersets(L(['a', 'a', 'a', undefined, 'b', 'b']));
  assert.deepEqual(supersetMembers(list, 1), [0, 1, 2]);
  assert.deepEqual(supersetMembers(list, 3), [3]);
  assert.deepEqual(supersetLabels(list), ['A1', 'A2', 'A3', undefined, 'B1', 'B2']);
  // Объединить 3 со следующим → сливается с группой B
  const merged = linkWithNext(list, 3);
  assert.deepEqual(supersetMembers(merged, 5), [3, 4, 5]);
  assert.deepEqual(linkWithNext(list, 5), list, 'последнее — не с чем объединять');
  // Убрать середину группы из трёх → группа распадается
  assert.deepEqual(unlinkSuperset(list, 1).map((x) => x.superset), [undefined, undefined, undefined, undefined, 'ss4', 'ss4']);
  // Убрать первого из трёх → двое остаются суперсетом
  assert.deepEqual(supersetMembers(unlinkSuperset(list, 0), 1), [1, 2]);
  // Связь в конструкторе: разорвать середину группы из четырёх → две пары
  const four = normalizeSupersets(L(['a', 'a', 'a', 'a']));
  const split = toggleLinkAfter(four, 1);
  assert.deepEqual(supersetLabels(split), ['A1', 'A2', 'B1', 'B2']);
  assert.deepEqual(supersetLabels(toggleLinkAfter(split, 1)), ['A1', 'A2', 'A3', 'A4'], 'и снова объединить');
  assert.deepEqual(supersetLabels(toggleLinkAfter(four, 2)), ['A1', 'A2', 'A3', undefined]);
});

test('суперсет в тренировке: подход A → сразу B без отдыха → отдых → снова A; разное число подходов', () => {
  const a = we('bench_press', [set(80, 10, false), set(80, 10, false)], { superset: 'ss0' });
  const b = we('barbell_row', [set(70, 10, false), set(70, 10, false), set(70, 10, false)], { superset: 'ss0' });
  const c = we('barbell_curl', [set(30, 10, false)]);
  const s = session(0, [a, b, c], { status: 'active' });
  const mark = (i: number, k: number) => (s.exercises[i].sets[k].done = true);
  mark(0, 0);
  assert.deepEqual(afterSetTarget(s, 0), { index: 1, rest: false });
  mark(1, 0);
  assert.deepEqual(afterSetTarget(s, 1), { index: 0, rest: true });
  mark(0, 1);
  assert.deepEqual(afterSetTarget(s, 0), { index: 1, rest: false });
  mark(1, 1);
  assert.deepEqual(afterSetTarget(s, 1), { index: 1, rest: true }, 'у A подходы кончились — B добирает свой третий');
  mark(1, 2);
  assert.deepEqual(afterSetTarget(s, 1), { index: 1, rest: true }, 'суперсет завершён — обычный отдых');
  assert.deepEqual(afterSetTarget(s, 2), { index: 2, rest: true }, 'обычное упражнение');
});

test('целевые мышцы тренировки: доли в сумме 100, основные и вторичные для карты', () => {
  const t = targetMuscles([{ exerciseId: 'bench_press', sets: 3 }, { exerciseId: 'back_squat', sets: 3 }]);
  assert.equal(t.groups.reduce((a, g) => a + g.pct, 0), 100);
  assert.ok(t.groups[0].pct >= t.groups[t.groups.length - 1].pct, 'по убыванию');
  assert.ok(t.groups.some((g) => g.group === 'chest') && t.groups.some((g) => g.group === 'quads'));
  assert.ok(t.primary.includes('chest'));
  assert.ok(!t.secondary.some((m) => t.primary.includes(m)), 'вторичные без повторов основных');
  assert.deepEqual(targetMuscles([]).groups, []);
});

test('упражнение по тренировкам: объём за тренировку и отметка рекордов, старые → новые', () => {
  const s1 = session(10, [we('bench_press', [set(80, 10), set(80, 10)])]);
  const s2 = session(6, [we('bench_press', [set(80, 8), set(80, 8)])]);
  const s3 = session(2, [we('bench_press', [set(85, 10), set(85, 9)])]);
  const series = exerciseSeries('bench_press', [s3, s1, s2]);
  assert.deepEqual(series.map((p) => p.volume), [1600, 1280, 85 * 19]);
  assert.deepEqual(series.map((p) => p.pr), [false, false, true]);
  assert.deepEqual(series[2].best, { weight: 85, reps: 10 });
  // Планка: объём — секунды
  const p = exerciseSeries('plank', [session(3, [we('plank', [set(0, 30), set(0, 40)])])]);
  assert.equal(p[0].volume, 70);
});

test('объём по готовности распределяется по тренировке: 2 подхода × 0,85 больше не округляются обратно', async () => {
  const { scaleSets } = await import('../src/features/training/scale');
  assert.deepEqual(scaleSets([2, 2, 2, 2, 2, 2], 0.85), [2, 2, 2, 2, 1, 1], '12 → 10, снимаем с поздних');
  assert.deepEqual(scaleSets([4, 3, 3, 2], 0.85), [3, 3, 2, 2], 'сначала с самых больших');
  assert.deepEqual(scaleSets([2, 2], 0.3), [1, 1], 'минимум 1 подход');
  assert.deepEqual(scaleSets([3, 2, 2], 1), [3, 2, 2]);
  assert.deepEqual(scaleSets([3, 2, 2], 1.2), [3, 3, 2], 'повышение — ранним упражнениям с меньшим числом');
  assert.equal(scaleSets([2, 2, 2, 2, 2], 0.6).reduce((a, b) => a + b, 0), 6, 'разгрузка 60%');
  // Тренировка, собранная со сниженным объёмом, действительно короче
  const s = buildSession({ name: 'A', focus: '', source: 'plan', planned: ['bench_press', 'barbell_row', 'ohp', 'barbell_curl'].map((id) => ({ exerciseId: id, sets: 2, repMin: 6, repMax: 10, targetRir: 2, restSec: 90 })), ctx: { sessions: [], customs: [], volumeFactor: 0.85, rirDelta: 0 } });
  assert.equal(s.exercises.reduce((a, x) => a + x.sets.length, 0), 7);
  assert.equal(s.volumeFactor, 0.85);
});

test('экспорт в CSV: строка на подход, «;» и десятичная запятая, кавычки в заметке, время у планки', async () => {
  const { workoutsCsv, CSV_HEADER } = await import('../src/features/training/csv');
  const s = session(1, [we('bench_press', [set(40, 8, true, { warmup: true }), set(82.5, 8, true, { rir: 2 }), set(82.5, 7), set(90, 1, false)], { superset: 'ss0' }), we('barbell_row', [set(70, 10)], { superset: 'ss0' }), we('plank', [set(0, 45)])], { notes: 'Отлично; "лёгкая"', sessionRpe: 7 });
  const csv = workoutsCsv([s, session(0, [], { status: 'discarded' })]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0].replace('﻿', ''), CSV_HEADER.join(';'));
  assert.equal(lines.length, 1 + 5, 'невыполненный подход и удалённая тренировка не экспортируются');
  assert.match(lines[1], /;да;40;8;/, 'разминка помечена, номер подхода пустой');
  assert.match(lines[2], /Жим штанги лёжа;A1;1;;82,5;8;;2;/);
  assert.match(lines[2], /"Отлично; ""лёгкая"""/);
  assert.match(lines[2], /;Нормально;/);
  assert.match(lines[4], /Тяга штанги в наклоне;A2;1;/);
  assert.match(lines[5], /Планка;;1;;;;45;/, 'у планки — секунды в своей колонке');
});

test('рекорд — относительно всей истории: побить последние 3 тренировки мало, если раньше было больше', async () => {
  const { workoutDebrief } = await import('../src/features/training/debrief');
  const old = session(60, [we('bench_press', [set(100, 5)])]);
  const recent = [20, 15, 10].map((d) => session(d, [we('bench_press', [set(80, 8)])]));
  const now = session(1, [we('bench_press', [set(85, 8)])]);
  const all = [old, ...recent, now];
  assert.equal(sessionPrCount(now, all), 0, '85×8 (e1RM ≈107) < 100×5 (≈117) полтора месяца назад');
  assert.equal(prCounts(all).get(now.id), 0);
  assert.equal(workoutDebrief(now, all).prs.length, 0);
  const real = session(0, [we('bench_press', [set(105, 5)])]);
  assert.equal(prCounts([...all, real]).get(real.id), 1);
  assert.equal(isPersonalRecord(getExercise('bench_press')!, set(85, 8), historyFor('bench_press', all.slice(0, 4), Number.POSITIVE_INFINITY)), false);
});

test('неделя одним списком: сделано / сегодня / впереди по ротации / пропущено; перенос дня учтён', () => {
  const tpl = (id: string): WorkoutTemplate => ({ id, name: id, focus: '', exercises: [], estMinutes: 50 }) as unknown as WorkoutTemplate;
  const mon = startOfWeek('2026-10-14'); // среда 14 октября → неделя с понедельника 12-го
  const schedule: (string | null)[] = ['A', null, 'B', null, 'A', null, null]; // пн, ср, пт
  const plan = { id: 'p', templates: [tpl('A'), tpl('B')], schedule, rotation: ['A', 'B'] } as unknown as WorkoutPlan;
  const done = (date: string, templateId: string): WorkoutSession => ({ id: `w${date}`, date, name: templateId, focus: '', source: 'plan', templateId, startedAt: Date.parse(`${date}T10:00:00`), finishedAt: Date.parse(`${date}T11:00:00`), volumeFactor: 1, status: 'completed', exercises: [] });
  const today0 = addDays(mon, 2);
  // Понедельник сделан (A) → сегодня B → пятница снова A
  let days = weekAgenda({ today: today0, plan, sessions: [done(mon, 'A')] });
  assert.deepEqual(days.map((d) => [d.date.slice(8), d.status, d.template?.id]), [[mon.slice(8), 'done', 'A'], [today0.slice(8), 'today', 'B'], [addDays(mon, 4).slice(8), 'planned', 'A']]);
  assert.deepEqual(agendaProgress(days), { done: 1, planned: 3 });
  // Понедельник пропущен — виден как пропуск; ротация продолжается от последней сделанной
  days = weekAgenda({ today: today0, plan, sessions: [] });
  assert.equal(days[0].status, 'missed');
  // Сегодня перенесено на отдых — «сегодня отдых», пятница остаётся в плане
  days = weekAgenda({ today: today0, plan, sessions: [done(mon, 'A')], overrides: { [today0]: { date: today0, mode: 'rest', createdAt: 0 } as never } });
  assert.deepEqual(days.map((d) => d.status), ['done', 'rest', 'planned']);
  // Без плана — только «сегодня отдых»
  assert.deepEqual(weekAgenda({ today: today0, plan: null, sessions: [] }).map((d) => d.status), ['rest']);
});
