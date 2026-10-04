import type { BodyMetric, UserProfile, WeightEntry } from '@/types';
import { targetWeeklyChangeKg } from '@/features/nutrition/targets';
import { addDays, today } from '@/utils/date';
import { weeklyRate, weightTrend } from './weightTrend';

/**
 * Прогресс к главной цели — из реальных данных:
 *  • задан целевой вес → доля пройденного пути от стартового веса;
 *  • набор/сушка без целевого веса → фактический темп против целевого;
 *  • поддержание → насколько вес держится у старта;
 *  • рекомпозиция → талия (если есть замеры) при стабильном весе.
 * Без данных — честное «нет данных», а не выдуманный процент.
 */
export interface GoalProgress {
  /** 0..1 или null, если оценить нельзя */
  pct: number | null;
  headline: string;
  detail: string;
}

const kg = (x: number) => x.toFixed(1).replace('.', ',');
const signed = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d).replace('.', ',')}`;

export function goalProgress(p: UserProfile, weights: WeightEntry[], metrics: BodyMetric[] = [], ref = today()): GoalProgress {
  const tr = weightTrend(weights);
  if (!tr.length) return { pct: null, headline: 'Нет данных о весе', detail: 'Взвесься утром — появится прогресс к цели' };
  const cur = tr[tr.length - 1].trend;
  const start = weights[0]?.kg ?? p.weightKg;
  const rate = weeklyRate(tr, 21)?.kgPerWeek;

  if (p.targetWeightKg && (p.goal === 'cut' || p.goal === 'bulk')) {
    const total = start - p.targetWeightKg;
    const doneKg = start - cur;
    const pct = Math.abs(total) < 0.1 ? 1 : Math.max(0, Math.min(1, doneKg / total));
    const left = Math.abs(cur - p.targetWeightKg);
    const weeks = rate && Math.sign(rate) === Math.sign(p.targetWeightKg - cur) && Math.abs(rate) > 0.05 ? Math.ceil(left / Math.abs(rate)) : null;
    return { pct, headline: `${kg(cur)} → ${kg(p.targetWeightKg)} кг`, detail: left < 0.3 ? 'Цель достигнута' : `осталось ${kg(left)} кг${weeks ? ` · ~${weeks} нед в текущем темпе` : ''}` };
  }
  if (p.goal === 'cut' || p.goal === 'bulk') {
    const goal = targetWeeklyChangeKg(p, cur);
    if (rate === undefined) return { pct: null, headline: `${kg(cur)} кг`, detail: 'Темп появится после 2–3 недель взвешиваний' };
    const pct = goal ? Math.max(0, Math.min(1, rate / goal)) : null;
    return { pct, headline: `Темп ${signed(rate, 2)} кг/нед`, detail: `цель ${signed(goal, 2)} кг/нед` };
  }
  if (p.goal === 'recomp') {
    const waist = metrics.filter((m) => m.kind === 'waist').sort((a, b) => (a.date < b.date ? -1 : 1));
    const from = waist.find((m) => m.date >= addDays(ref, -35)) ?? waist[0];
    const last = waist[waist.length - 1];
    if (from && last && from !== last) {
      const d = last.value - from.value;
      return { pct: d < 0 ? Math.min(1, -d / 3) : 0, headline: `Талия ${signed(d)} см`, detail: `вес ${signed(cur - start)} кг с начала` };
    }
    return { pct: null, headline: `Вес ${signed(cur - start)} кг`, detail: 'Добавь замер талии — так видна рекомпозиция' };
  }
  const drift = cur - start;
  return { pct: Math.max(0, 1 - Math.abs(drift) / Math.max(1, start * 0.02)), headline: `Вес ${kg(cur)} кг`, detail: Math.abs(drift) < start * 0.01 ? 'держится у стартового' : `${signed(drift)} кг от старта` };
}
