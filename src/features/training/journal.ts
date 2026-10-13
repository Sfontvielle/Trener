import type { Exercise, ExerciseSet, ISODate, MuscleGroup, MuscleSlug, PlannedExercise, WorkoutExercise, WorkoutSession } from '@/types';
import type { Palette } from '@/theme';
import { getExercise } from '@/data/exercises';
import { addDays, daysBetween, formatDayShort, parseISODate, startOfWeek } from '@/utils/date';
import { fmtSec, fmtWeight, unitLabel } from '@/utils/format';
import { e1rm, historyFor, isPersonalRecord, PR_HISTORY, workingSets, type ExerciseHistoryEntry } from './progression';
import { normalizeSupersets } from './workoutNav';

/**
 * Дневник тренировок: лента по неделям, итоги недели, компактные строки подходов, «Повторить»,
 * цвет и тип тренировки, целевые мышцы. Чистые функции — проверяются тестами.
 */

// ─── Тип и цвет тренировки ──────────────────────────────────────────────────

export type WorkoutKind = 'full' | 'push' | 'pull' | 'legs' | 'upper' | 'core';

export const KIND_LABEL: Record<WorkoutKind, string> = {
  full: 'Всё тело',
  push: 'Жимовая',
  pull: 'Тяговая',
  legs: 'Ноги',
  upper: 'Верх',
  core: 'Кор и руки',
};

/** Цвет — токен темы (значение подставляется темой: тёмная/светлая) */
export const KIND_COLOR: Record<WorkoutKind, keyof Palette> = {
  full: 'accent',
  push: 'protein',
  pull: 'secondaryMuscle',
  legs: 'stabilizerMuscle',
  upper: 'warning',
  core: 'textDim',
};

const PUSH: MuscleGroup[] = ['chest', 'shoulders', 'triceps'];
const PULL: MuscleGroup[] = ['back', 'biceps', 'forearms'];
const LEGS: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves'];

/** Тип по распределению рабочих подходов (основные мышцы) */
export function workoutKind(items: { exerciseId: string; sets: number }[], customs: Exercise[] = []): WorkoutKind {
  const by = { push: 0, pull: 0, legs: 0, core: 0 };
  for (const it of items) {
    const ex = getExercise(it.exerciseId, customs);
    if (!ex || it.sets <= 0) continue;
    const gs = ex.groups.primary;
    if (!gs.length) continue;
    for (const g of gs) {
      const w = it.sets / gs.length;
      if (PUSH.includes(g)) by.push += w;
      else if (PULL.includes(g)) by.pull += w;
      else if (LEGS.includes(g)) by.legs += w;
      else by.core += w;
    }
  }
  const total = by.push + by.pull + by.legs + by.core;
  if (!total) return 'full';
  if (by.legs / total >= 0.6) return 'legs';
  const upper = by.push + by.pull;
  if (upper / total >= 0.7) {
    if (by.push / upper >= 0.7) return 'push';
    if (by.pull / upper >= 0.7) return 'pull';
    return 'upper';
  }
  if (by.core / total >= 0.5) return 'core';
  return 'full';
}

export function sessionKind(s: WorkoutSession, customs: Exercise[] = []): WorkoutKind {
  return workoutKind(s.exercises.map((we) => ({ exerciseId: we.exerciseId, sets: workingSets(we.sets).length || we.plannedSets })), customs);
}

// ─── Ощущение тренировки ────────────────────────────────────────────────────

/** «Как ощущалась тренировка?» → внутренняя тяжесть (sessionRpe) для адаптации нагрузки; смайл — для дневника */
export const SESSION_FEEL: { label: string; rpe: number; emoji: string }[] = [
  { label: 'Легко', rpe: 5, emoji: '😌' },
  { label: 'Нормально', rpe: 7, emoji: '🙂' },
  { label: 'Тяжело', rpe: 8.5, emoji: '😤' },
  { label: 'Очень тяжело', rpe: 10, emoji: '🥵' },
];

export function feelIndex(rpe?: number): number {
  if (rpe === undefined) return -1;
  return SESSION_FEEL.reduce((best, f, i) => (Math.abs(f.rpe - rpe) < Math.abs(SESSION_FEEL[best].rpe - rpe) ? i : best), 0);
}

export function sessionEmoji(s: Pick<WorkoutSession, 'sessionRpe'>): string | undefined {
  const i = feelIndex(s.sessionRpe);
  return i >= 0 ? SESSION_FEEL[i].emoji : undefined;
}

// ─── Строки подходов ────────────────────────────────────────────────────────

