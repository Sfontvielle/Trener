import type { ISODate } from '@/types';

/** Сводка Apple Health за один день (локальная дата) */
export interface HealthDay {
  date: ISODate;
  /** Сон за ночь, закончившуюся этим утром, ч */
  sleepHours?: number;
  steps?: number;
  restingHr?: number;
  hrvMs?: number;
  activeKcal?: number;
  weightKg?: number;
  distanceKm?: number;
  workouts?: { start: number; minutes: number; kcal?: number; strength: boolean }[];
}



export interface HealthContext {
  sleepHours?: number;
  steps?: number;
  restingHr?: number;
  hrvMs?: number;
  activeKcal?: number;
  /** Персональные базовые линии — не «нормы из интернета» */
  rhrBaseline?: number;
  hrvBaseline?: number;
  /** Отклонения от базовой линии */
  rhrDelta?: number;
  hrvDeltaPct?: number;
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** Предыдущие n дней (без текущего) — базовая линия не должна включать сегодняшнее значение */
function prior(days: Record<string, HealthDay>, date: ISODate, n: number, key: 'restingHr' | 'hrvMs'): number[] {
  return Object.values(days)
    .filter((d) => d.date < date && d[key] !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n)
    .map((d) => d[key] as number);
}

/**
 * Контекст для readiness: сегодняшние значения + персональные базовые линии.
 * Пульс покоя — среднее за 14 дней, HRV — медиана за 21 день (HRV шумный, медиана устойчивее).
 * Минимум 5 дней истории, иначе базовой линии нет и отклонения не используются.
 */
export function healthContext(days: Record<string, HealthDay>, date: ISODate): HealthContext | undefined {
  const d = days[date];
  const rhrPrior = prior(days, date, 14, 'restingHr');
  const hrvPrior = prior(days, date, 21, 'hrvMs');
  if (!d && !rhrPrior.length && !hrvPrior.length) return undefined;
  const rhrBaseline = rhrPrior.length >= 5 ? Math.round(mean(rhrPrior) * 10) / 10 : undefined;
  const hrvBaseline = hrvPrior.length >= 5 ? Math.round(median(hrvPrior)) : undefined;
  return {
    sleepHours: d?.sleepHours,
    steps: d?.steps,
    restingHr: d?.restingHr,
    hrvMs: d?.hrvMs,
    activeKcal: d?.activeKcal,
    rhrBaseline,
    hrvBaseline,
    rhrDelta: d?.restingHr !== undefined && rhrBaseline !== undefined ? Math.round((d.restingHr - rhrBaseline) * 10) / 10 : undefined,
    hrvDeltaPct: d?.hrvMs !== undefined && hrvBaseline ? Math.round(((d.hrvMs - hrvBaseline) / hrvBaseline) * 100) : undefined,
  };
}

/** Объединение новых дней с сохранёнными: новые значения перекрывают старые по полям */
export function mergeHealthDays(prev: Record<string, HealthDay>, next: HealthDay[], keepDays = 60): Record<string, HealthDay> {
  const out: Record<string, HealthDay> = { ...prev };
  for (const d of next) out[d.date] = { ...(out[d.date] ?? { date: d.date }), ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as HealthDay;
  const keys = Object.keys(out).sort().slice(-keepDays);
  return Object.fromEntries(keys.map((k) => [k, out[k]]));
}
