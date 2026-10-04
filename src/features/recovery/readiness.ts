import { addDays, formatHours } from '@/utils/date';
import type { DailyCheckIn, ISODate, ReadinessBand, ReadinessResult, WorkoutSession } from '@/types';
import { clamp } from '@/utils/format';
import { readinessCategory } from '@/features/science/recovery';

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
  ctx: { sessions: WorkoutSession[]; hrvBaseline?: number; rhrBaseline?: number; objectiveOnly?: boolean; sleepBaseline?: number },
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
  // Сравнение с личной нормой сна (если есть ≥5 ночей истории): половина веса — абсолютная длительность, половина — отклонение от своей нормы
  const sleepRel = ctx.sleepBaseline ? interp(c.sleepHours - ctx.sleepBaseline, [[-2, 0.15], [-1, 0.5], [-0.5, 0.8], [0, 1]]) : undefined;
  const sleepScore = sleepRel !== undefined ? (sleepH + sleepRel) / 2 : sleepH;
  const sleepQ = (c.sleepQuality - 1) / 4;
  const energy = (c.energy - 1) / 4;
  const stress = (5 - c.stress) / 4;
  const soreness = (5 - c.soreness) / 4;

  const parts = [
    { label: 'Сон', w: 0.3, v: sleepScore, detail: `${formatHours(c.sleepHours)} ч${ctx.sleepBaseline ? ` (твоя норма ~${formatHours(ctx.sleepBaseline)})` : ''}` },
    { label: 'Качество сна', w: 0.1, v: sleepQ, detail: `${c.sleepQuality}/5` },
    { label: 'Энергия', w: 0.25, v: energy, detail: `${c.energy}/5` },
    { label: 'Стресс', w: 0.15, v: stress, detail: `${c.stress}/5` },
    { label: 'Мышечная усталость', w: 0.2, v: soreness, detail: `${c.soreness}/5` },
  ];
  let score = 0;
  for (const p of parts) {
    score += p.w * p.v * 100;
    // Без чек-ина субъективные пункты нейтральны — не показываем их как «факторы»
    if (ctx.objectiveOnly && p.label !== 'Сон') continue;
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

  // Недельная нагрузка относительно своей нормы (острая 7 дн против средней за 3 недели до этого)
  const setsIn = (from: string, to: string) => done.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.filter((x) => x.done && !x.warmup).length, 0), 0);
  const acute = setsIn(addDays(c.date, -7), addDays(c.date, -1));
  const chronic = setsIn(addDays(c.date, -28), addDays(c.date, -8)) / 3;
  if (chronic >= 15 && acute > chronic * 1.3) {
    const pen = acute > chronic * 1.6 ? 7 : 4;
    score -= pen;
    factors.push({ label: 'Нагрузка за неделю', impact: -pen, detail: `${acute} подходов при обычных ~${Math.round(chronic)}` });
  }

  if (c.hrvMs && ctx.hrvBaseline) {
    const r = c.hrvMs / ctx.hrvBaseline;
    if (r < 0.85) {
      const pen = r < 0.75 ? 10 : 6;
      score -= pen;
      factors.push({ label: 'HRV ниже твоей базы', impact: -pen, detail: `${Math.round(c.hrvMs)} мс (${Math.round((r - 1) * 100)}% к базе ${Math.round(ctx.hrvBaseline)})` });
    } else if (r > 1.1) {
      score += 3;
      factors.push({ label: 'HRV выше твоей базы', impact: 3, detail: `${Math.round(c.hrvMs)} мс (+${Math.round((r - 1) * 100)}%)` });
    }
  }
  if (c.restingHr && ctx.rhrBaseline && c.restingHr - ctx.rhrBaseline >= 5) {
    const pen = c.restingHr - ctx.rhrBaseline >= 8 ? 8 : 5;
    score -= pen;
    factors.push({ label: 'Пульс покоя повышен', impact: -pen, detail: `${c.restingHr} уд/мин (+${Math.round(c.restingHr - ctx.rhrBaseline)} к базе)` });
  }

  if (c.pain) {
    score = Math.min(score, 55);
    factors.push({ label: 'Боль', impact: -15, detail: c.painNote || 'отмечена боль' });
  }

  score = Math.round(clamp(score, 5, 100));
  const band: ReadinessBand = score >= 75 ? 'go' : score >= 60 ? 'reduce' : score >= 45 ? 'light' : 'recover';
  const meta = BAND_META[band];
  factors.sort((a, b) => a.impact - b.impact);
  // Причины простыми словами — сравнение с личной нормой, где она есть
  const reasons: string[] = [];
  if (ctx.sleepBaseline && c.sleepHours < ctx.sleepBaseline - 0.75) reasons.push(`сон ниже твоей обычной продолжительности (${formatHours(c.sleepHours)} при норме ~${formatHours(ctx.sleepBaseline)})`);
  else if (c.sleepHours < 6.5) reasons.push(`сон ${formatHours(c.sleepHours)} — меньше 7 ч`);
  if (c.hrvMs && ctx.hrvBaseline && c.hrvMs < ctx.hrvBaseline * 0.85) reasons.push('HRV ниже твоей 21-дневной базы');
  if (c.restingHr && ctx.rhrBaseline && c.restingHr - ctx.rhrBaseline >= 5) reasons.push('пульс покоя выше твоей обычной нормы');
  if (!ctx.objectiveOnly && c.energy <= 2) reasons.push('мало энергии');
  if (!ctx.objectiveOnly && c.soreness >= 4) reasons.push('сильная мышечная усталость');
  if (!ctx.objectiveOnly && c.stress >= 4) reasons.push('высокий стресс');
  if (factors.some((f) => f.label === 'Нагрузка за неделю')) reasons.push('нагрузка за неделю выше обычной');
  if (c.pain) reasons.push('отмечена боль');
  return { score, band, category: readinessCategory(score, band), reasons, headline: c.pain ? `${meta.headline}. Избегай движений, которые вызывают боль` : meta.headline, volumeFactor: meta.volumeFactor, rirDelta: meta.rirDelta, factors };
}

function hardSetShare(s: WorkoutSession): number {
  const sets = s.exercises.flatMap((e) => e.sets.filter((x) => x.done && !x.warmup));
  if (!sets.length) return 0;
  return sets.filter((x) => x.feel === 'hard' || x.feel === 'max' || (x.rir !== undefined && x.rir <= 0)).length / sets.length;
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
