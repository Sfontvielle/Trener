import type { Exercise, ExerciseSet, ReadinessBand, Recommendation, WorkoutSession , GymSetup } from '@/types';
import { fmtWeight } from '@/utils/format';
import { DEFAULT_GYM, equipmentStep, loadKind, roundToEquipment } from './equipment';

/**
 * Progressive overload — двойная прогрессия (ACSM 2009: когда выполняешь на 1–2 повтора больше цели
 * в двух тренировках подряд/во всех подходах — +2–10% нагрузки; ACSM 2026: близость к отказу ~2–3 RIR
 * достаточна для гипертрофии; RIR-шкала — Zourdos 2016).
 * Правила (детерминированные, порядок важен):
 *  0) нет истории → подобрать вес с запасом 2–3 повтора;
 *  1) прошлый раз выполнены НЕ все запланированные подходы → вес не повышаем (провал ≠ прогресс);
 *  2) прошлое повышение не удалось (ниже диапазона) → возврат к предыдущему весу;
 *  3) все подходы на верхней границе с нормальным запасом → + минимальный шаг оборудования
 *     (например 50 → 52,5 кг при диапазоне 8–10, а не сразу 55);
 *  4) в диапазоне → тот же вес, +1 повтор;
 *  5) ниже диапазона → держим; вторую тренировку подряд → −8% (округление до шага);
 *  Низкая готовность (сон, HRV, пульс, усталость) запрещает повышение — вес держим.
 * Шаг повышения = минимальный доступный шаг оборудования (ex.increment) — ЭВРИСТИКА: ACSM даёт 2–10%.
 */