export function isTimed(ex?: Pick<Exercise, 'metric'>): boolean {
  return ex?.metric === 'time';
}

/** Значение одного подхода: «80 кг × 10», «12», «0:30», «24 кг × 0:40» */
export function setText(x: Pick<ExerciseSet, 'weight' | 'reps'>, o: { unit?: 'kg' | 'lb'; timed?: boolean } = {}): string {
  const val = o.timed ? fmtSec(x.reps) : String(x.reps);
  return x.weight > 0 ? `${fmtWeight(x.weight, o.unit)} ${unitLabel(o.unit ?? 'kg')} × ${val}` : val;
}

/**
 * Компактная строка выполненных рабочих подходов. Подряд идущие подходы с одним весом — одной группой:
 * «67,5 кг × 6, 7, 6» вместо повтора веса; разные веса — через « · »: «70 кг × 10 · 80 кг × 10, 8».
 */
export function setsLine(sets: ExerciseSet[], o: { unit?: 'kg' | 'lb'; timed?: boolean } = {}): string {
  const groups: { weight: number; vals: string[] }[] = [];
  for (const x of workingSets(sets)) {
    const val = o.timed ? fmtSec(x.reps) : String(x.reps);
    const g = groups[groups.length - 1];
    if (g && g.weight === x.weight) g.vals.push(val);
    else groups.push({ weight: x.weight, vals: [val] });
  }
  return groups.map((g) => (g.weight > 0 ? `${fmtWeight(g.weight, o.unit)} ${unitLabel(o.unit ?? 'kg')} × ${g.vals.join(', ')}` : g.vals.join(', '))).join(' · ');
}

// ─── Итоги и рекорды ────────────────────────────────────────────────────────

/** Сколько упражнений тренировки дали личный рекорд (относительно истории до неё) */
export function sessionPrCount(s: WorkoutSession, all: WorkoutSession[], customs: Exercise[] = []): number {
  const before = all.filter((x) => x.status === 'completed' && x.id !== s.id && (x.finishedAt ?? x.startedAt) < s.startedAt);
  let n = 0;
  for (const we of s.exercises) {
    const ex = getExercise(we.exerciseId, customs);
    if (!ex) continue;
    const hist = historyFor(ex.id, before, PR_HISTORY);
    if (workingSets(we.sets).some((x) => isPersonalRecord(ex, x, hist))) n++;
  }
  return n;
}

/**
 * Лучшие подходы упражнения, которых достаточно для проверки рекорда (isPersonalRecord берёт максимум
 * по истории): лучший по e1RM, больше всего повторов без веса, наибольший вес (и повторы/время на нём).
 */
function bestOf(sets: ExerciseSet[]): ExerciseSet[] {
  if (!sets.length) return [];
  const byE1rm = sets.reduce((b, x) => (e1rm(x.weight, x.reps) > e1rm(b.weight, b.reps) ? x : b), sets[0]);
  const bw = sets.filter((x) => x.weight === 0);
  const byBw = bw.length ? bw.reduce((b, x) => (x.reps > b.reps ? x : b), bw[0]) : undefined;
  const maxW = Math.max(...sets.map((x) => x.weight));
  const atMax = sets.filter((x) => x.weight === maxW);
  const byW = atMax.reduce((b, x) => (x.reps > b.reps ? x : b), atMax[0]);
  return [...new Set([byE1rm, byW, ...(byBw ? [byBw] : [])])];
}

/**
 * Рекорды по всем тренировкам за один проход (для ленты): то же правило, что sessionPrCount
 * (относительно всей истории упражнения), но история сжата до лучших подходов — без повторного разбора.
 */
export function prCounts(sessions: WorkoutSession[], customs: Exercise[] = []): Map<string, number> {
  const out = new Map<string, number>();
  const best = new Map<string, ExerciseSet[]>();
  const done = sessions.filter((s) => s.status === 'completed').sort((a, b) => a.startedAt - b.startedAt);
  for (const s of done) {
    let n = 0;
    const add: [string, ExerciseSet[]][] = [];
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId, customs);
      const ws = workingSets(we.sets);
      if (!ex || !ws.length) continue;
      const prev = best.get(ex.id);
      const h: ExerciseHistoryEntry[] = prev ? [{ date: s.date, sets: prev, repMin: we.repMin, repMax: we.repMax }] : [];
      if (ws.some((x) => isPersonalRecord(ex, x, h))) n++;
      add.push([ex.id, ws]);
    }
    for (const [id, ws] of add) best.set(id, bestOf([...(best.get(id) ?? []), ...ws]));
    out.set(s.id, n);
  }
  return out;
}

