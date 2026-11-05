import type { Exercise, GymSetup, PlannedExercise, ReadinessBand, Recommendation, WorkoutExercise, WorkoutSession, WorkoutSource } from '@/types';
import { getExercise } from '@/data/exercises';
import { uid } from '@/utils/id';
import { today } from '@/utils/date';
import { historyFor, recommend, TIME_STEP_SEC, type ExerciseHistoryEntry } from './progression';
import { normalizeSupersets } from './workoutNav';
import { scaleSets } from './scale';

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
  gym?: GymSetup;
  /** Сигналы здоровья: повышение нагрузки запрещено (причина) */
  noIncrease?: string;
}

/**
 * Цель на каждый подход — число над строкой подхода. Двойная прогрессия:
 *  • вес — из рекомендации (прибавка, откат или первый раз → низ диапазона повторов);
 *  • тот же вес — прошлый результат этого же подхода +1 повтор (+5 с у упражнений на время), не выше верха диапазона;
 *  • прошлый подход был с другим весом — низ диапазона;
 *  • сниженная готовность или запрет повышения по здоровью — без прибавки: повторить прошлый результат.
 */
export function setTargets(args: { rec: Recommendation; last?: ExerciseHistoryEntry; step: number; easy?: boolean }): { weight: number; reps: number }[] {
  const { rec, last, step } = args;
  const fresh = rec.action === 'increase' || rec.action === 'decrease' || rec.action === 'new';
  return Array.from({ length: rec.sets }, (_, i) => {
    // Подходов больше, чем в прошлый раз, — сравниваем с последним сделанным
    const prev = last?.sets[i] ?? last?.sets[last.sets.length - 1];
    if (fresh || !prev || prev.weight !== rec.weight) return { weight: rec.weight, reps: rec.repMin };
    const reps = Math.min(rec.repMax, Math.max(rec.repMin, prev.reps + (args.easy ? 0 : step)));
    return { weight: rec.weight, reps };
  });
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
    gym: ctx.gym,
    noIncrease: ctx.noIncrease,
  });
  // Вес, согласованный с тренером, главнее авто-прогрессии (пользователь подтвердил его явно)
  const rec = pe.targetWeight !== undefined ? { ...base, weight: pe.targetWeight, rationale: `Вес ${pe.targetWeight} кг согласован с тренером. ${base.rationale}` } : base;
  // Подходы предзаполнены целью: ✓ — сделал как задумано, правка — если вышло иначе.
  // Шаг «добрать»: +1 повтор, у упражнений на время — +5 секунд
  const step = ex.metric === 'time' ? TIME_STEP_SEC : 1;
  const easy = !!ctx.noIncrease || ctx.band === 'reduce' || ctx.band === 'light' || ctx.band === 'recover';
  const sets = setTargets({ rec, last: history[0], step, easy }).map((t) => ({ id: uid('s_'), weight: t.weight, reps: t.reps, done: false, target: t }));
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
    ...(pe.superset ? { superset: pe.superset } : {}),
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
  // Множитель объёма распределяется по тренировке целиком (см. scaleSets), рекомендации — уже на итоговое число подходов
  const counts = scaleSets(args.planned.map((pe) => pe.sets), args.ctx.volumeFactor);
  const exercises = normalizeSupersets(args.planned.map((pe, i) => makeWorkoutExercise({ ...pe, sets: counts[i] }, { ...args.ctx, volumeFactor: 1 })).filter((x): x is WorkoutExercise => !!x));
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
