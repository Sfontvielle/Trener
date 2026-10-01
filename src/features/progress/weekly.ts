import type { DailyCheckIn, FoodEntry, ISODate, NutritionTarget, WeightEntry, WorkoutPlan, WorkoutSession } from '@/types';
import { addDays, startOfWeek, today, weekdayIndex } from '@/utils/date';
import { sessionVolume } from '@/features/training/analytics';
import { weightTrend } from './weightTrend';

export interface WeekSummary {
  from: ISODate;
  to: ISODate;
  workouts: number;
  planned: number;
  sets: number;
  loggedDays: number;
  avgKcal: number | null;
  proteinDays: number;
  weightDelta: number | null;
  avgSleep: number | null;
  headline: string;
}

/** Сводка за прошлую календарную неделю (Пн–Вс) — считается автоматически, без действий пользователя */
export function lastWeekSummary(args: {
  sessions: WorkoutSession[];
  plan: WorkoutPlan | null;
  entries: FoodEntry[];
  target: NutritionTarget | null;
  weights: WeightEntry[];
  checkins: Record<string, DailyCheckIn>;
  ref?: ISODate;
}): WeekSummary | null {
  const ref = args.ref ?? today();
  const from = addDays(startOfWeek(ref), -7);
  const to = addDays(from, 6);
  const inWeek = (d: ISODate) => d >= from && d <= to;

  const done = args.sessions.filter((s) => s.status === 'completed' && inWeek(s.date));
  let planned = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (args.plan?.schedule[weekdayIndex(d)]) planned++;
  const sets = done.reduce((a, s) => a + sessionVolume(s).sets, 0);

  const byDay = new Map<ISODate, { kcal: number; protein: number }>();
  for (const e of args.entries) {
    if (!inWeek(e.date)) continue;
    const x = byDay.get(e.date) ?? { kcal: 0, protein: 0 };
    x.kcal += e.macros.kcal;
    x.protein += e.macros.protein;
    byDay.set(e.date, x);
  }
  const days = [...byDay.values()].filter((x) => x.kcal > 300);
  const avgKcal = days.length ? Math.round(days.reduce((a, x) => a + x.kcal, 0) / days.length) : null;
  const proteinDays = args.target ? days.filter((x) => x.protein >= args.target!.protein * 0.9).length : 0;

  const tr = weightTrend(args.weights);
  const at = (d: ISODate) => [...tr].reverse().find((p) => p.date <= d)?.trend;
  const wFrom = at(addDays(from, -1)) ?? tr.find((p) => p.date >= from)?.trend;
  const wTo = at(to);
  const weightDelta = wFrom !== undefined && wTo !== undefined && tr.some((p) => inWeek(p.date) && p.raw !== undefined) ? Math.round((wTo - wFrom) * 100) / 100 : null;

  const sleeps = Object.values(args.checkins).filter((c) => inWeek(c.date));
  const avgSleep = sleeps.length ? sleeps.reduce((a, c) => a + c.sleepHours, 0) / sleeps.length : null;

  if (!done.length && !days.length && weightDelta === null) return null;

  const parts: string[] = [`${done.length}/${planned || done.length} тренировок`];
  if (days.length && args.target) parts.push(`белок в норме ${proteinDays}/${days.length} дн.`);
  if (weightDelta !== null) parts.push(`вес ${weightDelta >= 0 ? '+' : ''}${weightDelta.toFixed(1)} кг`);
  return { from, to, workouts: done.length, planned, sets, loggedDays: days.length, avgKcal, proteinDays, weightDelta, avgSleep, headline: parts.join(' · ') };
}