export interface SessionStats {
  minutes: number;
  sets: number;
  /** Тоннаж, кг (без упражнений на время) */
  tonnage: number;
  prs: number;
}

export function sessionStats(s: WorkoutSession, all: WorkoutSession[], customs: Exercise[] = [], prs?: Map<string, number>): SessionStats {
  let sets = 0;
  let tonnage = 0;
  for (const we of s.exercises) {
    const timed = isTimed(getExercise(we.exerciseId, customs));
    for (const x of workingSets(we.sets)) {
      sets++;
      if (!timed) tonnage += x.weight * x.reps;
    }
  }
  const minutes = s.finishedAt ? Math.max(0, Math.round((s.finishedAt - s.startedAt) / 60000)) : 0;
  return { minutes, sets, tonnage: Math.round(tonnage), prs: prs ? (prs.get(s.id) ?? 0) : sessionPrCount(s, all, customs) };
}

export interface WeekStats {
  workouts: number;
  minutes: number;
  sets: number;
  tonnage: number;
  prs: number;
}

/** Итоги за период [from, to] включительно */
export function periodStats(sessions: WorkoutSession[], from: ISODate, to: ISODate, customs: Exercise[] = [], prs: Map<string, number> = prCounts(sessions, customs)): WeekStats {
  const out: WeekStats = { workouts: 0, minutes: 0, sets: 0, tonnage: 0, prs: 0 };
  for (const s of sessions) {
    if (s.status !== 'completed' || s.date < from || s.date > to) continue;
    const st = sessionStats(s, sessions, customs, prs);
    out.workouts++;
    out.minutes += st.minutes;
    out.sets += st.sets;
    out.tonnage += st.tonnage;
    out.prs += st.prs;
  }
  return out;
}

/** Недель подряд (включая текущую, если в ней уже есть тренировка) хотя бы с одной тренировкой */
export function weekStreak(sessions: WorkoutSession[], ref: ISODate): number {
  const weeks = new Set(sessions.filter((s) => s.status === 'completed').map((s) => startOfWeek(s.date)));
  let w = startOfWeek(ref);
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w = addDays(w, -7);
  }
  return n;
}

