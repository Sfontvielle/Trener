import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useBody } from '@/stores/body';
import { useNutrition } from '@/stores/nutrition';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { useLabs } from '@/stores/labs';
import { useCoach } from '@/stores/coach';
import { healthContext } from '@/features/health/model';
import { currentHealthSignals } from '@/features/health/current';
import { readinessFor } from '@/features/recovery/derive';
import { resolveToday } from '@/features/training/today';
import { stepGoal } from '@/features/science/steps';
import { estimateMaintenance } from '@/features/science/maintenance';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { targetWeeklyChangeKg } from '@/features/nutrition/targets';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { buildWeeklyReview } from '@/features/progress/review';
import { analyzeProgram } from '@/features/training/adaptPlan';
import { addDays, today } from '@/utils/date';
import { coachAlerts, coachToday, weeklyDecisions, type CoachAlert, type CoachToday, type WeeklyCoach } from './decisions';
import type { WeeklyReview } from '@/features/progress/review';

/**
 * Сборка входных данных Coach Engine из сторов. Логика решений — в decisions/* (чистые функции с тестами);
 * здесь только чтение состояния. Используется Главной, отчётом недели и контекстом чата.
 */
export function currentCoachToday(date = today()): CoachToday | null {
  const profile = useProfile.getState().profile;
  if (!profile) return null;
  const ps = usePlan.getState();
  const ws = useWorkouts.getState();
  const checkins = useCheckins.getState().byDate;
  const health = useHealth.getState().days;
  const body = useBody.getState();
  const entries = useNutrition.getState().entries;
  const readiness = readinessFor(date, checkins, ws.sessions, health);
  const tw = resolveToday({ date, plan: ps.plan, sessions: ws.sessions, override: ps.overrides[date], readiness });
  const maintenance = estimateMaintenance(entries, body.weights, date);
  const calorieReview = ps.target ? reviewCalories({ profile, weights: body.weights, entries, adjustments: ps.adjustments, targetKcal: ps.target.kcal, metrics: body.metrics, sessions: ws.sessions, now: date }) : null;
  return coachToday({
    date,
    profile,
    today: tw,
    readiness,
    checkin: checkins[date],
    health,
    healthCtx: healthContext(health, date),
    sessions: ws.sessions,
    customs: ws.customExercises,
    gym: useProfile.getState().settings.gym,
    target: ps.target,
    maintenance,
    calorieReview,
    steps: stepGoal({ age: profile.age, profileSteps: profile.stepsPerDay, health, ref: date }),
    signals: currentHealthSignals(),
  });
}

export function currentAlerts(date = today()): CoachAlert[] {
  const profile = useProfile.getState().profile;
  if (!profile) return [];
  const body = useBody.getState();
  const w = latestTrendWeight(body.weights) ?? profile.weightKg;
  const dismissed = useCoach.getState().advice.filter((a) => a.date === date && a.status === 'dismissed').map((a) => a.key);
  return coachAlerts({
    ref: date,
    goal: profile.goal,
    targetKgPerWeek: targetWeeklyChangeKg(profile, w),
    bodyWeightKg: w,
    weights: body.weights,
    metrics: body.metrics,
    sessions: useWorkouts.getState().sessions,
    plan: usePlan.getState().plan,
    checkins: useCheckins.getState().byDate,
    health: useHealth.getState().days,
    labs: useLabs.getState().reports,
    signals: currentHealthSignals(),
    customs: useWorkouts.getState().customExercises,
    gym: useProfile.getState().settings.gym,
    dismissed,
  });
}

export function currentWeekly(ref = today()): { review: WeeklyReview; coach: WeeklyCoach } | null {
  const profile = useProfile.getState().profile;
  if (!profile) return null;
  const ps = usePlan.getState();
  const ws = useWorkouts.getState();
  const body = useBody.getState();
  const entries = useNutrition.getState().entries;
  const checkins = useCheckins.getState().byDate;
  const health = useHealth.getState().days;
  const review = buildWeeklyReview({ profile, plan: ps.plan, target: ps.target, sessions: ws.sessions, entries, weights: body.weights, metrics: body.metrics, checkins, readiness: (d) => readinessFor(d, checkins, ws.sessions, health)?.score, ref });
  const calories = ps.target ? reviewCalories({ profile, weights: body.weights, entries, adjustments: ps.adjustments, targetKcal: ps.target.kcal, metrics: body.metrics, sessions: ws.sessions, now: ref }) : null;
  const proposals = analyzeProgram({ profile, plan: ps.plan, sessions: ws.sessions, checkins, readinessAvg: review.avgReadiness, ref });
  const coach = weeklyDecisions({
    profile,
    plan: ps.plan,
    target: ps.target,
    review,
    calories,
    proposals,
    sessions: ws.sessions,
    health,
    weighIns: body.weights.filter((x) => x.date > addDays(ref, -21)).length,
    adjustments: ps.adjustments,
    customs: ws.customExercises,
    gym: useProfile.getState().settings.gym,
    signals: currentHealthSignals(),
    ref,
  });
  return { review, coach };
}
