import type { DailyCheckIn, ISODate, ReadinessResult, WorkoutSession } from '@/types';
import { computeReadiness } from './readiness';

/** HRV/пульс покоя: базовая линия = медиана за 28 дней до даты */
function baseline(checkins: Record<string, DailyCheckIn>, date: ISODate, key: 'hrvMs' | 'restingHr'): number | undefined {
  const vals = Object.values(checkins)
    .filter((c) => c.date < date && c[key] !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 28)
    .map((c) => c[key] as number)
    .sort((a, b) => a - b);
  if (vals.length < 5) return undefined;
  return vals[Math.floor(vals.length / 2)];
}

export function readinessFor(date: ISODate, checkins: Record<string, DailyCheckIn>, sessions: WorkoutSession[]): ReadinessResult | undefined {
  const c = checkins[date];
  if (!c) return undefined;
  return computeReadiness(c, { sessions, hrvBaseline: baseline(checkins, date, 'hrvMs'), rhrBaseline: baseline(checkins, date, 'restingHr') });
}