// ─── Лента по неделям ───────────────────────────────────────────────────────

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «Эта неделя», «Прошлая неделя», «21–27 сентября», «29 сен – 5 окт» */
export function weekTitle(weekStart: ISODate, ref: ISODate): string {
  const cur = startOfWeek(ref);
  if (weekStart === cur) return 'Эта неделя';
  if (weekStart === addDays(cur, -7)) return 'Прошлая неделя';
  const end = addDays(weekStart, 6);
  const a = parseISODate(weekStart);
  const b = parseISODate(end);
  const year = b.getFullYear() !== parseISODate(ref).getFullYear() ? ` ${b.getFullYear()}` : '';
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}${year}`;
  return `${formatDayShort(weekStart)} – ${formatDayShort(end)}${year}`;
}

export interface JournalSection {
  weekStart: ISODate;
  title: string;
  stats: WeekStats;
  sessions: WorkoutSession[];
}

/** Завершённые тренировки, сгруппированные по неделям (новые сверху) */
export function journalSections(sessions: WorkoutSession[], ref: ISODate, customs: Exercise[] = [], prs: Map<string, number> = prCounts(sessions, customs)): JournalSection[] {
  const done = sessions.filter((s) => s.status === 'completed').sort((a, b) => b.startedAt - a.startedAt);
  const map = new Map<ISODate, WorkoutSession[]>();
  for (const s of done) {
    const w = startOfWeek(s.date);
    const arr = map.get(w);
    if (arr) arr.push(s);
    else map.set(w, [s]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, list]) => ({ weekStart, title: weekTitle(weekStart, ref), stats: periodStats(list, weekStart, addDays(weekStart, 6), customs, prs), sessions: list }));
}

/** «Сегодня», «Вчера», «Четверг», «4 окт» — подпись дня в ленте */
const WEEKDAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export function journalDay(date: ISODate, ref: ISODate): string {
  const diff = daysBetween(date, ref);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  if (diff > 1 && diff < 7) return WEEKDAY_FULL[(parseISODate(date).getDay() + 6) % 7];
  return formatDayShort(date);
}

// ─── Повторить тренировку ───────────────────────────────────────────────────

/**
 * Упражнения прошлой тренировки для повтора: столько же рабочих подходов, те же диапазоны и отдых,
 * суперсеты сохраняются. Веса подставит тренер по прогрессии (история уже содержит эту тренировку).
 */
export function repeatPlanned(s: WorkoutSession): PlannedExercise[] {
  const withWork = s.exercises.filter((we) => workingSets(we.sets).length > 0);
  const src: WorkoutExercise[] = withWork.length ? withWork : s.exercises;
  return normalizeSupersets(
    src.map((we) => ({
      exerciseId: we.exerciseId,
      sets: Math.max(1, workingSets(we.sets).length || we.plannedSets),
      repMin: we.repMin,
      repMax: we.repMax,
      targetRir: we.targetRir,
      restSec: we.restSec,
      ...(we.note ? { note: we.note } : {}),
      ...(we.superset ? { superset: we.superset } : {}),
    })),
  );
}

// ─── Целевые мышцы ──────────────────────────────────────────────────────────

export interface TargetMuscles {
  /** Доля подходов по группам (основная мышца = 1, вторичная = 0,5), сумма 100 */
  groups: { group: MuscleGroup; pct: number }[];
  /** Для анатомической карты */
  primary: MuscleSlug[];
  secondary: MuscleSlug[];
}

export function targetMuscles(items: { exerciseId: string; sets: number }[], customs: Exercise[] = []): TargetMuscles {
  const w = new Map<MuscleGroup, number>();
  const primary = new Set<MuscleSlug>();
  const secondary = new Set<MuscleSlug>();
  for (const it of items) {
    const ex = getExercise(it.exerciseId, customs);
    if (!ex || it.sets <= 0) continue;
    for (const g of ex.groups.primary) w.set(g, (w.get(g) ?? 0) + it.sets);
    for (const g of ex.groups.secondary) w.set(g, (w.get(g) ?? 0) + it.sets * 0.5);
    ex.primary.forEach((m) => primary.add(m));
    ex.secondary.forEach((m) => secondary.add(m));
  }
  const total = [...w.values()].reduce((a, b) => a + b, 0);
  const raw = [...w.entries()].map(([group, v]) => ({ group, v: total ? (v / total) * 100 : 0 })).sort((a, b) => b.v - a.v);
  // Округление с сохранением суммы 100 (наибольший остаток)
  const floors = raw.map((r) => ({ ...r, f: Math.floor(r.v) }));
  let rest = total ? 100 - floors.reduce((a, r) => a + r.f, 0) : 0;
  const byFrac = [...floors].sort((a, b) => b.v - b.f - (a.v - a.f));
  for (const r of byFrac) {
    if (rest <= 0) break;
    r.f++;
    rest--;
  }
  const groups = floors.map((r) => ({ group: r.group, pct: r.f })).filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct);
  return { groups, primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)) };
}

// ─── Упражнение по тренировкам ──────────────────────────────────────────────

export interface ExerciseSessionPoint {
  date: ISODate;
  /** Объём за тренировку: кг × повторы (для упражнений на время и без веса — секунды/повторы) */
  volume: number;
  best: { weight: number; reps: number };
  /** В этот день поставлен рекорд */
  pr: boolean;
}

/** Ряд по тренировкам для графика «объём за тренировку» с отметкой рекордов (старые → новые) */
export function exerciseSeries(exerciseId: string, sessions: WorkoutSession[], customs: Exercise[] = [], limit = 12): ExerciseSessionPoint[] {
  const ex = getExercise(exerciseId, customs);
  if (!ex) return [];
  const done = sessions.filter((s) => s.status === 'completed').sort((a, b) => a.startedAt - b.startedAt);
  const out: ExerciseSessionPoint[] = [];
  const seen: WorkoutSession[] = [];
  for (const s of done) {
    const we = s.exercises.find((x) => x.exerciseId === exerciseId);
    const ws = we ? workingSets(we.sets) : [];
    if (ws.length) {
      const weighted = ws.some((x) => x.weight > 0) && !isTimed(ex);
      const volume = Math.round(ws.reduce((a, x) => a + (weighted ? x.weight * x.reps : x.reps), 0));
      const best = ws.reduce((b, x) => (x.weight > b.weight || (x.weight === b.weight && x.reps > b.reps) ? x : b), ws[0]);
      const hist = historyFor(exerciseId, seen, PR_HISTORY);
      out.push({ date: s.date, volume, best: { weight: best.weight, reps: best.reps }, pr: ws.some((x) => isPersonalRecord(ex, x, hist)) });
    }
    seen.push(s);
  }
  return out.slice(-limit);
}
