import type { DailyCheckIn, Exercise, FoodEntry, ISODate, NutritionTarget, UserProfile, WeightEntry, WorkoutPlan, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { getPrefs } from '@/features/training/engine/prefs';
import { progressStatus } from '@/features/training/engine/scoring';
import { substitutesFor } from '@/features/training/engine/substitute';
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

export interface WeeklyProposal {
  id: string;
  kind: 'days' | 'replace';
  text: string;
  why: string;
  days?: number;
  fromId?: string;
  toId?: string;
}

/**
 * Предложения недельного обзора (применяются только по кнопке пользователя):
 *  • фактическая частота стабильно ниже плана → план под реальное число дней (чтобы группы не выпадали);
 *  • плато в упражнении плана 3+ тренировки → замена близким аналогом (той же мышцы и движения).
 */
export function weeklyProposals(args: { profile: UserProfile; plan: WorkoutPlan | null; sessions: WorkoutSession[]; customs?: Exercise[]; ref?: ISODate }): WeeklyProposal[] {
  const { profile, plan, sessions } = args;
  if (!plan) return [];
  const ref = args.ref ?? today();
  const out: WeeklyProposal[] = [];
  const weekStart = startOfWeek(ref);
  const first = sessions.filter((s) => s.status === 'completed').map((s) => s.date).sort()[0];
  if (first && first <= addDays(weekStart, -21)) {
    const perWeek = [1, 2, 3].map((w) => sessions.filter((s) => s.status === 'completed' && s.date >= addDays(weekStart, -7 * w) && s.date < addDays(weekStart, -7 * (w - 1))).length);
    const avg = perWeek.reduce((a, b) => a + b, 0) / 3;
    const n = Math.max(2, Math.round(avg));
    if (perWeek.every((x) => x < profile.daysPerWeek) && n < profile.daysPerWeek) {
      out.push({ id: `days-${n}`, kind: 'days', days: n, text: `План на ${n} ${n <= 4 ? 'дня' : 'дней'} в неделю вместо ${profile.daysPerWeek}`, why: `3 недели подряд выходило ${perWeek.reverse().join(' / ')} тренировки — при плане на ${profile.daysPerWeek} часть мышц выпадает. План под реальную частоту сохранит объём на каждую группу.` });
    }
  }
  const prefs = getPrefs(profile);
  const seen = new Set<string>();
  for (const t of plan.templates) {
    for (const pe of t.exercises) {
      if (seen.has(pe.exerciseId)) continue;
      seen.add(pe.exerciseId);
      const st = progressStatus(pe.exerciseId, sessions);
      if (st.status !== 'plateau') continue;
      const sub = substitutesFor(pe.exerciseId, profile, prefs, args.customs ?? [], 1)[0];
      const ex = getExercise(pe.exerciseId, args.customs ?? []);
      if (!sub || !ex) continue;
      out.push({ id: `replace-${pe.exerciseId}-${sub.id}`, kind: 'replace', fromId: pe.exerciseId, toId: sub.id, text: `«${ex.name}» → «${sub.name}»`, why: `${st.sessions} тренировок без прироста в «${ex.name}». Новый стимул той же мышцы и движения обычно сдвигает плато; рабочие веса подберутся за 1–2 тренировки.` });
      if (out.filter((x) => x.kind === 'replace').length >= 2) break;
    }
  }
  return out;
}
