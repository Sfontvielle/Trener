import type { UserProfile } from '@/types';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useBody } from '@/stores/body';
import { useCoach } from '@/stores/coach';
import { useWorkouts } from '@/stores/workouts';
import { generatePlan } from '@/features/training/planGenerator';
import { computeNutritionTarget, GOAL_LABEL } from '@/features/nutrition/targets';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { today } from '@/utils/date';

const TRAINING_KEYS: (keyof UserProfile)[] = ['goal', 'level', 'daysPerWeek', 'sessionMinutes', 'location', 'equipment', 'avoidExerciseIds', 'preferredDays', 'training'];
const NUTRITION_KEYS: (keyof UserProfile)[] = ['goal', 'ratePctPerWeek', 'sex', 'age', 'heightCm', 'weightKg', 'stepsPerDay', 'workStyle', 'activity', 'daysPerWeek', 'sessionMinutes'];

/**
 * Единая точка изменения профиля: сохраняет профиль и пересчитывает связанные части системы.
 * Смена цели → новый план тренировок + новые КБЖУ (адаптивная поправка сбрасывается).
 */
export function applyProfile(next: UserProfile, opts: { force?: boolean } = {}): { planRebuilt: boolean; targetChanged: boolean } {
  const prev = useProfile.getState().profile;
  const planState = usePlan.getState();
  const body = useBody.getState();

  // Вес профиля синхронизируем с весами: при ручном изменении — добавляем взвешивание
  if (!prev || prev.weightKg !== next.weightKg) body.addWeight(today(), next.weightKg);

  useProfile.getState().setProfile(next);

  const changed = (keys: (keyof UserProfile)[]) => !prev || keys.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
  const goalChanged = !!prev && prev.goal !== next.goal;
  const needPlan = opts.force || !planState.plan || changed(TRAINING_KEYS);
  const needTarget = opts.force || !planState.target || changed(NUTRITION_KEYS);

  const trendW = latestTrendWeight(useBody.getState().weights) ?? next.weightKg;
  const adj = goalChanged ? 0 : planState.target?.adjustmentKcal ?? 0;
  const target = needTarget ? computeNutritionTarget(next, { weightKg: trendW, adjustmentKcal: adj }) : planState.target!;

  if (needPlan) {
    const ws = useWorkouts.getState();
    const plan = generatePlan(next, { previous: planState.plan, sessions: ws.sessions, customs: ws.customExercises });
    const summary = !prev ? 'Стартовый план создан' : goalChanged ? `Цель изменена: ${GOAL_LABEL[next.goal]} — план и питание пересчитаны` : 'Параметры тренировок изменены — план перестроен';
    planState.setPlan(plan, target, summary, goalChanged ? 'goal_change' : 'user');
    if (prev && needTarget) {
      usePlan.getState().addAdjustment({ kind: 'calories', summary: `КБЖУ пересчитаны: ${target.kcal} ккал`, source: goalChanged ? 'goal_change' : 'user', deltaKcal: 0 });
    }
  } else if (needTarget) {
    planState.setTarget(target);
    planState.addAdjustment({ kind: 'calories', summary: `КБЖУ пересчитаны: ${target.kcal} ккал`, source: 'user', deltaKcal: 0 });
  }

  if (goalChanged) {
    useCoach.getState().addMemory(`Цель изменена на «${GOAL_LABEL[next.goal]}» (${today()})`, 'other', 'user');
  }
  return { planRebuilt: needPlan, targetChanged: needTarget };
}

/** Применить адаптивную корректировку калорий */
export function applyCalorieDelta(delta: number, reason: string, source: 'adaptive' | 'coach' | 'user'): void {
  const profile = useProfile.getState().profile;
  const ps = usePlan.getState();
  if (!profile || !ps.target) return;
  const trendW = latestTrendWeight(useBody.getState().weights) ?? profile.weightKg;
  const target = computeNutritionTarget(profile, { weightKg: trendW, adjustmentKcal: (ps.target.adjustmentKcal ?? 0) + delta });
  ps.setTarget(target);
  ps.addAdjustment({ kind: 'calories', summary: `${delta > 0 ? '+' : ''}${delta} ккал/день: ${reason}`, source, deltaKcal: delta });
}
