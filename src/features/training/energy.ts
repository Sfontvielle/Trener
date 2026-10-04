import type { Exercise, WorkoutExercise, WorkoutSession } from '@/types';
import type { HealthDay } from '@/features/health/model';
import { getExercise } from '@/data/exercises';

/**
 * Энергозатраты силовой тренировки.
 *
 * Приоритет данных:
 *  1) измерено — активная энергия тренировки из Apple Health / часов, если она совпадает по времени
 *     с этой тренировкой (±10 мин);
 *  2) оценка — метод MET (Compendium of Physical Activities): активные ккал = (MET − 1) × вес × часы.
 *     «−1» убирает расход покоя — так оценка сопоставима с «активными калориями» часов.
 *     MET силовой зависит от интенсивности: 3,5 — умеренно (8–15 повт., запас), 5,0 — тяжёлые базовые,
 *     6,0 — интенсивно (отказ, короткий отдых).
 * По упражнениям расход нельзя измерить — он распределяется по времени между отметками подходов
 * и интенсивности упражнения и всегда показывается как оценка («≈»).
 * Числа округляются (до 5 ккал), чтобы не создавать ложной точности.
 */
export type EnergySource = 'health' | 'estimate';

export interface EnergyResult {
  kcal: number;
  source: EnergySource;
  /** Средний MET силовой части (для пояснения) */
  met: number;
  minutes: number;
  /** Оценка по упражнениям (exerciseId → ккал), всегда приблизительная */
  perExercise: Record<string, number>;
}

const MET_LIGHT = 3.5;
const MET_HEAVY = 5.0;
const MET_VIGOROUS = 6.0;

/** Интенсивность упражнения по типу движения и ощущениям подходов */
export function exerciseMet(ex: Exercise | undefined, we: WorkoutExercise): number {
  const done = we.sets.filter((s) => s.done && !s.warmup);
  const hard = done.filter((s) => s.feel === 'hard' || s.feel === 'max' || (s.rir !== undefined && s.rir <= 1)).length;
  const hardShare = done.length ? hard / done.length : 0;
  const heavyCompound = !!ex && ex.mechanic === 'compound' && ex.tier === 1;
  let met = ex?.mechanic === 'compound' ? (heavyCompound ? MET_HEAVY : 4.5) : MET_LIGHT;
  if (hardShare >= 0.5) met = Math.min(MET_VIGOROUS, met + 1);
  if (ex?.pattern === 'core' || ex?.pattern === 'calf') met = Math.min(met, 3.8);
  if (ex?.pattern === 'carry') met = Math.max(met, 5.5);
  return met;
}

export const roundKcal = (k: number) => (k < 20 ? Math.max(0, Math.round(k / 5) * 5) : k < 200 ? Math.round(k / 5) * 5 : Math.round(k / 10) * 10);

/**
 * Время каждого упражнения — по отметкам подходов: отрезок от предыдущей отметки (любого упражнения)
 * до отметки этого подхода, включая отдых перед ним. Первый подход отсчитывается от начала тренировки.
 */
function timeline(s: WorkoutSession, until: number): { weId: string; ms: number }[] {
  const marks = s.exercises
    .flatMap((we) => we.sets.filter((x) => x.done && x.completedAt).map((x) => ({ weId: we.id, at: x.completedAt! })))
    .sort((a, b) => a.at - b.at);
  const out: { weId: string; ms: number }[] = [];
  let prev = s.startedAt;
  for (const m of marks) {
    // Длинная пауза (>8 мин) — скорее перерыв, а не работа: считаем не больше 5 мин
    out.push({ weId: m.weId, ms: Math.min(m.at - prev, 5 * 60000) });
    prev = m.at;
  }
  // Хвост после последнего подхода (заминка/сборы) — до 3 мин относим к последнему упражнению
  if (marks.length && until > prev) out.push({ weId: marks[marks.length - 1].weId, ms: Math.min(until - prev, 3 * 60000) });
  return out;
}

export function estimateEnergy(s: WorkoutSession, weightKg: number, customs: Exercise[] = [], now = Date.now()): EnergyResult {
  const end = s.finishedAt ?? now;
  const minutes = Math.max(0, (end - s.startedAt) / 60000);
  const metById = new Map(s.exercises.map((we) => [we.id, exerciseMet(getExercise(we.exerciseId, customs), we)]));
  const per = new Map<string, number>();
  let worked = 0;
  for (const seg of timeline(s, end)) {
    const met = metById.get(seg.weId) ?? MET_LIGHT;
    const kcal = (met - 1) * weightKg * (seg.ms / 3600000);
    per.set(seg.weId, (per.get(seg.weId) ?? 0) + kcal);
    worked += seg.ms;
  }
  // Время без отметок подходов (разминка, начало) — низкая интенсивность
  const idleMs = Math.max(0, end - s.startedAt - worked);
  const idle = (MET_LIGHT - 1) * 0.6 * weightKg * (idleMs / 3600000);
  const total = [...per.values()].reduce((a, b) => a + b, 0) + idle;
  const perExercise: Record<string, number> = {};
  for (const we of s.exercises) {
    const k = per.get(we.id);
    if (k) perExercise[we.exerciseId] = (perExercise[we.exerciseId] ?? 0) + k;
  }
  const avgMet = worked ? [...per.entries()].reduce((a, [id, k]) => a + (metById.get(id) ?? 0) * k, 0) / Math.max(1, total - idle) : MET_LIGHT;
  return { kcal: total, source: 'estimate', met: Math.round(avgMet * 10) / 10, minutes, perExercise };
}

/** Тренировка из Apple Health, совпадающая по времени (±10 мин) */
function measured(s: WorkoutSession, health: Record<string, HealthDay> | undefined): number | undefined {
  const day = health?.[s.date];
  if (!day?.workouts?.length) return undefined;
  const start = s.startedAt;
  const end = s.finishedAt ?? Date.now();
  const tol = 10 * 60000;
  const hits = day.workouts.filter((w) => w.kcal && w.start <= end + tol && w.start + w.minutes * 60000 >= start - tol);
  if (!hits.length) return undefined;
  return hits.reduce((a, w) => a + (w.kcal ?? 0), 0);
}

export function sessionEnergy(s: WorkoutSession, weightKg: number, health?: Record<string, HealthDay>, customs: Exercise[] = [], now = Date.now()): EnergyResult {
  const est = estimateEnergy(s, weightKg, customs, now);
  const real = measured(s, health);
  if (real === undefined || real <= 0) return { ...est, kcal: roundKcal(est.kcal), perExercise: roundAll(est.perExercise) };
  // Измеренный итог распределяем по упражнениям пропорционально оценке (распределение — всё равно оценка)
  const k = est.kcal > 0 ? real / est.kcal : 0;
  const per: Record<string, number> = {};
  for (const [id, v] of Object.entries(est.perExercise)) per[id] = v * k;
  return { ...est, kcal: roundKcal(real), source: 'health', perExercise: roundAll(per) };
}

function roundAll(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, roundKcal(v)]));
}

export const ENERGY_METHOD_TEXT =
  'Оценка по методу MET (Compendium of Physical Activities): активные ккал ≈ (MET − 1) × вес тела × время. MET силовой работы — от 3,5 (умеренно) до 6 (тяжело, отказ, короткий отдых); интенсивность берётся из типа упражнения и того, как отмечены подходы. Время — по отметкам подходов. Точность такой оценки примерно ±25–30%.';
