import type { DailyCheckIn, ISODate, ReadinessBand, ReadinessResult, WorkoutSession } from '@/types';
import { addDays } from '@/utils/date';
import { clamp } from '@/utils/format';
import { formatHours } from '@/utils/date';

/**
 * Готовность к нагрузке 0–100 по чек-ину + недавней нагрузке (+ HRV/пульс покоя из Apple Health, если есть).
 * Результат — не просто число, а решение: сколько объёма делать сегодня и с каким запасом (RIR).
 */

function interp(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x0, y0] = pts[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

export const BAND_META: Record<ReadinessBand, { headline: string; volumeFactor: number; rirDelta: number; short: string }> = {
  go: { headline: 'Можно работать по плану', volumeFactor: 1, rirDelta: 0, short: 'По плану' },
  reduce: { headline: 'Снизим объём на 15%', volumeFactor: 0.85, rirDelta: 0, short: '−15% объёма' },
  light: { headline: 'Облегчённая: −30% объёма, запас 3 повтора', volumeFactor: 0.7, rirDelta: 1, short: 'Облегчённая' },
  recover: { headline: 'Лучше восстановительная тренировка', volumeFactor: 0.5, rirDelta: 2, short: 'Восстановление' },
};

export function computeReadiness(
  c: DailyCheckIn,
  ctx: { sessions: WorkoutSession[]; hrvBaseline?: number; rhrBaseline?: number },
): ReadinessResult {
  const factors: ReadinessResult['factors'] = [];

  const sleepH = interp(c.sleepHours, [
    [4, 0.1],
    [5, 0.35],
    [6, 0.62],
    [7, 0.88],
    [7.5, 1],
    [9.5, 1],
    [11, 0.85],
  ]);
  const sleepQ = (c.sleepQuality - 1) / 4;
  const energy = (c.energy - 1) / 4;
  const stress = (5 - c.stress) / 4;
  const soreness = (5 - c.soreness) / 4;

  const parts = [
    { label: 'Сон', w: 0.3, v: sleepH, detail: `${formatHours(c.sleepHours)} ч` },
    { label: 'Качество сна', w: 0.1, v: sleepQ, detail: `${c.sleepQuality}/5` },
    { label: 'Энергия', w: 0.25, v: energy, detail: `${c.energy}/5` },
    { label: 'Стресс', w: 0.15, v: stress, detail: `${c.stress}/5` },
    { label: 'Мышечная усталость', w: 0.2, v: soreness, detail: `${c.soreness}/5` },
  ];
  let score = 0;
  for (const p of parts) {
    score += p.w * p.v * 100;
    factors.push({ label: p.label, impact: Math.round((p.v - 0.75) * p.w * 100), detail: p.detail });
  }

  // Недавняя нагрузка
  const yesterday = addDays(c.date, -1);
  const dayBefore = addDays(c.date, -2);
  const done = ctx.sessions.filter((s) => s.status === 'completed');
  const ySess = done.filter((s) => s.date === yesterday);
  const dbSess = done.filter((s) => s.date === dayBefore);
  if (ySess.length) {
    const hard = ySess.some((s) => (s.sessionRpe ?? 0) >= 8 || hardSetShare(s) > 0.4);
    const pen = hard ? 7 : 3;
    score -= pen;
    factors.push({ label: 'Вчерашняя тренировка', impact: -pen, detail: hard ? 'тяжёлая' : 'умеренная' });
    if (dbSess.length) {
      score -= 3;
      factors.push({ label: 'Два дня подряд', impact: -3, detail: 'тренировки 2 дня подряд' });
    }
  }

  if (c.hrvMs && ctx.hrvBaseline) {
    const r = c.hrvMs / ctx.hrvBaseline;
    if (r < 0.85) {
      const pen = r < 0.75 ? 10 : 6;
      score -= pen;
      factors.push({ label: 'HRV ниже нормы', impact: -pen, detail: `${Math.round(c.hrvMs)} мс (норма ~${Math.round(ctx.hrvBaseline)})` });
    } else if (r > 1.1) {
      score += 3;
      factors.push({ label: 'HRV выше нормы', impact: 3, detail: `${Math.round(c.hrvMs)} мс` });
    }
  }
  if (c.restingHr && ctx.rhrBaseline && c.restingHr - ctx.rhrBaseline >= 5) {
    const pen = c.restingHr - ctx.rhrBaseline >= 8 ? 8 : 5;
    score -= pen;
    factors.push({ label: 'Пульс покоя повышен', impact: -pen, detail: `${c.restingHr} уд/мин` });
  }

  if (c.pain) {
    score = Math.min(score, 55);
    factors.push({ label: 'Боль', impact: -15, detail: c.painNote || 'отмечена боль' });
  }

  score = Math.round(clamp(score, 5, 100));
  const band: ReadinessBand = score >= 75 ? 'go' : score >= 60 ? 'reduce' : score >= 45 ? 'light' : 'recover';
  const meta = BAND_META[band];
  factors.sort((a, b) => a.impact - b.impact);
  return { score, band, headline: c.pain ? `${meta.headline}. Избегай движений, которые вызывают боль` : meta.headline, volumeFactor: meta.volumeFactor, rirDelta: meta.rirDelta, factors };
}

function hardSetShare(s: WorkoutSession): number {
  const sets = s.exercises.flatMap((e) => e.sets.filter((x) => x.done && !x.warmup));
  if (!sets.length) return 0;
  return sets.filter((x) => x.feel === 'hard' || (x.rir !== undefined && x.rir <= 0)).length / sets.length;
}

/** Самый «проблемный» фактор — для короткого пояснения на главной */
export function mainLimiter(r: ReadinessResult): string | undefined {
  const worst = r.factors[0];
  if (!worst || worst.impact >= -2) return undefined;
  return `${worst.label}: ${worst.detail}`;
}

export function isCheckinFor(date: ISODate, c?: DailyCheckIn): c is DailyCheckIn {
  return !!c && c.date === date;
}
