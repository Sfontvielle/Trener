import type { Exercise, PlannedExercise } from '@/types';
import { getExercise, secondsPerSet } from '@/data/exercises';

/** Оценка длительности: разминка + подходы + отдых + переходы + разминочные подходы для тяжёлых базовых */
export function estimateMinutes(exs: PlannedExercise[], customs: Exercise[] = []): number {
  let sec = 7 * 60;
  for (const pe of exs) {
    const ex = getExercise(pe.exerciseId, customs);
    const per = ex ? secondsPerSet(ex) : 45;
    sec += pe.sets * per + Math.max(0, pe.sets - 1) * pe.restSec + 60;
    if (ex?.tier === 1) sec += 180;
  }
  return Math.round(sec / 60);
}
