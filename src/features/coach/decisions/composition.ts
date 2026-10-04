import type { BodyMetric, GoalType, ISODate, WeightEntry, WorkoutSession } from '@/types';
import { addDays, daysBetween, today } from '@/utils/date';
import { regressionKgPerWeek } from '@/features/science/maintenance';
import { bestSet, e1rm } from '@/features/training/progression';
import type { Basis } from '@/features/science/sources';
import type { Confidence } from './types';

/**
 * Связь веса, талии, обхватов и силовых за 4–6 недель — «качество» изменений.
 * ЧЕСТНО: по весу, талии и силовым НЕЛЬЗЯ точно сказать, сколько набрано мышц и сколько жира.
 * Это косвенные признаки (ЭВРИСТИКА RYNJI, согласованная с Iraki 2019 / Helms 2023):
 *  • вес +1,2 кг, талия +0,2 см, силовые растут → набор выглядит качественным;
 *  • вес +2,5 кг, талия +3 см, силовые стоят → возможно, профицит слишком большой;
 *  • вес вниз, талия вниз, силовые держатся → сушка идёт хорошо; силовые падают → риск потери мышц.
 */
export type CompositionKind = 'positive' | 'aggressive' | 'mixed' | 'loss_good' | 'loss_risk' | 'recomp' | 'stable' | 'insufficient';

export interface CompositionSignal {
  kind: CompositionKind;
  text: string;
  data: string[];
  confidence: Confidence;
  caveat: string;
  weightDelta: number | null;
  waistDelta: number | null;
  strengthPct: number | null;
  basis: Basis;
}

export const COMPOSITION_CAVEAT = 'Точно разделить изменения на мышцы и жир по весу, талии и силовым нельзя — это косвенные признаки.';

const f1 = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')}`;

/** Изменение силовых, %: лучший e1RM в последние 2 недели окна против первых 2 недель (по упражнениям, где есть оба) */
export function strengthChangePct(sessions: WorkoutSession[], from: ISODate, to: ISODate): { pct: number; exercises: number } | null {
  const done = sessions.filter((s) => s.status === 'completed' && s.date >= from && s.date <= to);
  const mid1 = addDays(from, 14);
  const mid2 = addDays(to, -14);
  const best = new Map<string, { a: number; b: number }>();
  for (const s of done) {
    for (const we of s.exercises) {
      const b = bestSet(we.sets);
      if (!b || b.weight <= 0) continue;
      const v = e1rm(b.weight, b.reps);
      const x = best.get(we.exerciseId) ?? { a: 0, b: 0 };
      if (s.date < mid1) x.a = Math.max(x.a, v);
      if (s.date > mid2) x.b = Math.max(x.b, v);
      best.set(we.exerciseId, x);
    }
  }
  const pairs = [...best.values()].filter((x) => x.a > 0 && x.b > 0);
  if (pairs.length < 2) return null;
  const pct = pairs.reduce((acc, x) => acc + (x.b / x.a - 1) * 100, 0) / pairs.length;
  return { pct: Math.round(pct * 10) / 10, exercises: pairs.length };
}

function metricDelta(metrics: BodyMetric[], kind: BodyMetric['kind'], from: ISODate, to: ISODate): { delta: number; days: number } | null {
  const pts = metrics.filter((m) => m.kind === kind && m.date >= from && m.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length < 2) return null;
  const days = daysBetween(pts[0].date, pts[pts.length - 1].date);
  if (days < 14) return null;
  return { delta: Math.round((pts[pts.length - 1].value - pts[0].value) * 10) / 10, days };
}

