import type { DailyCheckIn, ISODate, ReadinessResult, WorkoutSession } from '@/types';
import { computeReadiness } from './readiness';
import { healthContext, type HealthDay } from '@/features/health/model';

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

/**
 * Готовность на дату. Источники по приоритету:
 *  1) чек-ин (субъективное) + HRV/пульс покоя из Apple Health с ПЕРСОНАЛЬНОЙ базовой линией;
 *  2) нет чек-ина, но есть сон из Health — расчёт по объективным данным, субъективные пункты нейтральны.
 */
export function readinessFor(date: ISODate, checkins: Record<string, DailyCheckIn>, sessions: WorkoutSession[], health?: Record<string, HealthDay>): ReadinessResult | undefined {
  const c = checkins[date];
  const h = health ? healthContext(health, date) : undefined;
  if (c) {
    const merged: DailyCheckIn = { ...c, hrvMs: c.hrvMs ?? h?.hrvMs, restingHr: c.restingHr ?? h?.restingHr };
    return computeReadiness(merged, {
      sessions,
      hrvBaseline: h?.hrvBaseline ?? baseline(checkins, date, 'hrvMs'),
      rhrBaseline: h?.rhrBaseline ?? baseline(checkins, date, 'restingHr'),
    });
  }
  if (h?.sleepHours) {
    // Нейтральные значения = точка «без влияния» в формуле (энергия 4/5, стресс 2/5 …)
    const synthetic: DailyCheckIn = { date, sleepHours: h.sleepHours, sleepQuality: 4, energy: 4, stress: 2, soreness: 2, pain: false, hrvMs: h.hrvMs, restingHr: h.restingHr, createdAt: 0 };
    return { ...computeReadiness(synthetic, { sessions, hrvBaseline: h.hrvBaseline, rhrBaseline: h.rhrBaseline, objectiveOnly: true }), source: 'health' };
  }
  return undefined;
}
