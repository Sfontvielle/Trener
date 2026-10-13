import type { Exercise, PlannedExercise, WorkoutExercise, WorkoutSession } from '@/types';
import { estimateMinutes } from './engine/time';
import { fmtSec } from '@/utils/format';

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
export function nextSetLabel(s: WorkoutSession, i: number, fmt: (w: number) => string, nameOf: (id: string) => string, timed: (id: string) => boolean = () => false): string {
  const we = s.exercises[i];
  const nextSet = we?.sets.find((x) => !x.done);
  const range = (x: WorkoutExercise) => (timed(x.exerciseId) ? `${fmtSec(x.repMin)}–${fmtSec(x.repMax)}` : `${x.repMin}–${x.repMax}`);
  if (we && nextSet) return `${nextSet.weight > 0 ? `${fmt(nextSet.weight)} × ` : ''}${range(we)}`;
  const n = s.exercises.find((x, j) => j > i && !isExerciseDone(x)) ?? s.exercises.find((x) => !isExerciseDone(x));
  return n ? nameOf(n.exerciseId) : 'завершение тренировки';
}

// ─── Суперсеты ──────────────────────────────────────────────────────────────
// Подряд идущие упражнения с одинаковым ключом `superset` выполняются по кругу: подход A → подход B → отдых.

type Linkable = { superset?: string };

/** Ключи приводятся к виду «ss<индекс первого участника>»; одиночные и разорванные группы распадаются */
export function normalizeSupersets<T extends Linkable>(list: T[]): T[] {
  const out = list.map((x) => ({ ...x }));
  let i = 0;
  while (i < out.length) {
    const key = out[i].superset;
    let j = i + 1;
    if (key) while (j < out.length && out[j].superset === key) j++;
    for (let k = i; k < j; k++) {
      if (key && j - i >= 2) out[k].superset = `ss${i}`;
      else delete out[k].superset;
    }
    i = j;
  }
  return out;
}

/** Индексы упражнений суперсета, в который входит i (или [i]) */
export function supersetMembers(list: Linkable[], i: number): number[] {
  const key = list[i]?.superset;
  if (!key) return [i];
  let a = i;
  let b = i;
  while (a > 0 && list[a - 1].superset === key) a--;
  while (b + 1 < list.length && list[b + 1].superset === key) b++;
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

/** Подписи «A1, A2 …» для участников суперсетов (undefined — обычное упражнение) */
export function supersetLabels(list: Linkable[]): (string | undefined)[] {
  const out: (string | undefined)[] = list.map(() => undefined);
  let group = 0;
  for (let i = 0; i < list.length; ) {
    const m = supersetMembers(list, i);
    if (m.length >= 2) {
      const letter = String.fromCharCode(65 + (group++ % 26));
      m.forEach((idx, k) => (out[idx] = `${letter}${k + 1}`));
    }
    i = m[m.length - 1] + 1;
  }
  return out;
}

/** Объединить упражнение i со следующим в суперсет (группы сливаются) */
export function linkWithNext<T extends Linkable>(list: T[], i: number): T[] {
  if (i < 0 || i + 1 >= list.length) return list;
  const key = list[i].superset ?? list[i + 1].superset ?? 'ss_link';
  const join = new Set([...supersetMembers(list, i), ...supersetMembers(list, i + 1)]);
  return normalizeSupersets(list.map((x, k) => (join.has(k) ? { ...x, superset: key } : x)));
}

/** Убрать упражнение i из суперсета */
export function unlinkSuperset<T extends Linkable>(list: T[], i: number): T[] {
  if (!list[i]?.superset) return list;
  return normalizeSupersets(list.map((x, k) => (k === i ? { ...x, superset: undefined } : x)));
}

/**
 * Куда идти после отмеченного подхода в упражнении i: в суперсете — к следующему участнику без отдыха,
 * после последнего участника круга — отдых и снова к первому, у кого остались подходы.
 */
export function afterSetTarget(s: WorkoutSession, i: number): { index: number; rest: boolean } {
  const m = supersetMembers(s.exercises, i);
  if (m.length < 2) return { index: i, rest: true };
  const left = (k: number) => s.exercises[k].sets.some((x) => !x.done);
  const pos = m.indexOf(i);
  const later = m.slice(pos + 1).find(left);
  if (later !== undefined) return { index: later, rest: false };
  const first = m.find(left);
  return { index: first ?? i, rest: true };
}

/** Связь между i и i+1: связаны — разорвать (группа делится на две), не связаны — объединить */
export function toggleLinkAfter<T extends Linkable>(list: T[], i: number): T[] {
  if (i < 0 || i + 1 >= list.length) return list;
  const key = list[i].superset;
  if (!key || key !== list[i + 1].superset) return linkWithNext(list, i);
  const m = supersetMembers(list, i);
  const after = new Set(m.filter((k) => k > i));
  return normalizeSupersets(list.map((x, k) => (after.has(k) ? { ...x, superset: `${key}_b` } : x)));
}
