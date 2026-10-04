import type { Exercise, GymSetup, ISODate, NutritionTarget, PlanAdjustment, UserProfile, WorkoutPlan, WorkoutSession } from '@/types';
import type { WeeklyReview } from '@/features/progress/review';
import type { HealthDay } from '@/features/health/model';
import type { CalorieReview } from '@/features/nutrition/adaptive';
import type { ProgramProposal } from '@/features/training/adaptPlan';
import { healthGate, type HealthSignal } from '@/features/health/monitor';
import { getExercise } from '@/data/exercises';
import { historyFor } from '@/features/training/progression';
import { addDays } from '@/utils/date';
import { adaptationConfidence } from './confidence';
import { strengthChangePct } from './composition';
import { exerciseDecision } from './today';
import { fmtInt, type Decision } from './types';

/**
 * Weekly Review как у тренера: метрики недели + решения (калории, объём, конкретные упражнения) с причинами.
 * Изменения калорий и программы применяются только по кнопке пользователя.
 */
export interface WeeklyMetrics {
  weightDelta: number | null;
  waistDelta: number | null;
  avgKcal: number | null;
  stepsPerDay: number | null;
  workoutsDone: number;
  workoutsPlanned: number;
  strengthPct: number | null;
  avgSleep: number | null;
}

export interface WeeklyCoach {
  metrics: WeeklyMetrics;
  decisions: Decision[];
  /** Решение по калориям (для кнопки «Применить») */
  calorieDelta: number;
}

export function weeklyMetrics(review: WeeklyReview, sessions: WorkoutSession[], health: Record<string, HealthDay>): WeeklyMetrics {
  const steps: number[] = [];
  for (let d = review.from; d <= review.to; d = addDays(d, 1)) {
    const s = health[d]?.steps;
    if (s !== undefined && s > 300) steps.push(s);
  }
  // Силовые: лучший расчётный максимум этой недели против 4 предыдущих недель
  const str = strengthChangePct(sessions, addDays(review.from, -28), review.to);
  return {
    weightDelta: review.week?.weightDelta ?? null,
    waistDelta: review.waistDelta,
    avgKcal: review.week?.avgKcal ?? null,
    stepsPerDay: steps.length >= 3 ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : null,
    workoutsDone: review.week?.workouts ?? 0,
    workoutsPlanned: review.week?.planned ?? 0,
    strengthPct: str?.pct ?? null,
    avgSleep: review.week?.avgSleep ?? null,
  };
}

