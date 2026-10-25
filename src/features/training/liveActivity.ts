import type { WeightUnit, WorkoutSession } from '@/types';
import { currentIndexOf, isExerciseDone, supersetLabels } from './workoutNav';
import { fmtSec, fmtWeight, unitLabel } from '@/utils/format';

/**
 * Live Activity активной тренировки (экран блокировки и Dynamic Island) — чистое отображение
 * существующего состояния тренировки (useWorkouts.active + rest). Своей истории подходов у неё нет:
 * всё считается из active на каждое изменение. Без сервера и push — обновляет само приложение.
 */
export interface WorkoutActivityProps {
  workoutId: string;
  /** Название тренировки */
  title: string;
  /** Текущее упражнение (в суперсете — то, что выбрано сейчас) */
  exercise: string;
  /** «A1» для суперсета, иначе пусто */
  superset: string;
  /** Номер текущего рабочего подхода (1…N); 0 — разминка или упражнение выполнено */
  setNo: number;
  /** Рабочих подходов в упражнении */
  setTotal: number;
  /** «Подход 2 из 4» / «Разминка» / «Готово · 4 из 4» */
  setText: string;
  /** Запланированное: «60 кг × 8», «Свой вес × 12», «0:45» (на время — секунды, а не кг и повторы) */
  target: string;
  timed: boolean;
  /** Что дальше: «Далее: Тяга верхнего блока» или пусто */
  next: string;
  /** Упражнение k из n */
  exerciseNo: number;
  exerciseTotal: number;
  /** Доля выполненных подходов 0…1 */
  progress: number;
  /** Начало тренировки, мс — секундомер считает сам виджет */
  startedAt: number;
  /** Отдых (если запущен вручную): начало и конец, мс; 0 — нет */
  restFrom: number;
  restTo: number;
  /** Все подходы выполнены — осталось завершить */
  allDone: boolean;
}

export interface ActivityDeps {
  nameOf: (exerciseId: string) => string;
  isTimed: (exerciseId: string) => boolean;
  isBodyweight: (exerciseId: string) => boolean;
  unit: WeightUnit;
  rest: { startedAt: number; endsAt: number } | null;
}

export function workoutActivityProps(s: WorkoutSession, d: ActivityDeps): WorkoutActivityProps {
  const total = s.exercises.length;
  const i = currentIndexOf(s);
  const we = s.exercises[i];
  const labels = supersetLabels(s.exercises);
  const allSets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const allDone = allSets > 0 && doneSets === allSets;
  const base = {
    workoutId: s.id,
    title: s.name,
    exerciseNo: total ? i + 1 : 0,
    exerciseTotal: total,
    progress: allSets ? Math.round((doneSets / allSets) * 100) / 100 : 0,
    startedAt: s.startedAt,
    restFrom: d.rest ? d.rest.startedAt : 0,
    restTo: d.rest ? d.rest.endsAt : 0,
    allDone,
  };
  if (!we) return { ...base, exercise: s.name, superset: '', setNo: 0, setTotal: 0, setText: 'Добавь упражнения', target: '', timed: false, next: '' };

  const timed = d.isTimed(we.exerciseId);
  const work = we.sets.filter((x) => !x.warmup);
  const nextSet = we.sets.find((x) => !x.done);
  const setNo = nextSet && !nextSet.warmup ? work.indexOf(nextSet) + 1 : 0;
  const workDone = work.filter((x) => x.done).length;
  const setText = !nextSet ? `Готово · ${workDone} из ${work.length}` : nextSet.warmup ? 'Разминка' : `Подход ${setNo} из ${work.length}`;

  let target = '';
  if (nextSet) {
    if (timed) target = `${nextSet.weight > 0 ? `${fmtWeight(nextSet.weight, d.unit)} ${unitLabel(d.unit)} · ` : ''}${fmtSec(nextSet.reps || we.repMax)}`;
    else {
      const reps = nextSet.reps || we.repMax;
      const load = nextSet.weight > 0 ? `${fmtWeight(nextSet.weight, d.unit)} ${unitLabel(d.unit)}` : d.isBodyweight(we.exerciseId) ? 'Свой вес' : '';
      target = load ? `${load} × ${reps}` : `${reps} повт.`;
    }
  }

  // Дальше: следующее невыполненное упражнение (в суперсете — следующее по кругу уже стоит текущим)
  const nextEx = isExerciseDone(we) ? s.exercises.find((x, j) => j > i && !isExerciseDone(x)) ?? s.exercises.find((x, j) => j !== i && !isExerciseDone(x)) : undefined;
  const next = allDone ? 'Все подходы выполнены — заверши тренировку' : nextEx ? `Далее: ${d.nameOf(nextEx.exerciseId)}` : '';

  return { ...base, exercise: d.nameOf(we.exerciseId) || 'Упражнение', superset: labels[i] ?? '', setNo, setTotal: work.length, setText, target, timed, next };
}

/** Ключ для пропуска одинаковых обновлений (ActivityKit не любит лишних вызовов) */
export function activityKey(p: WorkoutActivityProps): string {
  return JSON.stringify(p);
}

/**
 * Что сделать с Live Activity при переходе состояния:
 *  start — тренировка есть, активности нет; update — есть обе, данные изменились; end — тренировки нет.
 * Лишние (больше одной) и активности прошлых тренировок закрываются — на тренировку всегда ровно одна.
 * owners — чья это активность (id тренировки), если известно; после перезапуска приложения — неизвестно (принимаем).
 */
export type ActivityPlan = { start: boolean; keep: string | null; endIds: string[]; update: boolean };

export function planActivity(args: { workoutId: string | null; instances: { id: string; owner?: string }[]; changed: boolean }): ActivityPlan {
  if (!args.workoutId) return { start: false, keep: null, endIds: args.instances.map((x) => x.id), update: false };
  const mine = args.instances.filter((x) => !x.owner || x.owner === args.workoutId);
  const stale = args.instances.filter((x) => x.owner && x.owner !== args.workoutId).map((x) => x.id);
  const [keep, ...extra] = mine;
  if (!keep) return { start: true, keep: null, endIds: stale, update: false };
  return { start: false, keep: keep.id, endIds: [...stale, ...extra.map((x) => x.id)], update: args.changed };
}
