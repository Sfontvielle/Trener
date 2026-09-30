import type { Exercise, MuscleGroup, PlannedExercise, ReadinessResult, UserProfile, WorkoutDraft, WorkoutSession } from '@/types';
import { EXERCISES, GROUP_LABEL } from '@/data/exercises';
import { addDays, today } from '@/utils/date';
import { uid } from '@/utils/id';
import { estimateMinutes, isAvailable, repRange, weeklySetsTarget } from './planGenerator';
import { setsByGroup } from './analytics';

export type GenFocus = 'auto' | 'push' | 'pull' | 'legs' | 'upper' | 'full';

export const FOCUS_LABEL: Record<GenFocus, string> = {
  auto: 'Авто',
  push: 'Push',
  pull: 'Pull',
  legs: 'Ноги',
  upper: 'Верх',
  full: 'Всё тело',
};

const FOCUS_GROUPS: Record<Exclude<GenFocus, 'auto'>, MuscleGroup[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps', 'shoulders'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
  full: ['quads', 'chest', 'back', 'hamstrings', 'shoulders'],
};

export interface GenerateResult {
  draft: WorkoutDraft;
  rationale: string[];
}

/**
 * Генерация тренировки «здесь и сейчас»:
 * учитывает цель, готовность, недавнюю нагрузку по группам (48–72 ч), недельный объём, время и оборудование.
 */
export function generateWorkout(args: {
  profile: UserProfile;
  sessions: WorkoutSession[];
  minutes: number;
  focus: GenFocus;
  readiness?: ReadinessResult;
  preferIds?: string[];
  quick?: boolean;
}): GenerateResult {
  const { profile, sessions, minutes, readiness } = args;
  const d = today();
  const week = setsByGroup(sessions, addDays(d, -6), d);
  const recent = setsByGroup(sessions, addDays(d, -2), d);
  const [tMin, tMax] = weeklySetsTarget(profile);
  const mid = (tMin + tMax) / 2;
  const rationale: string[] = [];

  const fatigued = (g: MuscleGroup) => (recent[g] ?? 0) >= 5;
  const deficit = (g: MuscleGroup) => {
    const small = g === 'biceps' || g === 'triceps' || g === 'calves' || g === 'abs' || g === 'forearms';
    return (small ? mid * 0.6 : mid) - (week[g] ?? 0);
  };

  let focus = args.focus;
  if (focus === 'auto') {
    const opts = (['push', 'pull', 'legs', 'upper', 'full'] as const).map((f) => {
      const gs = FOCUS_GROUPS[f];
      const score = gs.reduce((a, g) => a + (fatigued(g) ? -8 : Math.max(0, deficit(g))), 0) / gs.length;
      return { f, score };
    });
    opts.sort((a, b) => b.score - a.score);
    focus = args.quick ? 'full' : opts[0].f;
    const rested = FOCUS_GROUPS[focus].filter((g) => !fatigued(g)).map((g) => GROUP_LABEL[g].toLowerCase());
    rationale.push(`Фокус: ${FOCUS_LABEL[focus]} — ${rested.length ? `отдохнувшие группы (${rested.slice(0, 3).join(', ')})` : 'баланс нагрузки'} с наибольшим недобором объёма за неделю.`);
  }
  const groups = [...FOCUS_GROUPS[focus as Exclude<GenFocus, 'auto'>]].sort((a, b) => (fatigued(a) ? 1 : 0) - (fatigued(b) ? 1 : 0) || deficit(b) - deficit(a));
  const tired = groups.filter(fatigued);
  if (tired.length) rationale.push(`Недавно нагружались: ${tired.map((g) => GROUP_LABEL[g].toLowerCase()).join(', ')} — для них меньше подходов.`);

  const vf = readiness?.volumeFactor ?? 1;
  const rirDelta = readiness?.rirDelta ?? 0;
  if (readiness && readiness.band !== 'go') rationale.push(`Готовность ${readiness.score}/100 → объём ×${vf}, запас +${rirDelta} повтор(а).`);

  const avail = EXERCISES.filter((e) => isAvailable(e, profile.equipment, profile.location, profile.avoidExerciseIds));
  const prefer = new Set(args.preferIds ?? []);
  const used = new Set<string>();
  const exercises: PlannedExercise[] = [];
  // Низкая готовность = короче и легче, а не «те же минуты, но больше упражнений»
  const budget = Math.max(15, Math.round(minutes * Math.max(0.55, vf)));
  const maxExercises = Math.max(3, Math.min(8, Math.round(budget / 10)));

  const pick = (g: MuscleGroup, mech: 'compound' | 'isolation'): Exercise | undefined => {
    const pool = avail.filter((e) => e.groups.primary[0] === g && e.mechanic === mech && !used.has(e.id) && !usedPattern(e));
    pool.sort((a, b) => (prefer.has(b.id) ? 1 : 0) - (prefer.has(a.id) ? 1 : 0) || a.tier - b.tier);
    return readiness && readiness.band === 'recover' ? pool.sort((a, b) => b.tier - a.tier)[0] : pool[0];
  };
  const patterns = new Map<string, number>();
  const usedPattern = (e: Exercise) => (patterns.get(e.pattern) ?? 0) >= 2;

  const add = (ex: Exercise, role: 'main' | 'secondary' | 'accessory', g: MuscleGroup) => {
    const base = role === 'main' ? 4 : 3;
    let sets = Math.max(2, Math.round(base * vf));
    if (fatigued(g)) sets = Math.max(2, sets - 1);
    const [repMin, repMax] = repRange(ex, role, profile.goal);
    const rest = role === 'main' ? 150 : ex.mechanic === 'compound' ? 120 : 75;
    const pe: PlannedExercise = { exerciseId: ex.id, sets, repMin, repMax, targetRir: (profile.level === 'beginner' ? 2 : 1) + (role === 'main' ? 1 : 0) + rirDelta, restSec: args.quick ? Math.min(rest, 90) : rest };
    if (exercises.length >= maxExercises) return false;
    const trial = [...exercises, pe];
    if (estimateMinutes(trial) > budget + 3) return false;
    exercises.push(pe);
    used.add(ex.id);
    patterns.set(ex.pattern, (patterns.get(ex.pattern) ?? 0) + 1);
    return true;
  };

  // 1) по одному базовому на главные группы фокуса
  for (const g of groups.slice(0, focus === 'full' ? 4 : 3)) {
    const ex = pick(g, 'compound') ?? pick(g, 'isolation');
    if (ex) add(ex, exercises.length === 0 ? 'main' : 'secondary', g);
  }
  // 2) изолирующие по недобору, пока есть время
  let guard = 0;
  while (guard++ < 12) {
    const g = groups.find((x) => !exercises.some((pe) => EXERCISES.find((e) => e.id === pe.exerciseId)?.groups.primary.includes(x)))
      ?? groups[guard % groups.length];
    const ex = pick(g, 'isolation') ?? pick(g, 'compound');
    if (!ex || !add(ex, 'accessory', g)) break;
  }

  const name = args.quick ? 'Быстрая тренировка' : `${FOCUS_LABEL[focus]} · сгенерирована`;
  const focusText = groups.slice(0, 3).map((g) => GROUP_LABEL[g]).join(' · ');
  rationale.push(`~${estimateMinutes(exercises)} мин, ${exercises.reduce((a, e) => a + e.sets, 0)} рабочих подходов.`);

  return {
    draft: { id: uid('d_'), name, focus: focusText, source: args.quick ? 'quick' : 'generated', exercises, createdAt: Date.now() },
    rationale,
  };
}
