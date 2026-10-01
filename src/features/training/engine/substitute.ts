import type { Exercise, TrainingPreferences, UserProfile } from '@/types';
import { EXERCISES, getExercise } from '@/data/exercises';
import { fineTargets } from './muscles';
import { checkAllowed, fatigueCost, QUALITY } from './scoring';
import { exerciseStress, loadsArea } from './restrictions';

/**
 * Поиск замены: та же основная мышца + тот же паттерн (тип движения/сустав) + близкий профиль
 * усталости и диапазон повторений. Тяжёлый горизонтальный жим заменяется жимом, а не разведением.
 */
export function similarity(a: Exercise, b: Exercise): number {
  const fa = fineTargets(a);
  const fb = fineTargets(b);
  let s = 0;
  if (fa.primary[0] && fa.primary[0] === fb.primary[0]) s += 40;
  else if (fa.primary.some((m) => fb.primary.includes(m))) s += 25;
  if (a.pattern === b.pattern) s += 30;
  if (a.mechanic === b.mechanic) s += 12;
  s -= Math.abs(fatigueCost(a) - fatigueCost(b)) * 5;
  s -= Math.abs(a.defaultReps[0] - b.defaultReps[0]) * 0.8;
  // Тот же класс оборудования (свободный вес / тренажёр / блок / свой вес) — проще перенести рабочие веса
  const cls = (e: Exercise) => (e.equipment.includes('machine') || e.equipment.includes('smith') ? 'm' : e.equipment.includes('cable') ? 'c' : e.bodyweight ? 'b' : 'f');
  if (cls(a) === cls(b)) s += 4;
  // Лучше нагружаемые аналоги — выше (жим гантелей раньше жима с отрицательным наклоном)
  s += ((QUALITY[b.id] ?? 5) - 5) * 1.5;
  return s;
}

export function substitutesFor(exerciseId: string, profile: UserProfile, prefs: TrainingPreferences, customs: Exercise[] = [], limit = 8): Exercise[] {
  const ex = getExercise(exerciseId, customs);
  if (!ex) return [];
  const pool = [...EXERCISES, ...customs].filter((e) => e.id !== ex.id && checkAllowed(e, profile, prefs).ok);
  // Замена из-за дискомфорта: не предлагать то же самое движение (жим штанги → жим штанги на наклонной)
  const pain = prefs.excluded.find((x) => x.exerciseId === ex.id && x.reason === 'discomfort');
  const stress = pain ? exerciseStress(ex) : [];
  const painPenalty = (e: Exercise) => {
    if (!pain) return 0;
    let p = exerciseStress(e).some((m) => stress.includes(m)) ? 25 : 0;
    if (pain.area && loadsArea(e, pain.area)) p += 10;
    return p;
  };
  return pool
    .map((e) => ({ e, s: similarity(ex, e) + (prefs.preferredExercises.includes(e.id) ? 8 : 0) - (prefs.dislikedExercises.includes(e.id) ? 30 : 0) - painPenalty(e) }))
    .filter((x) => x.s >= (pain ? 20 : 35))
    .sort((a, b) => b.s - a.s || a.e.id.localeCompare(b.e.id))
    .slice(0, limit)
    .map((x) => x.e);
}
