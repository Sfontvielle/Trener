import type { Exercise, ExerciseSet, ReadinessBand, Recommendation, WorkoutSession } from '@/types';
import { fmtWeight } from '@/utils/format';

/**
 * Двойная прогрессия с учётом RIR/ощущений и готовности.
 * 1) Все рабочие подходы на верхней границе диапазона с запасом → +вес.
 * 2) В диапазоне → тот же вес, добираем повторы.
 * 3) Два и более подхода ниже диапазона → держим вес; если так уже вторую тренировку подряд → −5–10%.
 * Низкая готовность запрещает повышение.
 */

export interface ExerciseHistoryEntry {
  date: string;
  sets: ExerciseSet[];
  repMin: number;
  repMax: number;
}

export function workingSets(sets: ExerciseSet[]): ExerciseSet[] {
  return sets.filter((s) => s.done && !s.warmup && s.reps > 0);
}

export function historyFor(exerciseId: string, sessions: WorkoutSession[], limit = 6): ExerciseHistoryEntry[] {
  const out: ExerciseHistoryEntry[] = [];
  const sorted = sessions.filter((s) => s.status === 'completed').sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
  for (const s of sorted) {
    for (const we of s.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      const ws = workingSets(we.sets);
      if (ws.length) out.push({ date: s.date, sets: ws, repMin: we.repMin, repMax: we.repMax });
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  const r = Math.min(reps, 12);
  return weight * (1 + r / 30);
}

function roundTo(x: number, step: number): number {
  if (step <= 0) return Math.round(x * 2) / 2;
  return Math.round(x / step) * step;
}

function effortOk(sets: ExerciseSet[], targetRir: number): boolean {
  const withRir = sets.filter((s) => s.rir !== undefined);
  if (withRir.length) {
    const avg = withRir.reduce((a, s) => a + (s.rir ?? 0), 0) / withRir.length;
    return avg >= Math.max(0.5, targetRir - 1);
  }
  const hard = sets.filter((s) => s.feel === 'hard' || s.feel === 'max').length;
  return hard <= Math.floor(sets.length / 3);
}

export function recommend(args: {
  exercise: Exercise;
  plannedSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  history: ExerciseHistoryEntry[];
  band?: ReadinessBand;
  volumeFactor?: number;
  rirDelta?: number;
}): Recommendation {
  const { exercise: ex, repMin, repMax, history, band } = args;
  const vf = args.volumeFactor ?? 1;
  const sets = Math.max(1, Math.round(args.plannedSets * vf));
  const rirDelta = args.rirDelta ?? (band === 'light' ? 1 : band === 'recover' ? 2 : 0);
  const targetRir = args.targetRir + rirDelta;
  const lowReadiness = band === 'reduce' || band === 'light' || band === 'recover';

  const last = history[0];
  if (!last) {
    return {
      weight: 0,
      repMin,
      repMax,
      sets,
      targetRir,
      action: 'new',
      rationale: ex.bodyweight
        ? `Первый раз: сделай ${repMin}–${repMax} повторов с запасом ${targetRir}.`
        : `Первый раз: подбери вес, с которым ${repMax} повторов оставляют ${targetRir}–${targetRir + 1} в запасе.`,
    };
  }

  const top = Math.max(...last.sets.map((s) => s.weight));
  const atTop = last.sets.filter((s) => s.weight === top);
  const minReps = Math.min(...atTop.map((s) => s.reps));
  const below = atTop.filter((s) => s.reps < repMin).length;
  const allTop = atTop.length >= Math.min(2, sets) && atTop.every((s) => s.reps >= repMax);
  const ok = effortOk(atTop, args.targetRir);
  const lastStr = atTop.map((s) => s.reps).join('/');
  const w = (x: number) => `${fmtWeight(x)} кг`;

  if (ex.bodyweight && top === 0) {
    const best = Math.max(...last.sets.map((s) => s.reps));
    if (allTop && ok && !lowReadiness) {
      return { weight: 0, repMin: repMin + 1, repMax: repMax + 1, sets, targetRir, action: 'reps', rationale: `Прошлый раз ${lastStr} — верх диапазона. Добавь повтор в каждом подходе или возьми отягощение.` };
    }
    return { weight: 0, repMin, repMax, sets, targetRir, action: 'hold', rationale: `Прошлый раз ${lastStr} (лучший ${best}). Цель — ${repMax} во всех подходах.` };
  }

  if (allTop && ok) {
    if (lowReadiness) {
      return { weight: top, repMin, repMax, sets, targetRir, action: 'hold', rationale: `Готов к +${fmtWeight(ex.increment)} кг (${lastStr}), но готовность сегодня снижена — держим ${w(top)}.` };
    }
    const next = roundTo(top + ex.increment, ex.increment >= 2 ? ex.increment / 2 : 0.5);
    return { weight: next, repMin, repMax, sets, targetRir, action: 'increase', rationale: `Прошлый раз ${w(top)} × ${lastStr} с запасом — пробуем ${w(next)}.` };
  }
  if (allTop && !ok) {
    return { weight: top, repMin, repMax, sets, targetRir, action: 'hold', rationale: `${w(top)} × ${lastStr}, но подходы шли тяжело. Закрепим вес, потом +${fmtWeight(ex.increment)} кг.` };
  }

  if (below >= 2 || (atTop.length === 1 && below === 1)) {
    const prev = history[1];
    const prevTop = prev ? Math.max(...prev.sets.map((s) => s.weight)) : 0;
    const prevFailed = prev && prevTop === top && prev.sets.filter((s) => s.weight === top && s.reps < repMin).length >= 2;
    if (prevFailed) {
      const next = Math.max(0, roundTo(top * 0.92, ex.increment >= 2 ? ex.increment / 2 : 0.5));
      return { weight: next, repMin, repMax, sets, targetRir, action: 'decrease', rationale: `Две тренировки подряд ниже ${repMin} повторов на ${w(top)}. Снизим до ${w(next)} и наберём повторы заново.` };
    }
    return { weight: top, repMin, repMax, sets, targetRir, action: 'hold', rationale: `Прошлый раз ${w(top)} × ${lastStr} — ниже диапазона. Не повышаем, цель — ${repMin}+ во всех подходах.` };
  }

  return {
    weight: top,
    repMin,
    repMax,
    sets,
    targetRir,
    action: 'reps',
    rationale: `Прошлый раз ${w(top)} × ${lastStr}. Тот же вес, добери до ${repMax} повторов${minReps < repMax ? ` (минимум ${Math.min(repMax, minReps + 1)})` : ''}.`,
  };
}

/** Лучший подход сессии по e1RM */
export function bestSet(sets: ExerciseSet[]): { weight: number; reps: number; e1rm: number } | undefined {
  let best: { weight: number; reps: number; e1rm: number } | undefined;
  for (const s of workingSets(sets)) {
    const v = s.weight > 0 ? e1rm(s.weight, s.reps) : s.reps;
    if (!best || v > best.e1rm) best = { weight: s.weight, reps: s.reps, e1rm: v };
  }
  return best;
}

/** Проверка личного рекорда: превышен ли лучший e1RM (или повторы для собственного веса) из истории */
export function isPersonalRecord(ex: Exercise, set: ExerciseSet, history: ExerciseHistoryEntry[]): boolean {
  if (!set.done || set.reps <= 0 || history.length === 0) return false;
  const bw = ex.bodyweight && set.weight === 0;
  const val = bw ? set.reps : e1rm(set.weight, set.reps);
  let prev = 0;
  for (const h of history) for (const s of h.sets) {
    const v = bw ? (s.weight === 0 ? s.reps : 0) : e1rm(s.weight, s.reps);
    if (v > prev) prev = v;
  }
  return prev > 0 && val > prev + (bw ? 0 : 0.01);
}
