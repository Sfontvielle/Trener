import type { Exercise, ISODate, MuscleGroup, WorkoutPlan, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { addDays, daysBetween, today, weekdayIndex } from '@/utils/date';
import { bestSet, e1rm, workingSets } from './progression';
import { fmtWeight } from '@/utils/format';

export function completed(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((s) => s.status === 'completed');
}

/** Рабочие подходы по группам за период [from, to] включительно (основная = 1, вторичная = 0.5) */
export function setsByGroup(sessions: WorkoutSession[], from: ISODate, to: ISODate, customs: Exercise[] = []): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const s of completed(sessions)) {
    if (s.date < from || s.date > to) continue;
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId, customs);
      if (!ex) continue;
      const n = workingSets(we.sets).length;
      if (!n) continue;
      for (const g of ex.groups.primary) out[g] = (out[g] ?? 0) + n;
      for (const g of ex.groups.secondary) out[g] = (out[g] ?? 0) + n * 0.5;
    }
  }
  return out;
}

/** Тоннаж (кг × повторы) по группам */
export function tonnageByGroup(sessions: WorkoutSession[], from: ISODate, to: ISODate): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const s of completed(sessions)) {
    if (s.date < from || s.date > to) continue;
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId);
      if (!ex) continue;
      const t = workingSets(we.sets).reduce((a, x) => a + x.weight * x.reps, 0);
      for (const g of ex.groups.primary) out[g] = (out[g] ?? 0) + t;
    }
  }
  return out;
}

/** Выполнение плана: сделанные рабочие подходы / запланированные (за N дней) */
export function adherence(sessions: WorkoutSession[], plan: WorkoutPlan | null, days = 28, ref: ISODate = today()): { pct: number | null; done: number; planned: number; workoutsDone: number; workoutsPlanned: number } {
  if (!plan) return { pct: null, done: 0, planned: 0, workoutsDone: 0, workoutsPlanned: 0 };
  const from = addDays(ref, -days + 1);
  let workoutsPlanned = 0;
  for (let d = from; d <= ref; d = addDays(d, 1)) if (plan.schedule[weekdayIndex(d)]) workoutsPlanned++;
  const done = completed(sessions).filter((s) => s.date >= from && s.date <= ref);
  const workoutsDone = done.length;
  let setsDone = 0;
  let setsPlanned = 0;
  for (const s of done) for (const we of s.exercises) {
    setsPlanned += we.plannedSets;
    setsDone += Math.min(we.plannedSets, workingSets(we.sets).length);
  }
  if (!workoutsPlanned) return { pct: null, done: setsDone, planned: setsPlanned, workoutsDone, workoutsPlanned };
  // Учитываем и пропуски тренировок, и недоделанные подходы
  const sessionRate = Math.min(1, workoutsDone / workoutsPlanned);
  const setRate = setsPlanned ? setsDone / setsPlanned : 1;
  return { pct: Math.round(sessionRate * setRate * 100), done: setsDone, planned: setsPlanned, workoutsDone, workoutsPlanned };
}

export interface PRRow {
  exerciseId: string;
  name: string;
  from: string;
  to: string;
  gainPct: number;
  e1rmTo: number;
  sessions: number;
}

/** Рост рабочих весов: первый vs лучший результат по каждому упражнению */
export function progressRows(sessions: WorkoutSession[], customs: Exercise[] = [], sinceDays = 3650): PRRow[] {
  const since = addDays(today(), -sinceDays);
  const map = new Map<string, { first?: { w: number; r: number; v: number }; best?: { w: number; r: number; v: number }; n: number }>();
  const sorted = completed(sessions).filter((s) => s.date >= since).sort((a, b) => a.startedAt - b.startedAt);
  for (const s of sorted) for (const we of s.exercises) {
    const b = bestSet(we.sets);
    if (!b) continue;
    const row = map.get(we.exerciseId) ?? { n: 0 };
    const v = { w: b.weight, r: b.reps, v: b.e1rm };
    if (!row.first) row.first = v;
    if (!row.best || v.v > row.best.v) row.best = v;
    row.n++;
    map.set(we.exerciseId, row);
  }
  const out: PRRow[] = [];
  for (const [id, r] of map) {
    const ex = getExercise(id, customs);
    if (!ex || !r.first || !r.best) continue;
    const fmt = (x: { w: number; r: number }) => (x.w > 0 ? `${fmtWeight(x.w)} × ${x.r}` : `${x.r} повт.`);
    out.push({
      exerciseId: id,
      name: ex.name,
      from: fmt(r.first),
      to: fmt(r.best),
      gainPct: r.first.v > 0 ? Math.round(((r.best.v - r.first.v) / r.first.v) * 100) : 0,
      e1rmTo: Math.round(r.best.w > 0 ? e1rm(r.best.w, r.best.r) : 0),
      sessions: r.n,
    });
  }
  return out.sort((a, b) => b.sessions - a.sessions || b.gainPct - a.gainPct);
}

/** Сколько дней назад последний раз нагружалась группа */
export function daysSinceGroup(sessions: WorkoutSession[], g: MuscleGroup, ref: ISODate = today()): number | undefined {
  const sorted = completed(sessions).sort((a, b) => b.startedAt - a.startedAt);
  for (const s of sorted) for (const we of s.exercises) {
    const ex = getExercise(we.exerciseId);
    if (ex?.groups.primary.includes(g) && workingSets(we.sets).length) return daysBetween(s.date, ref);
  }
  return undefined;
}

export function sessionVolume(s: WorkoutSession): { sets: number; tonnage: number; durationMin: number } {
  let sets = 0;
  let tonnage = 0;
  for (const we of s.exercises) for (const x of workingSets(we.sets)) {
    sets++;
    tonnage += x.weight * x.reps;
  }
  const durationMin = s.finishedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : 0;
  return { sets, tonnage, durationMin };
}

export function workoutsInRange(sessions: WorkoutSession[], from: ISODate, to: ISODate): number {
  return completed(sessions).filter((s) => s.date >= from && s.date <= to).length;
}
