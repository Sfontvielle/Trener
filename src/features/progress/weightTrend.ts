import type { ISODate, WeightEntry } from '@/types';
import { addDays, daysBetween } from '@/utils/date';

export interface TrendPoint {
  date: ISODate;
  raw?: number;
  trend: number;
}

/**
 * Сглаженный тренд веса (экспоненциальное сглаживание по дням, α = 0.1 — как в «Hacker's Diet»).
 * Пропущенные дни не ломают тренд: он просто не обновляется.
 * Одно взвешивание почти не двигает тренд — поэтому решения по питанию опираются на него.
 */
export function weightTrend(entries: WeightEntry[], alpha = 0.1): TrendPoint[] {
  if (entries.length === 0) return [];
  const byDate = new Map<ISODate, number[]>();
  for (const e of entries) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e.kg);
    byDate.set(e.date, arr);
  }
  const dates = [...byDate.keys()].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const out: TrendPoint[] = [];
  // Стартуем тренд со среднего первых до 3 взвешиваний, чтобы первый замер не доминировал
  const seed = dates.slice(0, 3).map((d) => avg(byDate.get(d)!));
  let trend = avg(seed);
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const vals = byDate.get(d);
    if (vals) {
      const raw = avg(vals);
      trend = trend + alpha * (raw - trend);
      out.push({ date: d, raw, trend });
    } else {
      out.push({ date: d, trend });
    }
    if (out.length > 3650) break;
  }
  return out;
}

function avg(a: number[]): number {
  return a.reduce((s, x) => s + x, 0) / a.length;
}

/** Линейная регрессия тренда за окно, кг/неделю */
export function weeklyRate(points: TrendPoint[], windowDays = 21): { kgPerWeek: number; days: number; weighIns: number } | null {
  if (points.length < 2) return null;
  const end = points[points.length - 1].date;
  const win = points.filter((p) => daysBetween(p.date, end) < windowDays);
  const weighIns = win.filter((p) => p.raw !== undefined).length;
  const span = daysBetween(win[0].date, end);
  if (span < 10 || weighIns < 5) return null;
  const xs = win.map((p) => daysBetween(win[0].date, p.date));
  const ys = win.map((p) => p.trend);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return { kgPerWeek: (num / den) * 7, days: span, weighIns };
}

export function latestTrendWeight(entries: WeightEntry[]): number | undefined {
  const t = weightTrend(entries);
  return t.length ? Math.round(t[t.length - 1].trend * 10) / 10 : undefined;
}
