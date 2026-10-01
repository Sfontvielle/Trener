import type { Exercise, TrainingPreferences, UserProfile, VolumeMuscle, WorkoutSession, WorkoutTemplate } from '@/types';
import { getExercise } from '@/data/exercises';
import { workingSets } from '../progression';
import { fineTargets, MUSCLE_SHARE, VOLUME_MUSCLES } from './muscles';

/** База — прямые рабочие подходы в неделю на крупную группу (грудь, квадрицепс) */
export function baseWeeklySets(p: Pick<UserProfile, 'level' | 'goal'>): number {
  const base = p.level === 'beginner' ? 9 : p.level === 'intermediate' ? 12 : 15;
  const k = p.goal === 'cut' ? 0.85 : p.goal === 'maintain' ? 0.65 : 1;
  return base * k;
}

/** Недельная цель прямых подходов по каждой группе (с приоритетами и ручными поправками) */
/** factor — множитель восстановления (0.85…1.15, см. engine/recovery) */
export function weeklyTargets(p: Pick<UserProfile, 'level' | 'goal'>, prefs: TrainingPreferences, factor = 1): Record<VolumeMuscle, number> {
  const base = baseWeeklySets(p) * factor;
  const out = {} as Record<VolumeMuscle, number>;
  for (const m of VOLUME_MUSCLES) {
    let share = MUSCLE_SHARE[m];
    if (m === 'front_delts') share = 0.35; // жимы дают много косвенной работы
    let t = base * share;
    if (prefs.priorityMuscles.includes(m)) t = Math.max(t * 1.3, t + 3);
    if (prefs.lowPriorityMuscles.includes(m)) t = t * 0.6;
    t = Math.round(t) + (prefs.volumeAdjust[m] ?? 0);
    out[m] = Math.max(0, t);
  }
  return out;
}

/** Запланированные прямые подходы по группам: шаблон × сколько раз он идёт в неделю */
export function plannedFineVolume(templates: WorkoutTemplate[], occurrences: Record<string, number>, customs: Exercise[] = []): Record<VolumeMuscle, number> {
  const out = Object.fromEntries(VOLUME_MUSCLES.map((m) => [m, 0])) as Record<VolumeMuscle, number>;
  for (const t of templates) {
    const occ = occurrences[t.id] ?? 0;
    for (const pe of t.exercises) {
      const ex = getExercise(pe.exerciseId, customs);
      if (!ex) continue;
      for (const m of fineTargets(ex).primary) out[m] += pe.sets * occ;
    }
  }
  for (const m of VOLUME_MUSCLES) out[m] = Math.round(out[m] * 10) / 10;
  return out;
}

/** Фактически выполненные прямые подходы по группам за период */
export function doneFineVolume(sessions: WorkoutSession[], from: string, to: string, customs: Exercise[] = []): Record<VolumeMuscle, number> {
  const out = Object.fromEntries(VOLUME_MUSCLES.map((m) => [m, 0])) as Record<VolumeMuscle, number>;
  for (const s of sessions) {
    if (s.status !== 'completed' || s.date < from || s.date > to) continue;
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId, customs);
      if (!ex) continue;
      const n = workingSets(we.sets).length;
      for (const m of fineTargets(ex).primary) out[m] += n;
    }
  }
  return out;
}

export interface SetLimits {
  start: (role: 'main' | 'secondary' | 'accessory') => number;
  min: number;
  max: (role: 'main' | 'secondary' | 'accessory') => number;
  /** «Мягкий» максимум, если добавить упражнение некуда */
  softMax: (role: 'main' | 'secondary' | 'accessory') => number;
}

/** Границы подходов на упражнение по стилю пользователя */
export function setLimits(style: TrainingPreferences['setStyle'], level: UserProfile['level'] = 'intermediate'): SetLimits {
  if (style === 2) return { start: () => 2, min: 2, max: () => 2, softMax: (r) => (r === 'main' ? 3 : 2) };
  if (style === 3) return { start: () => 3, min: 2, max: () => 3, softMax: (r) => (r === 'main' ? 4 : 3) };
  return {
    start: (r) => (r === 'accessory' ? 2 : 3),
    min: 2,
    // Новичку 5 подходов в одном упражнении не нужны — лучше ещё одно упражнение
    max: (r) => (level === 'beginner' ? (r === 'main' ? 4 : 3) : r === 'main' ? 5 : 4),
    softMax: (r) => (level === 'beginner' ? (r === 'main' ? 4 : 3) : r === 'main' ? 5 : 4),
  };
}