export function compositionSignal(args: { goal: GoalType; weights: WeightEntry[]; metrics: BodyMetric[]; sessions: WorkoutSession[]; ref?: ISODate; windowDays?: number }): CompositionSignal {
  const ref = args.ref ?? today();
  const win = args.windowDays ?? 42;
  const from = addDays(ref, -win);
  const basis: Basis = { kind: 'heuristic', sources: ['iraki2019', 'helms2023', 'helms2014'], note: 'косвенные признаки; пороги — правила RYNJI' };
  const rate = regressionKgPerWeek(args.weights, from, ref);
  const weightDelta = rate && rate.n >= 5 && rate.span >= 21 ? Math.round(((rate.kgPerWeek * rate.span) / 7) * 10) / 10 : null;
  const waist = metricDelta(args.metrics, 'waist', from, ref);
  const str = strengthChangePct(args.sessions, from, ref);
  const limbs = (['arm', 'thigh', 'chest'] as const).map((k) => ({ k, d: metricDelta(args.metrics, k, addDays(ref, -70), ref) })).filter((x) => x.d);
  const data: string[] = [];
  const weeks = Math.round(win / 7);
  if (weightDelta !== null) data.push(`вес ${f1(weightDelta)} кг за ${Math.round(rate!.span / 7)} нед. (тренд по ${rate!.n} взвешиваниям)`);
  if (waist) data.push(`талия ${f1(waist.delta)} см за ${Math.round(waist.days / 7)} нед.`);
  if (str) data.push(`силовые ${f1(str.pct)}% (лучший расчётный максимум, ${str.exercises} упр.)`);
  const limbName = { arm: 'рука', thigh: 'бедро', chest: 'грудь' } as const;
  for (const l of limbs) data.push(`${limbName[l.k]} ${f1(l.d!.delta)} см`);
  const base = { data, caveat: COMPOSITION_CAVEAT, weightDelta, waistDelta: waist?.delta ?? null, strengthPct: str?.pct ?? null, basis };

  if (weightDelta === null || !waist) {
    return { ...base, kind: 'insufficient', text: `Нужно ${weightDelta === null ? 'взвешиваться 3–4 раза в неделю' : ''}${weightDelta === null && !waist ? ' и ' : ''}${!waist ? 'измерять талию раз в неделю' : ''} ${weeks} нед., чтобы оценить, за счёт чего меняется вес.`.replace(/\s+/g, ' ').trim(), confidence: 'low' };
  }
  const conf: Confidence = str && waist.days >= 28 && rate!.n >= 10 ? 'medium' : 'low';
  const strUp = str ? str.pct >= 2 : null;
  const strDown = str ? str.pct <= -3 : null;
  const w = weightDelta;
  const wd = waist.delta;
  if (w >= 0.5) {
    const perKg = wd / w;
    if (perKg <= 0.5 && strUp !== false) return { ...base, kind: 'positive', confidence: conf, text: `Вес ${f1(w)} кг, талия ${f1(wd)} см${strUp ? ', силовые растут' : ''} — набор выглядит качественным.` };
    if (perKg >= 1 || (wd >= 2.5 && strUp !== true)) return { ...base, kind: 'aggressive', confidence: conf, text: `Вес ${f1(w)} кг, талия ${f1(wd)} см${strUp === false ? ', силовые почти не растут' : ''} — возможно, профицит слишком большой.` };
    return { ...base, kind: 'mixed', confidence: conf, text: `Вес ${f1(w)} кг, талия ${f1(wd)} см — смешанная картина, продолжаем наблюдать.` };
  }
  if (w <= -0.5) {
    if (strDown) return { ...base, kind: 'loss_risk', confidence: conf, text: `Вес ${f1(w)} кг, силовые снижаются (${f1(str!.pct)}%) — есть риск терять мышцы; стоит проверить темп, белок и сон.` };
    return { ...base, kind: 'loss_good', confidence: conf, text: `Вес ${f1(w)} кг, талия ${f1(wd)} см${str ? ', силовые держатся' : ''} — снижение идёт за счёт жира в большей степени.` };
  }
  if (wd <= -1 && strUp) return { ...base, kind: 'recomp', confidence: conf, text: `Вес стабилен, талия ${f1(wd)} см, силовые растут — похоже на рекомпозицию.` };
  return { ...base, kind: 'stable', confidence: conf, text: `Вес стабилен (${f1(w)} кг), талия ${f1(wd)} см.` };
}
