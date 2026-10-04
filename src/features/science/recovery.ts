import type { DailyCheckIn, ISODate, ReadinessBand } from '@/types';
import type { HealthDay } from '@/features/health/model';
import { addDays } from '@/utils/date';
import { median } from './steps';
import type { Basis } from './sources';

/**
 * Восстановление/готовность. Внутренний балл 0–100 — ЭВРИСТИКА RYNJI (взвешенная сумма сна,
 * самочувствия, недавней нагрузки, HRV и пульса покоя), он не валидирован как измерение, поэтому
 * пользователю показывается только категория и причины, а не «83%».
 *
 * Научная часть: сон взрослого ≥7 ч (Watson 2015, AASM/SRS); HRV и пульс покоя информативны
 * в сравнении с ЛИЧНОЙ базовой линией, а не с популяционными нормами (Plews 2013);
 * субъективная усталость/RIR — Zourdos 2016.
 */
export type ReadinessCategory = 'high' | 'normal' | 'reduced' | 'low';

export const CATEGORY_LABEL: Record<ReadinessCategory, string> = { high: 'Высокая', normal: 'Нормальная', reduced: 'Сниженная', low: 'Низкая' };

export const RECOVERY_BASIS: Basis = { kind: 'heuristic', sources: ['watson2015', 'plews2013', 'zourdos2016'], note: 'веса факторов и пороги — правила RYNJI; сравнение с личной базой — по Plews 2013' };

export function readinessCategory(score: number, band: ReadinessBand): ReadinessCategory {
  if (band === 'recover') return 'low';
  if (band === 'reduce' || band === 'light') return 'reduced';
  return score >= 85 ? 'high' : 'normal';
}

/** Категория по среднему баллу (для недельных сводок) */
export function categoryForScore(score: number): ReadinessCategory {
  return score >= 85 ? 'high' : score >= 75 ? 'normal' : score >= 45 ? 'reduced' : 'low';
}

/** Личная норма сна: медиана за 14 дней до даты (чек-ины и Apple Health), нужно ≥5 ночей */
export function sleepBaseline(date: ISODate, checkins: Record<string, DailyCheckIn>, health?: Record<string, HealthDay>): number | undefined {
  const vals: number[] = [];
  for (let i = 1; i <= 14; i++) {
    const d = addDays(date, -i);
    const h = checkins[d]?.sleepHours ?? health?.[d]?.sleepHours;
    if (h && h > 2) vals.push(h);
  }
  return vals.length >= 5 ? Math.round(median(vals) * 100) / 100 : undefined;
}

/** Сон в минутах из чек-ина: новое поле или пересчёт из старого sleepHours (миграция «на чтении») */
export function sleepMinutesOf(c: { sleepHours: number; sleepMinutes?: number }): number {
  return c.sleepMinutes ?? Math.round(c.sleepHours * 60);
}

/** Запись сна в чек-ин: минуты — источник истины, часы — производное для старого кода */
export function withSleep<T extends { sleepHours: number }>(c: T, minutes: number, source: 'manual' | 'health'): T & { sleepMinutes: number; sleepSource: 'manual' | 'health' } {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return { ...c, sleepMinutes: m, sleepHours: Math.round((m / 60) * 1000) / 1000, sleepSource: source };
}
