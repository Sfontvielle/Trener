import type { BodyMetric, FoodEntry, ISODate, PlanAdjustment, UserProfile, WeightEntry, WorkoutSession } from '@/types';
import { decideCalories } from '@/features/science/calories';
import { estimateMaintenance, type MaintenanceEstimate } from '@/features/science/maintenance';
import { waistTrend } from '@/features/science/bodyTrend';
import type { Basis } from '@/features/science/sources';
import { progressStatus } from '@/features/training/engine/scoring';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { targetWeeklyChangeKg } from './targets';
import { addDays, daysBetween, today } from '@/utils/date';
import { BRAND } from '@/config/brand';

export interface CalorieReview {
  status: 'insufficient_data' | 'on_track' | 'adjust';
  actualKgPerWeek?: number;
  targetKgPerWeek: number;
  deltaKcal: number;
  headline: string;
  detail: string;
  observedTdee?: number;
  loggingCoverage: number;
  /** Пошаговое обоснование решения (из science/calories) */
  reasons: string[];
  /** Итог одной фразой: «Вес растёт в целевом диапазоне, талия стабильна… Калории менять не нужно.» */
  summary: string;
  /** Персональная оценка расхода по фактическим данным (null — мало данных) */
  maintenance: MaintenanceEstimate | null;
  basis: Basis;
}

/**
 * Обзор калорийности: тренд веса (не одно взвешивание) + талия + силовые + полнота дневника →
 * решение science/calories. Фактический расход (observed TDEE) = средняя калорийность − изменение
 * запасов (темп × 7700 / 7) — показывается, когда дневник заполнен ≥70% дней.
 */
export function reviewCalories(args: {
  profile: UserProfile;
  weights: WeightEntry[];
  entries: FoodEntry[];
  adjustments: PlanAdjustment[];
  targetKcal: number;
  metrics?: BodyMetric[];
  sessions?: WorkoutSession[];
  now?: ISODate;
}): CalorieReview {
  const { profile, weights, entries, adjustments, targetKcal } = args;
  const now = args.now ?? today();
  const trend = weightTrend(weights);
  const currentW = trend.length ? trend[trend.length - 1].trend : profile.weightKg;
  const target = targetWeeklyChangeKg(profile, currentW);
  const rate = weeklyRate(trend, 21);

  // Покрытие дневника питания за 14 дней (день считается, если записано ≥50% цели)
  const since = addDays(now, -14);
  const loggedDays = new Map<ISODate, number>();
  for (const e of entries) if (e.date > since && e.date < now) loggedDays.set(e.date, (loggedDays.get(e.date) ?? 0) + e.macros.kcal);
  const fullDays = [...loggedDays.values()].filter((k) => k > targetKcal * 0.5);
  const coverage = fullDays.length / 13;
  // Персональный расход — отдельная оценка по 2–4 неделям (регрессия веса + полные дни дневника)
  const maintenance = estimateMaintenance(entries, weights, now);
  const observedTdee = maintenance?.kcal;

  // Таймер «ждём эффекта» запускают только изменения калорий (не перестройка тренировок)
  const lastCal = adjustments.filter((a) => a.kind === 'calories' && (a.deltaKcal !== 0 || a.source === 'goal_change')).sort((a, b) => b.createdAt - a.createdAt)[0];
  const daysSinceAdj = lastCal ? daysBetween(isoFromMs(lastCal.createdAt), now) : 999;
  const waist = args.metrics ? waistTrend(args.metrics, now) : null;

  const d = decideCalories({
    goal: profile.goal,
    targetKgPerWeek: target,
    actualKgPerWeek: rate ? rate.kgPerWeek : null,
    waistCmPerWeek: waist?.cmPerWeek ?? null,
    waistDays: waist?.days ?? 0,
    strength: args.sessions ? strengthSignal(args.sessions) : 'unknown',
    coverage,
    daysSinceLastChange: daysSinceAdj,
    bodyWeightKg: currentW,
    trendDays: rate?.days,
  });

  if (d.action === 'insufficient') {
    const n = weights.length;
    return {
      status: 'insufficient_data',
      targetKgPerWeek: target,
      deltaKcal: 0,
      headline: 'Мало данных о весе',
      detail: n === 0 ? `Взвешивайся утром 3–4 раза в неделю — через 2 недели ${BRAND} сверит калории с реальным трендом.` : `Есть ${n} ${n === 1 ? 'замер' : 'замера(ов)'}. Нужно ≥5 взвешиваний за 10+ дней, чтобы увидеть тренд.`,
      loggingCoverage: coverage,
      reasons: d.reasons,
      summary: d.summary,
      maintenance,
      basis: d.basis,
    };
  }
  let headline: string;
  if (d.action === 'hold') headline = profile.goal === 'bulk' ? 'Набор идёт по плану' : profile.goal === 'cut' ? 'Снижение идёт по плану' : 'Вес идёт по плану';
  else if (d.action === 'wait') headline = 'Ждём эффекта корректировки';
  else if (profile.goal === 'bulk') headline = d.deltaKcal > 0 ? 'Вес не растёт — добавим калорий' : 'Набор слишком быстрый — замедлим';
  else if (profile.goal === 'cut') headline = d.deltaKcal < 0 ? 'Вес снижается медленнее плана' : 'Вес уходит слишком быстро';
  else headline = d.deltaKcal < 0 ? 'Вес растёт' : 'Вес снижается';
  return {
    status: d.action === 'increase' || d.action === 'decrease' ? 'adjust' : 'on_track',
    actualKgPerWeek: rate!.kgPerWeek,
    targetKgPerWeek: target,
    deltaKcal: d.deltaKcal,
    headline,
    detail: `${d.reasons.join(' ')}${d.deltaKcal ? ` Предлагаю ${d.deltaKcal > 0 ? '+' : ''}${d.deltaKcal} ккал/день.` : ''}`,
    observedTdee,
    loggingCoverage: coverage,
    reasons: d.reasons,
    summary: d.summary,
    maintenance,
    basis: d.basis,
  };
}

/** Силовые по основным упражнениям за 6 недель: растут / стоят / мало данных */
export function strengthSignal(sessions: WorkoutSession[]): 'progressing' | 'stalled' | 'unknown' {
  const recent = sessions.filter((s) => s.status === 'completed' && s.date > addDays(today(), -42));
  const ids = [...new Set(recent.flatMap((s) => s.exercises.slice(0, 2).map((e) => e.exerciseId)))];
  const st = ids.map((id) => progressStatus(id, recent)).filter((x) => x.status === 'progressing' || x.status === 'plateau');
  if (st.length < 2) return 'unknown';
  return st.filter((x) => x.status === 'progressing').length >= st.length / 2 ? 'progressing' : 'stalled';
}


function isoFromMs(ms: number): ISODate {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
