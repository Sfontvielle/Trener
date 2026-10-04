import type { BodyMetric, FoodEntry, ISODate, WeightEntry, WorkoutSession } from '@/types';
import { addDays, today } from '@/utils/date';
import { bestSet } from '@/features/training/progression';
import { sessionVolume } from '@/features/training/analytics';
import { weightTrend } from './weightTrend';

/** Ряды и сравнения для экрана прогресса — только из записанных данных */

export interface WeekPoint {
  from: ISODate;
  workouts: number;
  sets: number;
  tonnage: number;
  avgKcal: number | null;
  avgProtein: number | null;
}

export function weeklySeries(sessions: WorkoutSession[], entries: FoodEntry[], weeks = 8, ref: ISODate = today()): WeekPoint[] {
  return Array.from({ length: weeks }, (_, i) => {
    const to = addDays(ref, -7 * (weeks - 1 - i));
    const from = addDays(to, -6);
    const ss = sessions.filter((s) => s.status === 'completed' && s.date >= from && s.date <= to);
    const vol = ss.map(sessionVolume);
    const byDay = new Map<string, { k: number; p: number }>();
    for (const e of entries) {
      if (e.date < from || e.date > to) continue;
      const x = byDay.get(e.date) ?? { k: 0, p: 0 };
      x.k += e.macros.kcal;
      x.p += e.macros.protein;
      byDay.set(e.date, x);
    }
    const days = [...byDay.values()].filter((x) => x.k > 600);
    return {
      from,
      workouts: ss.length,
      sets: vol.reduce((a, v) => a + v.sets, 0),
      tonnage: Math.round(vol.reduce((a, v) => a + v.tonnage, 0)),
      avgKcal: days.length ? Math.round(days.reduce((a, x) => a + x.k, 0) / days.length) : null,
      avgProtein: days.length ? Math.round(days.reduce((a, x) => a + x.p, 0) / days.length) : null,
    };
  });
}

/** Лучший расчётный максимум (e1RM) по тренировкам упражнения */
export function e1rmSeries(exerciseId: string, sessions: WorkoutSession[]): { date: ISODate; value: number }[] {
  return sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((s) => {
      const we = s.exercises.find((x) => x.exerciseId === exerciseId);
      const b = we ? bestSet(we.sets) : undefined;
      return b && b.weight > 0 ? [{ date: s.date, value: Math.round(b.e1rm * 10) / 10 }] : [];
    });
}

export function metricSeries(metrics: BodyMetric[], kind: BodyMetric['kind']): { date: ISODate; value: number }[] {
  return metrics.filter((m) => m.kind === kind).sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => ({ date: m.date, value: m.value }));
}

