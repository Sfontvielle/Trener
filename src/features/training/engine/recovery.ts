import type { DailyCheckIn, RecoveryProfile, WorkoutSession } from '@/types';
import { addDays, today } from '@/utils/date';
import { readinessFor } from '@/features/recovery/derive';
import type { HealthDay } from '@/features/health/model';
import { progressRows } from '../analytics';

/**
 * Способность восстанавливаться — как ТРЕНИРОВОЧНЫЙ контекст, не медицинская оценка.
 *
 * Главное — фактические данные: сон, самочувствие/крепатура, готовность, прогресс в упражнениях,
 * доля «тяжёлых» подходов. Профиль «повышенное восстановление» — лишь один из факторов:
 *  • он добавляет немного запаса, ТОЛЬКО если фактические данные не плохие;
 *  • при плохом сне / низкой готовности / застое он не даёт ничего — объём не растёт;
 *  • верхняя граница объёма +15% к базе, и до неё доходит только при хороших данных И прогрессе.
 * FORM не даёт советов по препаратам и не оценивает их безопасность.
 */
export interface RecoveryEstimate {
  /** −1 … +1 */
  capacity: number;
  level: 'low' | 'normal' | 'high';
  /** Множитель недельного объёма 0.85 … 1.15 */
  factor: number;
  reasons: string[];
  /** Сколько сигналов из данных было доступно */
  signals: number;
}

export const MAX_FACTOR = 1.15;
export const MIN_FACTOR = 0.85;

export function estimateRecovery(args: {
  profile: RecoveryProfile | undefined;
  sessions: WorkoutSession[];
  checkins?: Record<string, DailyCheckIn>;
  health?: Record<string, HealthDay>;
  ref?: string;
}): RecoveryEstimate {
  const ref = args.ref ?? today();
  const from = addDays(ref, -21);
  const reasons: string[] = [];
  let data = 0;
  let signals = 0;
  let bad = false;

  // 1. Сон: чек-ины + Apple Health
  const sleeps = [
    ...Object.values(args.checkins ?? {}).filter((c) => c.date > from && c.date <= ref).map((c) => c.sleepHours),
    ...Object.values(args.health ?? {}).filter((d) => d.date > from && d.date <= ref && !args.checkins?.[d.date] && d.sleepHours).map((d) => d.sleepHours!),
  ];
  if (sleeps.length >= 5) {
    signals++;
    const avg = sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
    if (avg >= 7.5) {
      data += 0.25;
      reasons.push(`сон в среднем ${avg.toFixed(1).replace('.', ',')} ч`);
    } else if (avg < 6.5) {
      data -= 0.35;
      bad = true;
      reasons.push(`мало сна: ${avg.toFixed(1).replace('.', ',')} ч в среднем`);
    }
  }

  // 2. Крепатура / энергия по чек-инам
  const cks = Object.values(args.checkins ?? {}).filter((c) => c.date > from && c.date <= ref);
  if (cks.length >= 5) {
    signals++;
    const sore = cks.reduce((a, c) => a + c.soreness, 0) / cks.length;
    const energy = cks.reduce((a, c) => a + c.energy, 0) / cks.length;
    if (sore >= 3.5 || energy <= 2.3) {
      data -= 0.3;
      bad = true;
      reasons.push('частая сильная крепатура / мало энергии');
    } else if (sore <= 2 && energy >= 3.7) {
      data += 0.15;
      reasons.push('крепатура проходит быстро');
    }
  }

  // 3. Готовность (с HRV/пульсом из Health, если есть)
  const rs: number[] = [];
  for (let i = 0; i < 14; i++) {
    const r = readinessFor(addDays(ref, -i), args.checkins ?? {}, args.sessions, args.health);
    if (r) rs.push(r.score);
  }
  if (rs.length >= 5) {
    signals++;
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    if (avg >= 78) {
      data += 0.2;
      reasons.push(`высокая готовность (~${Math.round(avg)})`);
    } else if (avg < 62) {
      data -= 0.3;
      bad = true;
      reasons.push(`готовность часто снижена (~${Math.round(avg)})`);
    }
  }

  // 4. Производительность: прогресс и «тяжесть» подходов
  const recent = args.sessions.filter((s) => s.status === 'completed' && s.date > addDays(ref, -42));
  if (recent.length >= 6) {
    signals++;
    const rows = progressRows(args.sessions, [], 42).filter((r) => r.sessions >= 3);
    const gain = rows.length ? rows.reduce((a, r) => a + r.gainPct, 0) / rows.length : 0;
    const sets = recent.slice(-6).flatMap((s) => s.exercises.flatMap((we) => we.sets.filter((x) => x.done && !x.warmup)));
    const hardShare = sets.length ? sets.filter((x) => x.feel === 'hard' || (x.rir !== undefined && x.rir <= 0)).length / sets.length : 0;
    if (hardShare >= 0.5) {
      data -= 0.2;
      bad = true;
      reasons.push('больше половины подходов на пределе');
    } else if (gain >= 3) {
      data += 0.25;
      reasons.push(`прогресс +${Math.round(gain)}% за 6 недель`);
    } else if (rows.length >= 2 && gain <= 0) {
      data -= 0.15;
      reasons.push('рабочие веса не растут');
    }
  }

  // 5. Профиль пользователя — только как поправка, не компенсирует плохие данные
  let bonus = 0;
  if (args.profile === 'enhanced') {
    if (bad || data < -0.05) reasons.push('повышенное восстановление не компенсирует текущие сигналы усталости — объём не увеличиваю');
    else {
      bonus = signals >= 2 ? 0.35 : 0.2;
      reasons.push('учтено повышенное восстановление');
    }
  }

  const capacity = Math.max(-1, Math.min(1, data + bonus));
  // Выше ~+8% — только при подтверждении данными (≥2 сигнала без плохих)
  let factor = 1 + 0.15 * capacity;
  if (signals < 2) factor = Math.min(factor, 1.05);
  factor = Math.round(Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, factor)) * 100) / 100;
  const level = capacity >= 0.3 ? 'high' : capacity <= -0.25 ? 'low' : 'normal';
  if (!signals && args.profile !== 'enhanced') reasons.push('мало данных — стандартный объём');
  return { capacity: Math.round(capacity * 100) / 100, level, factor, reasons, signals };
}
