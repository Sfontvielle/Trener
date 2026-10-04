import type { ReadinessResult } from '@/types';
import { bodyNarrative, type BodyTrend } from './bodyTrend';
import { CATEGORY_LABEL, readinessCategory, type ReadinessCategory } from './recovery';

/**
 * Выводы для Главной — только из алгоритмов (категория готовности, тренд тела), без «вдохновляющих» фраз.
 * Каждая строка соответствует конкретному правилу; если данных нет — строки нет.
 */
export function readinessOf(r: ReadinessResult): ReadinessCategory {
  return r.category ?? readinessCategory(r.score, r.band);
}

export function readinessLabel(r: ReadinessResult): string {
  return CATEGORY_LABEL[readinessOf(r)];
}

export function dayInsights(args: { readiness?: ReadinessResult; sleepBaseline?: number; sleepHours?: number; body?: BodyTrend; goal?: 'bulk' | 'cut' | 'recomp' | 'maintain'; targetKgPerWeek?: number }): string[] {
  const out: string[] = [];
  const r = args.readiness;
  if (r) {
    const cat = readinessOf(r);
    const low = cat === 'reduced' || cat === 'low';
    // «Значительно ниже» — на 1 ч и более ниже личной медианы
    if (args.sleepBaseline && args.sleepHours !== undefined && args.sleepHours <= args.sleepBaseline - 1) out.push(low ? 'Сон значительно ниже вашей обычной продолжительности. Сегодня нагрузку повышать не будем.' : 'Сон значительно ниже вашей обычной продолжительности.');
    else if (low && r.reasons?.length) out.push(`Готовность ${CATEGORY_LABEL[cat].toLowerCase()}: ${r.reasons.slice(0, 2).join(', ')}. Веса сегодня не повышаем.`);
  }
  if (args.body && args.goal && args.targetKgPerWeek !== undefined) out.push(...bodyNarrative(args.body, args.goal, args.targetKgPerWeek));
  return out;
}