export function weeklyDecisions(args: {
  profile: UserProfile;
  plan: WorkoutPlan | null;
  target: NutritionTarget | null;
  review: WeeklyReview;
  calories: CalorieReview | null;
  proposals: ProgramProposal[];
  sessions: WorkoutSession[];
  health: Record<string, HealthDay>;
  weighIns: number;
  adjustments?: PlanAdjustment[];
  customs?: Exercise[];
  gym?: GymSetup;
  signals?: HealthSignal[];
  ref?: ISODate;
}): WeeklyCoach {
  const metrics = weeklyMetrics(args.review, args.sessions, args.health);
  const decisions: Decision[] = [];
  const gate = healthGate(args.signals ?? []);

  // 1. Калории
  const c = args.calories;
  let calorieDelta = 0;
  if (args.target && c) {
    const ac = adaptationConfidence(c, args.weighIns);
    const data: string[] = [];
    if (c.actualKgPerWeek !== undefined) data.push(`тренд веса ${c.actualKgPerWeek > 0 ? '+' : ''}${c.actualKgPerWeek.toFixed(2).replace('.', ',')} кг/нед за 3 нед. (цель ${c.targetKgPerWeek > 0 ? '+' : ''}${c.targetKgPerWeek.toFixed(2).replace('.', ',')})`);
    data.push(`дневник питания: ${Math.round(c.loggingCoverage * 13)} из 13 дней`);
    if (metrics.waistDelta !== null) data.push(`талия за неделю ${metrics.waistDelta > 0 ? '+' : ''}${String(metrics.waistDelta).replace('.', ',')} см`);
    if (c.maintenance) data.push(c.maintenance.text);
    calorieDelta = c.status === 'adjust' ? c.deltaKcal : 0;
    const what = calorieDelta ? `Калории ${calorieDelta > 0 ? '+' : '−'}${Math.abs(calorieDelta)}: ${fmtInt(args.target.kcal)} → ${fmtInt(args.target.kcal + calorieDelta)} ккал` : c.status === 'insufficient_data' ? 'Калории без изменений — пока мало данных' : `Калории без изменений (${fmtInt(args.target.kcal)} ккал)`;
    decisions.push({ id: 'w_kcal', area: 'nutrition', what, why: c.summary, data, confidence: ac.level, confidenceNote: ac.note, basis: c.basis });
  }

  // 2. Объём
  const p = args.proposals.find((x) => x.kind === 'volume' || x.kind === 'days' || x.kind === 'split');
  if (p) {
    decisions.push({ id: `w_prog_${p.id}`, area: 'training', what: p.title, why: p.why[0] ?? '', data: p.why.slice(1, 4), confidence: 'medium', confidenceNote: 'по выполнению плана и восстановлению за 2–3 недели', basis: { kind: 'heuristic', sources: ['schoenfeld2017', 'acsm2026'] } });
  } else if (metrics.workoutsDone > 0) {
    const reasons: string[] = [];
    if (metrics.workoutsPlanned) reasons.push(`выполнено ${metrics.workoutsDone} из ${metrics.workoutsPlanned} тренировок`);
    if (args.review.avgReadiness !== null) reasons.push(`средняя готовность ${args.review.avgReadiness}`);
    if (metrics.strengthPct !== null) reasons.push(`силовые ${metrics.strengthPct > 0 ? '+' : ''}${String(metrics.strengthPct).replace('.', ',')}%`);
    const stall = metrics.strengthPct !== null && metrics.strengthPct <= 0;
    decisions.push({ id: 'w_volume', area: 'training', what: 'Объём оставить без изменений', why: stall ? 'Силовые пока не растут, но признаков перегрузки нет — сначала добираем повторы и качество подходов, объём не трогаем.' : 'План выполняется, восстановление в норме — объём работает.', data: reasons, confidence: reasons.length >= 2 ? 'medium' : 'low', confidenceNote: 'по одной неделе выводы предварительные', basis: { kind: 'heuristic', sources: ['schoenfeld2017', 'acsm2026'] } });
  }

  // 3. Конкретные упражнения на следующую неделю: ключевые (первые) упражнения каждой тренировки
  if (args.plan) {
    const seen = new Set<string>();
    for (const t of args.plan.templates) {
      for (const pe of t.exercises.slice(0, 2)) {
        if (seen.has(pe.exerciseId) || seen.size >= 5) continue;
        seen.add(pe.exerciseId);
        const ex = getExercise(pe.exerciseId, args.customs ?? []);
        const history = ex ? historyFor(ex.id, args.sessions) : [];
        if (!ex || !history.length) continue;
        const d = exerciseDecision({ exercise: ex, sets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history, gym: args.gym, noIncrease: gate.blockIncrease ? 'есть показатели здоровья, которые стоит обсудить с врачом.' : undefined });
        const what = d.action === 'increase' ? `${ex.name}: увеличить вес ${String(d.from).replace('.', ',')} → ${String(d.weight).replace('.', ',')} кг` : d.action === 'reps' ? `${ex.name}: добавить повторы (${String(d.weight).replace('.', ',')} кг, цель ${pe.repMax})` : d.action === 'decrease' ? `${ex.name}: вернуться к ${String(d.weight).replace('.', ',')} кг` : `${ex.name}: держать ${String(d.weight).replace('.', ',')} кг`;
        decisions.push({ ...d, id: `w_ex_${ex.id}`, what });
      }
    }
  }
  if (gate.blockIncrease) decisions.unshift({ id: 'w_health', area: 'health', what: 'Нагрузку не повышаем', why: gate.reason!, data: (args.signals ?? []).filter((s) => s.level !== 'info' && s.level !== 'monitor').map((s) => s.title).slice(0, 3), confidence: 'high', confidenceNote: 'здоровье важнее прогресса', basis: (args.signals ?? [])[0]?.basis ?? { kind: 'heuristic', sources: [] } });
  return { metrics, decisions, calorieDelta };
}