/** Упражнения с наибольшей историей — для выбора на графике силы */
export function topLifts(sessions: WorkoutSession[], n = 6): string[] {
  const count = new Map<string, number>();
  for (const s of sessions) if (s.status === 'completed') for (const we of s.exercises) if (bestSet(we.sets)?.weight) count.set(we.exerciseId, (count.get(we.exerciseId) ?? 0) + 1);
  return [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

export interface PeriodCompare {
  days: number;
  weight: { cur: number; prev: number; delta: number } | null;
  waist: { delta: number } | null;
  bodyfat: { delta: number } | null;
  strengthPct: number | null;
  workouts: { cur: number; prev: number };
  sets: { cur: number; prev: number };
  kcal: { cur: number | null; prev: number | null };
  protein: { cur: number | null; prev: number | null };
}

function avgDaily(entries: FoodEntry[], from: ISODate, to: ISODate, key: 'kcal' | 'protein'): number | null {
  const m = new Map<string, { k: number; v: number }>();
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    const x = m.get(e.date) ?? { k: 0, v: 0 };
    x.k += e.macros.kcal;
    x.v += key === 'kcal' ? e.macros.kcal : e.macros.protein;
    m.set(e.date, x);
  }
  const d = [...m.values()].filter((x) => x.k > 600);
  return d.length ? Math.round(d.reduce((a, x) => a + x.v, 0) / d.length) : null;
}

function metricDelta(metrics: BodyMetric[], kind: BodyMetric['kind'], from: ISODate, to: ISODate): number | null {
  const list = metricSeries(metrics, kind);
  const before = [...list].reverse().find((m) => m.date < from) ?? list.find((m) => m.date >= from && m.date <= to);
  const after = [...list].reverse().find((m) => m.date <= to && m.date >= from);
  if (!before || !after || before === after) return null;
  return Math.round((after.value - before.value) * 10) / 10;
}

/** Текущий период против предыдущего такой же длины */
export function comparePeriods(args: { days: number; weights: WeightEntry[]; metrics: BodyMetric[]; sessions: WorkoutSession[]; entries: FoodEntry[]; ref?: ISODate }): PeriodCompare {
  const ref = args.ref ?? today();
  const from = addDays(ref, -args.days + 1);
  const pFrom = addDays(from, -args.days);
  const pTo = addDays(from, -1);
  const tr = weightTrend(args.weights);
  const at = (d: ISODate) => [...tr].reverse().find((p) => p.date <= d)?.trend;
  const wCur = at(ref);
  // Нет взвешиваний до периода — сравниваем с первым значением внутри периода (если прошло 7+ дней)
  const firstIn = tr.find((p) => p.date >= from);
  const wPrev = at(pTo) ?? (firstIn && firstIn.date <= addDays(ref, -7) ? firstIn.trend : undefined);
  const done = args.sessions.filter((s) => s.status === 'completed');
  const inR = (s: WorkoutSession, a: ISODate, b: ISODate) => s.date >= a && s.date <= b;
  const cur = done.filter((s) => inR(s, from, ref));
  const prev = done.filter((s) => inR(s, pFrom, pTo));
  // Сила: лучший e1RM упражнения в текущем периоде против всего, что было до него
  const pcts: number[] = [];
  const ids = new Set(cur.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  for (const id of ids) {
    const best = (list: WorkoutSession[]) => Math.max(0, ...list.flatMap((s) => s.exercises.filter((e) => e.exerciseId === id).map((e) => bestSet(e.sets)?.e1rm ?? 0)));
    let a = best(done.filter((s) => s.date < from));
    const b = best(cur);
    // Упражнение появилось только в этом периоде — сравниваем первую тренировку с лучшей
    if (!a) {
      const mine = cur.filter((s) => s.exercises.some((e) => e.exerciseId === id)).sort((x, y) => x.startedAt - y.startedAt);
      if (mine.length >= 2) a = best([mine[0]]);
    }
    if (a > 0 && b > 0) pcts.push(((b - a) / a) * 100);
  }
  return {
    days: args.days,
    weight: wCur !== undefined && wPrev !== undefined ? { cur: wCur, prev: wPrev, delta: Math.round((wCur - wPrev) * 10) / 10 } : null,
    waist: (() => {
      const d = metricDelta(args.metrics, 'waist', from, ref);
      return d === null ? null : { delta: d };
    })(),
    bodyfat: (() => {
      const d = metricDelta(args.metrics, 'bodyfat', from, ref);
      return d === null ? null : { delta: d };
    })(),
    strengthPct: pcts.length >= 2 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    workouts: { cur: cur.length, prev: prev.length },
    sets: { cur: cur.reduce((a, s) => a + sessionVolume(s).sets, 0), prev: prev.reduce((a, s) => a + sessionVolume(s).sets, 0) },
    kcal: { cur: avgDaily(args.entries, from, ref, 'kcal'), prev: avgDaily(args.entries, pFrom, pTo, 'kcal') },
    protein: { cur: avgDaily(args.entries, from, ref, 'protein'), prev: avgDaily(args.entries, pFrom, pTo, 'protein') },
  };
}

const n1 = (x: number) => Math.abs(x).toFixed(1).replace('.', ',');

/**
 * Короткий вывод «что изменилось» — сопоставление фактов, без причинно-следственных утверждений
 * («вес почти не изменился, но талия уменьшилась, а силовые выросли»).
 */
export function progressNarrative(c: PeriodCompare): string | null {
  const parts: string[] = [];
  const flat = c.weight && Math.abs(c.weight.delta) < 0.3;
  if (c.weight) parts.push(flat ? 'вес почти не изменился' : `вес ${c.weight.delta < 0 ? 'снизился' : 'вырос'} на ${n1(c.weight.delta)} кг`);
  const extra: string[] = [];
  if (c.waist && Math.abs(c.waist.delta) >= 0.5) extra.push(`талия ${c.waist.delta < 0 ? 'уменьшилась' : 'увеличилась'} на ${n1(c.waist.delta)} см`);
  if (c.bodyfat && Math.abs(c.bodyfat.delta) >= 0.5) extra.push(`процент жира ${c.bodyfat.delta < 0 ? '−' : '+'}${n1(c.bodyfat.delta)}`);
  if (c.strengthPct !== null && Math.abs(c.strengthPct) >= 2) extra.push(`силовые ${c.strengthPct > 0 ? 'выросли' : 'снизились'} на ${Math.abs(c.strengthPct)}%`);
  if (!parts.length && !extra.length) return null;
  const first = parts[0] ?? '';
  let text = first;
  if (extra.length) {
    const tail = extra.length > 1 ? `${extra.slice(0, -1).join(', ')}, а ${extra[extra.length - 1]}` : extra[0];
    text = first ? `${first}${flat ? ', но' : ','} ${tail}` : tail;
  }
  return `За ${c.days} дн.: ${text}.`;
}
