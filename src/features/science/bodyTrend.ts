import type { BodyMetric, ISODate, WeightEntry } from '@/types';
import { addDays, daysBetween, today } from '@/utils/date';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import type { Basis } from './sources';

/**
 * Тренд тела: решения принимаются по сглаженным данным, никогда по одному утреннему взвешиванию.
 *  • 7-дневное скользящее среднее веса — понятное пользователю «средний вес за неделю»;
 *  • экспоненциальный тренд (weightTrend, α=0.1) и регрессия за 21 день — скорость изменения;
 *  • талия — линейная регрессия замеров за 4–6 недель.
 */

/** Среднее взвешиваний за 7 дней до даты включительно (нужно ≥3 взвешиваний) */
export function rollingAverage7(entries: WeightEntry[], ref: ISODate = today()): { kg: number; n: number } | null {
  const from = addDays(ref, -6);
  const w = entries.filter((e) => e.date >= from && e.date <= ref);
  if (w.length < 3) return null;
  return { kg: Math.round((w.reduce((a, e) => a + e.kg, 0) / w.length) * 10) / 10, n: w.length };
}

function slopePerWeek(points: { date: ISODate; value: number }[]): number | null {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const span = xs[xs.length - 1];
  if (span < 14) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.value, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (points[i].value - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? (num / den) * 7 : null;
}

/** Тренд талии за окно (по умолчанию 42 дня): нужно ≥2 замера с разницей ≥14 дней */
export function waistTrend(metrics: BodyMetric[], ref: ISODate = today(), windowDays = 42): { cmPerWeek: number; changeCm: number; samples: number; days: number } | null {
  const from = addDays(ref, -windowDays);
  const pts = metrics
    .filter((m) => m.kind === 'waist' && m.date >= from && m.date <= ref)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((m) => ({ date: m.date, value: m.value }));
  const s = slopePerWeek(pts);
  if (s === null) return null;
  const days = daysBetween(pts[0].date, pts[pts.length - 1].date);
  return { cmPerWeek: Math.round(s * 100) / 100, changeCm: Math.round(((s * days) / 7) * 10) / 10, samples: pts.length, days };
}

export interface BodyTrend {
  weight: { avg7: number | null; trendKg: number | null; kgPerWeek: number | null; weighIns: number };
  waist: ReturnType<typeof waistTrend>;
  /**
   * Сколько сантиметров талии приходится на килограмм набранного веса за период.
   * Эвристика RYNJI: при наборе мышц талия растёт медленно; ≥1 см на 1 кг на протяжении 4+ недель —
   * признак того, что набор идёт преимущественно за счёт жира/воды → набор нужно замедлить.
   */
  waistPerKg: number | null;
  basis: Basis;
}

export function bodyTrend(weights: WeightEntry[], metrics: BodyMetric[], ref: ISODate = today()): BodyTrend {
  const tr = weightTrend(weights);
  const rate = weeklyRate(tr, 21);
  const waist = waistTrend(metrics, ref);
  let waistPerKg: number | null = null;
  if (waist && rate && Math.abs(rate.kgPerWeek) >= 0.05 && waist.days >= 21) waistPerKg = Math.round((waist.cmPerWeek / rate.kgPerWeek) * 100) / 100;
  return {
    weight: { avg7: rollingAverage7(weights, ref)?.kg ?? null, trendKg: tr.length ? Math.round(tr[tr.length - 1].trend * 10) / 10 : null, kgPerWeek: rate ? Math.round(rate.kgPerWeek * 100) / 100 : null, weighIns: weights.filter((w) => w.date > addDays(ref, -21)).length },
    waist,
    waistPerKg,
    basis: { kind: 'heuristic', sources: ['hall2008', 'iraki2019'], note: 'Сглаживание и пороги — правила RYNJI; темпы набора — из обзоров' },
  };
}

/** Короткий вывод по телу — строго из чисел (без обещаний, без причинности) */
export function bodyNarrative(bt: BodyTrend, goal: 'bulk' | 'cut' | 'recomp' | 'maintain', targetKgPerWeek: number): string[] {
  const out: string[] = [];
  const r = bt.weight.kgPerWeek;
  if (r !== null) {
    const lo = goal === 'bulk' ? targetKgPerWeek * 0.5 : goal === 'cut' ? targetKgPerWeek * 1.5 : -0.15;
    const hi = goal === 'bulk' ? targetKgPerWeek * 1.5 : goal === 'cut' ? targetKgPerWeek * 0.5 : 0.15;
    const inBand = r >= Math.min(lo, hi) && r <= Math.max(lo, hi);
    if (goal === 'bulk') out.push(inBand ? 'Средний вес растёт в целевом диапазоне. Калорийность пока менять не нужно.' : r > hi ? 'Средний вес растёт быстрее целевого темпа.' : 'Средний вес растёт медленнее цели или стоит.');
    else if (goal === 'cut') out.push(inBand ? 'Средний вес снижается в целевом темпе.' : r < Math.min(lo, hi) ? 'Вес снижается быстрее безопасного темпа.' : 'Вес снижается медленнее цели или стоит.');
    else out.push(inBand ? 'Средний вес стабилен.' : `Средний вес меняется на ${r > 0 ? '+' : ''}${r.toFixed(2).replace('.', ',')} кг/нед.`);
  }
  if (bt.waist) {
    const c = bt.waist.changeCm;
    const weeks = Math.max(1, Math.round(bt.waist.days / 7));
    if (Math.abs(c) < 0.5) out.push(`За последние ${weeks} нед. талия практически стабильна${r !== null && r > 0.1 ? ' при росте массы тела' : ''}.`);
    else out.push(`За последние ${weeks} нед. талия ${c > 0 ? 'выросла' : 'уменьшилась'} на ${Math.abs(c).toString().replace('.', ',')} см.`);
  }
  return out;
}
