import type { Exercise, PlannedExercise, WorkoutExercise, WorkoutSession } from '@/types';
import { estimateMinutes } from './engine/time';

/**
 * Навигация по активной тренировке в режиме «одно упражнение на экране».
 * Чистые функции — проверяются тестами и используются экраном и навигатором.
 */
export type NavState = 'completed' | 'current' | 'pending' | 'partial';

export function isExerciseDone(we: WorkoutExercise): boolean {
  return we.sets.length > 0 && we.sets.every((s) => s.done);
}

/** Какое упражнение показывать: сохранённый индекс, иначе первое незавершённое */
export function currentIndexOf(s: WorkoutSession): number {
  if (!s.exercises.length) return 0;
  if (s.currentIndex !== undefined && s.currentIndex >= 0 && s.currentIndex < s.exercises.length) return s.currentIndex;
  const i = s.exercises.findIndex((we) => !isExerciseDone(we));
  return i < 0 ? s.exercises.length - 1 : i;
}

/** Следующее — именно следующее по порядку (не «первое незавершённое»); -1, если это последнее */
export function nextIndex(s: WorkoutSession, i: number): number {
  return i + 1 < s.exercises.length ? i + 1 : -1;
}

export function prevIndex(_s: WorkoutSession, i: number): number {
  return i > 0 ? i - 1 : -1;
}

/** Статусы для навигатора: ✓ выполнено, ● текущее, ◐ начато, ○ впереди */
export function navItems(s: WorkoutSession, current: number): { index: number; state: NavState; done: number; total: number; we: WorkoutExercise }[] {
  return s.exercises.map((we, index) => {
    const done = we.sets.filter((x) => x.done).length;
    const state: NavState = index === current ? 'current' : isExerciseDone(we) ? 'completed' : done > 0 ? 'partial' : 'pending';
    return { index, state, done, total: we.sets.length, we };
  });
}

/** Осталось упражнений и примерно минут (по невыполненным подходам) */
export function remainingInfo(s: WorkoutSession, customs: Exercise[] = []): { exercises: number; minutes: number } {
  const left = s.exercises.filter((we) => !isExerciseDone(we));
  const planned: PlannedExercise[] = left.map((we) => ({ exerciseId: we.exerciseId, sets: we.sets.filter((x) => !x.done).length, repMin: we.repMin, repMax: we.repMax, targetRir: we.targetRir, restSec: we.restSec }));
  const minutes = planned.length ? Math.max(0, estimateMinutes(planned, customs) - 7) : 0;
  return { exercises: left.length, minutes };
}

/** Прогресс тренировки 0..1 по подходам */
export function workoutProgress(s: WorkoutSession): number {
  const total = s.exercises.reduce((a, e) => a + e.sets.length, 0);
  const done = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  return total ? done / total : 0;
}

/** Подпись для таймера отдыха: что дальше */
export function nextSetLabel(s: WorkoutSession, i: number, fmt: (w: number) => string, nameOf: (id: string) => string): string {
  const we = s.exercises[i];
  const nextSet = we?.sets.find((x) => !x.done);
  if (we && nextSet) return `${nextSet.weight > 0 ? `${fmt(nextSet.weight)} × ` : ''}${we.repMin}–${we.repMax}`;
  const n = s.exercises.find((x, j) => j > i && !isExerciseDone(x)) ?? s.exercises.find((x) => !isExerciseDone(x));
  return n ? nameOf(n.exerciseId) : 'завершение тренировки';
}
