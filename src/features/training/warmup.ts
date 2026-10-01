import type { Exercise } from '@/types';

export const BAR_KG = 20;
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

const round = (x: number, step: number) => Math.round(x / step) * step;

/**
 * Разминочные подходы перед тяжёлым базовым со штангой/тренажёром:
 * пустой гриф ×10, ~50% ×5, ~70% ×3, ~85% ×1 (только веса заметно ниже рабочего).
 */
export function warmupSets(ex: Exercise, workWeight: number): { weight: number; reps: number }[] {
  if (ex.mechanic !== 'compound' || ex.tier !== 1 || workWeight < 40) return [];
  const barbell = ex.equipment.includes('barbell') || ex.equipment.includes('smith');
  const step = barbell ? 2.5 : ex.increment || 2.5;
  const start = barbell ? BAR_KG : round(workWeight * 0.35, step);
  const out: { weight: number; reps: number }[] = [{ weight: start, reps: 10 }];
  for (const [pct, reps] of [[0.5, 5], [0.7, 3], [0.85, 1]] as const) {
    const w = round(workWeight * pct, step);
    if (w > out[out.length - 1].weight && w <= workWeight - step) out.push({ weight: w, reps });
  }
  return out;
}

/** Блины на одну сторону грифа (20 кг). null — вес не набирается стандартными блинами */
export function platesPerSide(total: number, bar = BAR_KG): number[] | null {
  let side = (total - bar) / 2;
  if (side < 0) return null;
  const out: number[] = [];
  for (const p of PLATES) {
    while (side >= p - 1e-6) {
      out.push(p);
      side -= p;
    }
  }
  return side > 0.01 ? null : out;
}

export function usesBarbell(ex: Exercise): boolean {
  return ex.equipment.includes('barbell');
}
