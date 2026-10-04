import type { WorkoutExercise } from '@/types';

/**
 * Авторегуляция прямо в тренировке — по факту первых рабочих подходов (RIR — Zourdos 2016;
 * ACSM 2009: нагрузку меняют, когда выполняется заметно больше/меньше целевых повторов).
 * Детерминированные правила (ЭВРИСТИКА RYNJI), меняются только ОСТАВШИЕСЯ подходы и только по кнопке:
 *  • повторы ≥ верхней границы и запас ≥4 (или ≥3 в двух подходах подряд) → +шаг снаряда;
 *  • повторы ниже нижней границы при запасе 0–1 → −~7% (до шага снаряда), цель повторов прежняя;
 *  • ниже границы, но запас ≥2 — вес не трогаем: вероятнее, недотянули темп/технику, а не «слишком тяжело»;
 *  • иначе — продолжаем по плану.
 */
export type Autoreg =
  | { kind: 'increase' | 'decrease'; weight: number; text: string }
  | { kind: 'keep'; text: string }
  | null;

export function autoregulate(we: WorkoutExercise, step: number): Autoreg {
  const done = we.sets.filter((s) => s.done && !s.warmup && s.reps > 0);
  const todo = we.sets.filter((s) => !s.done && !s.warmup);
  if (!done.length || !todo.length) return null;
  const last = done[done.length - 1];
  const w = last.weight;
  if (w <= 0) return null;
  const fmt = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
  const rir = last.rir;
  if (rir === undefined) return null;
  const prev = done.length >= 2 ? done[done.length - 2] : undefined;
  const easyNow = last.reps >= we.repMax && rir >= 4;
  const easyTwice = !!prev && prev.weight === w && last.reps >= we.repMax && prev.reps >= we.repMax && rir >= 3 && (prev.rir ?? 0) >= 3;
  if (easyNow || easyTwice) {
    return { kind: 'increase', weight: w + step, text: `${fmt(w)} × ${last.reps} с запасом ${rir}${rir >= 4 ? '+' : ''} — можно ${fmt(w + step)} кг на оставшиеся подходы.` };
  }
  if (last.reps < we.repMin && rir <= 1) {
    const nw = Math.max(step, Math.round((w * 0.93) / step) * step);
    if (nw < w) return { kind: 'decrease', weight: nw, text: `${fmt(w)} × ${last.reps} — ниже ${we.repMin} без запаса. Снизить до ${fmt(nw)} кг, цель ${we.repMin}–${we.repMax}.` };
  }
  if (last.reps < we.repMin && rir >= 2) return { kind: 'keep', text: `Повторов меньше цели, но запас ${rir} — вес оставляем, добери до ${we.repMin}.` };
  return null;
}
