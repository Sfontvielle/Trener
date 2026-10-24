import type { GoalType, WeightEntry } from '@/types';
import { weightTrend } from '@/features/progress/weightTrend';
import { addDays } from '@/utils/date';

/**
 * Данные карточек главной — только из того, что записал пользователь или прислал Apple Health.
 * Нет данных → null, и карточка показывает пустое состояние с действием (никаких примерных цифр).
 */

export interface WeightCard {
  /** Сглаженный вес (тренд), кг */
  kg: number;
  /** Изменение тренда за 7 дней; null — данных меньше недели */
  week: number | null;
  /** Точки тренда за 4 недели — мини-график */
  spark: number[];
  /** Последнее взвешивание старше 7 дней */
  stale: boolean;
}

export function weightCard(weights: WeightEntry[], today: string): WeightCard | null {
  const t = weightTrend(weights).filter((p) => p.date <= today);
  if (!t.length) return null;
  const last = t[t.length - 1];
  const weekAgo = [...t].reverse().find((p) => p.date <= addDays(last.date, -7));
  const from = addDays(today, -28);
  return {
    kg: Math.round(last.trend * 10) / 10,
    week: weekAgo ? Math.round((last.trend - weekAgo.trend) * 10) / 10 : null,
    spark: t.filter((p) => p.date >= from).map((p) => p.trend),
    stale: last.date < addDays(today, -7),
  };
}

/** «−0,3 кг» / «+0,2 кг» / «±0 кг» */
export function deltaText(kg: number): string {
  if (Math.abs(kg) < 0.05) return '±0 кг';
  return `${kg > 0 ? '+' : '−'}${String(Math.abs(kg)).replace('.', ',')} кг`;
}

/** Изменение веса в сторону цели? (набор — вверх, сушка — вниз; рекомпозиция и поддержание — стабильность ±0,3) */
export function weightOnTrack(goal: GoalType, week: number): boolean {
  if (goal === 'bulk') return week >= 0;
  if (goal === 'cut') return week <= 0;
  return Math.abs(week) <= 0.3;
}

/** Сон прошлой ночи: чек-ин важнее Apple Health (человек мог поправить) */
export function sleepCard(checkinMinutes: number | undefined, healthHours: number | undefined): { minutes: number; source: 'checkin' | 'health' } | null {
  if (checkinMinutes && checkinMinutes > 0) return { minutes: checkinMinutes, source: 'checkin' };
  if (healthHours && healthHours > 0) return { minutes: Math.round(healthHours * 60), source: 'health' };
  return null;
}