export interface ExerciseHistoryEntry {
  date: string;
  sets: ExerciseSet[];
  repMin: number;
  repMax: number;
  /** Сколько подходов было запланировано (для «не все подходы выполнены») */
  plannedSets?: number;
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
      if (ws.length) out.push({ date: s.date, sets: ws, repMin: we.repMin, repMax: we.repMax, plannedSets: we.plannedSets });
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

/**
 * Реальный шаг весов в ТВОЁМ зале. Стандартный шаг упражнения (ex.increment) — минимальный; если все
 * использованные веса кратны большему шагу (например, стек тренажёра по 5 кг или гантели 12,5/15/17,5),
 * RYNJI предлагает именно его — чтобы рекомендация была весом, который реально можно поставить.
 * ЭВРИСТИКА: нужно ≥2 разных рабочих веса в истории; шаг только увеличивается (не меньше ex.increment).
 */
const STEPS = [5, 4, 2.5, 2, 1.25, 1, 0.5];
export function effectiveIncrement(base: number, history: ExerciseHistoryEntry[]): number {
  const ws = [...new Set(history.flatMap((h) => h.sets.map((s) => s.weight)).filter((w) => w > 0))];
  if (ws.length < 2 || base <= 0) return base;
  const fits = (st: number) => ws.every((w) => Math.abs(w / st - Math.round(w / st)) < 1e-6);
  return STEPS.find((st) => st >= base && fits(st)) ?? base;
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
  /** Оборудование зала — рекомендуются только реально выставляемые веса */
  gym?: GymSetup;
}): Recommendation {
  const { repMin, repMax, history, band } = args;
  const gym = args.gym ?? DEFAULT_GYM;
  // Шаг: реальный шаг оборудования → уточняется по весам, которые человек реально ставил
  const lk = loadKind(args.exercise);
  // Тренажёры: берём больший из шага стека и шага упражнения (жим ногами прибавляют по 5 кг на сторону)
  const baseStep = lk === 'none' ? args.exercise.increment : lk === 'machine' ? Math.max(equipmentStep(args.exercise, gym), args.exercise.increment) : equipmentStep(args.exercise, gym);
  const ex = { ...args.exercise, increment: effectiveIncrement(baseStep, history) };
  const fit = (w: number, dir: 'up' | 'down') => (loadKind(ex) === 'none' ? w : roundToEquipment(w, args.exercise, gym, dir));
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
      delta: 'Подобрать вес',
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
      return { weight: 0, repMin: repMin + 1, repMax: repMax + 1, sets, targetRir, action: 'reps', delta: '+1 повтор', rationale: `Прошлый раз ${lastStr} — верх диапазона. Добавь повтор в каждом подходе или возьми отягощение.` };
    }
    return { weight: 0, repMin, repMax, sets, targetRir, action: 'hold', delta: '+1 повтор', rationale: `Прошлый раз ${lastStr} (лучший ${best}). Цель — ${repMax} во всех подходах.` };
  }

  // 1) Провал прошлой тренировки: выполнено меньше подходов, чем планировалось
  if (last.plannedSets && last.sets.length < last.plannedSets) {
    return { weight: top, repMin, repMax, sets, targetRir, action: 'hold', delta: `Оставить ${w(top)}`, rationale: `Прошлый раз выполнено ${last.sets.length} из ${last.plannedSets} подходов — вес не повышаем, сначала все подходы в диапазоне ${repMin}–${repMax}.` };
  }
  // 2) Прошлое повышение не удалось: вес вырос, а повторы ниже диапазона → вернуться
  const prevEntry = history[1];
  const prevTop = prevEntry ? Math.max(...prevEntry.sets.map((s) => s.weight)) : 0;
  if (prevEntry && prevTop > 0 && top > prevTop && below >= 1) {
    return { weight: prevTop, repMin, repMax, sets, targetRir, action: 'decrease', delta: `−${fmtWeight(top - prevTop)} кг`, rationale: `Повышение до ${w(top)} не получилось (${lastStr}, ниже ${repMin}). Возвращаемся к ${w(prevTop)} и добираем повторы до ${repMax}.` };
  }

  if (allTop && ok) {
    if (lowReadiness) {
      return { weight: top, repMin, repMax, sets, targetRir, action: 'hold', delta: `Оставить ${w(top)}`, rationale: `Готов к +${fmtWeight(ex.increment)} кг (${lastStr}), но готовность сегодня снижена — держим ${w(top)}.` };
    }
    const next = fit(roundTo(top + ex.increment, ex.increment >= 2 ? ex.increment / 2 : 0.5), 'up');
    return { weight: next, repMin, repMax, sets, targetRir, action: 'increase', delta: `+${fmtWeight(next - top)} кг`, rationale: `Прошлый раз ${w(top)} × ${lastStr} с запасом — пробуем ${w(next)}.` };
  }
  if (allTop && !ok) {
    return { weight: top, repMin, repMax, sets, targetRir, action: 'hold', delta: `Оставить ${w(top)}`, rationale: `${w(top)} × ${lastStr}, но подходы шли тяжело. Закрепим вес, потом +${fmtWeight(ex.increment)} кг.` };
  }

  if (below >= 2 || (atTop.length === 1 && below === 1)) {
    const prevFailed = prevEntry && prevTop === top && prevEntry.sets.filter((s) => s.weight === top && s.reps < repMin).length >= 2;
    if (prevFailed) {
      const next = Math.max(0, fit(roundTo(top * 0.92, ex.increment >= 2 ? ex.increment / 2 : 0.5), 'down'));
      return { weight: next, repMin, repMax, sets, targetRir, action: 'decrease', delta: `−${fmtWeight(top - next)} кг`, rationale: `Две тренировки подряд ниже ${repMin} повторов на ${w(top)}. Снизим до ${w(next)} и наберём повторы заново.` };
    }
    return { weight: top, repMin, repMax, sets, targetRir, action: 'hold', delta: `Оставить ${w(top)}`, rationale: `Прошлый раз ${w(top)} × ${lastStr} — ниже диапазона. Не повышаем, цель — ${repMin}+ во всех подходах.` };
  }

  return {
    weight: top,
    repMin,
    repMax,
    sets,
    targetRir,
    action: 'reps',
    delta: '+1 повтор',
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
