import type { BodyMetric, DailyCheckIn, FoodEntry, ISODate, NutritionTarget, UserProfile, WeightEntry, WorkoutPlan, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { addDays, formatHours, startOfWeek, today } from '@/utils/date';
import { bestSet, historyFor, isPersonalRecord, workingSets } from '@/features/training/progression';
import { doneFineVolume, weeklyTargets } from '@/features/training/engine/volume';
import { getPrefs } from '@/features/training/engine/prefs';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { lastWeekSummary, type WeekSummary } from './weekly';
import { metricSeries } from './series';

/**
 * Еженедельный отчёт: факты прошлой недели (Пн–Вс) и вывод тренера в трёх частях —
 * что получилось, что требует внимания, что предлагается изменить.
 * Предложения по программе применяются только после подтверждения на экране отчёта.
 */
export interface WeeklyReview {
  from: ISODate;
  to: ISODate;
  week: WeekSummary | null;
  waistDelta: number | null;
  missed: number;
  strengthUps: { name: string; text: string }[];
  prs: string[];
  kcalOnTargetDays: number;
  loggedDays: number;
  avgProtein: number | null;
  avgReadiness: number | null;
  good: string[];
  attention: string[];
}

export function buildWeeklyReview(args: {
  profile: UserProfile;
  plan: WorkoutPlan | null;
  target: NutritionTarget | null;
  sessions: WorkoutSession[];
  entries: FoodEntry[];
  weights: WeightEntry[];
  metrics: BodyMetric[];
  checkins: Record<string, DailyCheckIn>;
  readiness: (d: ISODate) => number | undefined;
  ref?: ISODate;
}): WeeklyReview {
  const ref = args.ref ?? today();
  const from = addDays(startOfWeek(ref), -7);
  const to = addDays(from, 6);
  const inWeek = (d: ISODate) => d >= from && d <= to;
  const week = lastWeekSummary({ sessions: args.sessions, plan: args.plan, entries: args.entries, target: args.target, weights: args.weights, checkins: args.checkins, ref });

  const waist = metricSeries(args.metrics, 'waist');
  const wBefore = [...waist].reverse().find((m) => m.date < from);
  const wIn = [...waist].reverse().find((m) => inWeek(m.date));
  const waistDelta = wBefore && wIn ? Math.round((wIn.value - wBefore.value) * 10) / 10 : null;

  const done = args.sessions.filter((s) => s.status === 'completed' && inWeek(s.date));
  const before = args.sessions.filter((s) => s.status === 'completed' && s.date < from);
  const missed = week ? Math.max(0, week.planned - week.workouts) : 0;

  // Рост рабочих весов и рекорды недели
  const strengthUps: { name: string; text: string }[] = [];
  const prs: string[] = [];
  const seen = new Set<string>();
  for (const s of done) {
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId);
      const b = bestSet(we.sets);
      if (!ex || !b) continue;
      const hist = historyFor(ex.id, before, 10);
      const set = workingSets(we.sets).find((x) => x.weight === b.weight && x.reps === b.reps);
      if (set && isPersonalRecord(ex, set, hist) && !prs.some((p) => p.startsWith(ex.name))) prs.push(`${ex.name}: ${set.weight ? `${String(set.weight).replace('.', ',')} кг × ${set.reps}` : `${set.reps} повт.`}`);
      if (seen.has(ex.id) || !hist[0]) continue;
      seen.add(ex.id);
      const prevTop = Math.max(...hist[0].sets.map((x) => x.weight));
      if (b.weight > prevTop && prevTop > 0) strengthUps.push({ name: ex.name, text: `+${String(Math.round((b.weight - prevTop) * 10) / 10).replace('.', ',')} кг` });
    }
  }

  // Питание: дни в пределах ±10% от цели
  const byDay = new Map<string, { k: number; p: number }>();
  for (const e of args.entries) {
    if (!inWeek(e.date)) continue;
    const x = byDay.get(e.date) ?? { k: 0, p: 0 };
    x.k += e.macros.kcal;
    x.p += e.macros.protein;
    byDay.set(e.date, x);
  }
  const days = [...byDay.values()].filter((x) => x.k > 600);
  const kcalOnTargetDays = args.target ? days.filter((x) => Math.abs(x.k - args.target!.kcal) <= args.target!.kcal * 0.1).length : 0;
  const avgProtein = days.length ? Math.round(days.reduce((a, x) => a + x.p, 0) / days.length) : null;

  const scores: number[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = args.readiness(d);
    if (r !== undefined) scores.push(r);
  }
  const avgReadiness = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const good: string[] = [];
  const attention: string[] = [];
  if (week) {
    if (week.planned && week.workouts >= week.planned) good.push(`Все ${week.planned} тренировки по плану выполнены`);
    else if (missed) attention.push(`Пропущено тренировок: ${missed} из ${week.planned}`);
  }
  if (strengthUps.length) good.push(`Рабочие веса выросли: ${strengthUps.slice(0, 3).map((x) => `${x.name} ${x.text}`).join(', ')}`);
  if (prs.length) good.push(`Новых рекордов: ${prs.length}`);
  if (args.target && avgProtein !== null) {
    if (avgProtein >= args.target.protein * 0.9) good.push(`Белок в среднем ${avgProtein} г — в норме`);
    else attention.push(`Белок в среднем ${avgProtein} г из ${args.target.protein} г`);
  }
  if (args.target && days.length >= 3) {
    if (kcalOnTargetDays >= Math.ceil(days.length * 0.6)) good.push(`Калории в цели ${kcalOnTargetDays} из ${days.length} дней`);
    else attention.push(`Калории в цели только ${kcalOnTargetDays} из ${days.length} дней`);
  } else if (args.target) attention.push('Питание записывалось меньше 3 дней — выводы по калориям неточные');
  if (week?.weightDelta !== null && week?.weightDelta !== undefined && args.profile.goal !== 'maintain' && args.profile.goal !== 'recomp') {
    const wantUp = args.profile.goal === 'bulk';
    if ((wantUp && week.weightDelta > 0.05) || (!wantUp && week.weightDelta < -0.05)) good.push(`Вес движется к цели: ${week.weightDelta > 0 ? '+' : ''}${week.weightDelta.toFixed(1).replace('.', ',')} кг`);
    else attention.push(`Вес ${week.weightDelta > 0 ? '+' : ''}${week.weightDelta.toFixed(1).replace('.', ',')} кг — не в сторону цели`);
  }
  if (waistDelta !== null && waistDelta <= -0.5) good.push(`Талия −${Math.abs(waistDelta).toString().replace('.', ',')} см`);
  if (week?.avgSleep && week.avgSleep < 7) attention.push(`Сон в среднем ${formatHours(week.avgSleep)} ч — меньше 7`);
  if (avgReadiness !== null && avgReadiness < 65) attention.push(`Готовность в среднем ${avgReadiness} из 100`);

  // Недобор объёма по мышцам
  const tg = weeklyTargets(args.profile, getPrefs(args.profile), args.plan?.recovery?.factor ?? 1);
  const vol = doneFineVolume(args.sessions, from, to);
  const short = VOLUME_MUSCLES.filter((m) => tg[m] >= 6 && vol[m] < tg[m] * 0.6 && done.length > 0);
  if (short.length) attention.push(`Мало прямой работы: ${short.slice(0, 3).map((m) => VM_LABEL[m].toLowerCase()).join(', ')}`);

  return { from, to, week, waistDelta, missed, strengthUps, prs, kcalOnTargetDays, loggedDays: days.length, avgProtein, avgReadiness, good, attention };
}
