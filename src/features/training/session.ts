import type { Exercise, PlannedExercise, ReadinessBand, WorkoutExercise, WorkoutSession, WorkoutSource } from '@/types';
import { getExercise } from '@/data/exercises';
import { uid } from '@/utils/id';
import { today } from '@/utils/date';
import { historyFor, recommend } from './progression';

/**
 * Подходов у нового упражнения по умолчанию (ручное добавление, конструктор, «Тренировать сейчас»,
 * тренер). Больше — только когда программа осознанно распределяет недельный объём; третий, четвёртый
 * подход пользователь добавляет сам одной кнопкой.
 */
export const DEFAULT_SETS = 2;

export interface SessionContext {
  sessions: WorkoutSession[];
  customs: Exercise[];
  band?: ReadinessBand;
  volumeFactor: number;
  rirDelta: number;
}

export function makeWorkoutExercise(pe: PlannedExercise, ctx: SessionContext): WorkoutExercise | null {
  const ex = getExercise(pe.exerciseId, ctx.customs);
  if (!ex) return null;
  const history = historyFor(ex.id, ctx.sessions);
  const base = recommend({
    exercise: ex,
    plannedSets: pe.sets,
    repMin: pe.repMin,
    repMax: pe.repMax,
    targetRir: pe.targetRir,
    rirDelta: ctx.rirDelta,
    history,
    band: ctx.band,
    volumeFactor: ctx.volumeFactor,
  });
  // Вес, согласованный с тренером, главнее авто-прогрессии (пользователь подтвердил его явно)
  const rec = pe.targetWeight !== undefined ? { ...base, weight: pe.targetWeight, rationale: `Вес ${pe.targetWeight} кг согласован с тренером. ${base.rationale}` } : base;
  // Предзаполняем подходы рекомендацией; повторы — нижняя цель (пользователь правит только если отличается)
  const last = history[0];
  const sets = Array.from({ length: rec.sets }, (_, i) => {
    const prevReps = last?.sets[i]?.reps;
    const reps = rec.action === 'increase' || rec.action === 'decrease' || rec.action === 'new' ? rec.repMin : Math.min(rec.repMax, Math.max(rec.repMin, (prevReps ?? rec.repMin) + (rec.action === 'reps' ? 1 : 0)));
    return { id: uid('s_'), weight: rec.weight, reps, done: false };
  });
  return {
    id: uid('we_'),
    exerciseId: ex.id,
    plannedSets: rec.sets,
    repMin: rec.repMin,
    repMax: rec.repMax,
    targetRir: rec.targetRir,
    restSec: pe.restSec,
    sets,
    recommendation: rec,
    note: pe.note,
    why: pe.why,
  };
}

export function buildSession(args: {
  name: string;
  focus: string;
  source: WorkoutSource;
  templateId?: string;
  planned: PlannedExercise[];
  ctx: SessionContext;
  readinessScore?: number;
}): WorkoutSession {
  const exercises = args.planned.map((pe) => makeWorkoutExercise(pe, args.ctx)).filter((x): x is WorkoutExercise => !!x);
  return {
    id: uid('ws_'),
    date: today(),
    name: args.name,
    focus: args.focus,
    source: args.source,
    templateId: args.templateId,
    startedAt: Date.now(),
    exercises,
    volumeFactor: args.ctx.volumeFactor,
    readinessScore: args.readinessScore,
    status: 'active',
  };
}
