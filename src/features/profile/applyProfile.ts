import { estimateMaintenance } from '@/features/science/maintenance';
import { useNutrition } from '@/stores/nutrition';
import type { UserProfile } from '@/types';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useBody } from '@/stores/body';
import { useCoach } from '@/stores/coach';
import { useWorkouts } from '@/stores/workouts';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { estimateRecovery } from '@/features/training/engine/recovery';
import { getPrefs } from '@/features/training/engine/prefs';
import { generatePlan } from '@/features/training/planGenerator';
import { computeNutritionTarget, GOAL_LABEL, shiftTargetKcal } from '@/features/nutrition/targets';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { today } from '@/utils/date';

const TRAINING_KEYS: (keyof UserProfile)[] = ['goal', 'level', 'daysPerWeek', 'sessionMinutes', 'location', 'equipment', 'avoidExerciseIds', 'preferredDays', 'training', 'health', 'limitations'];
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
  // Персональный расход по фактическим данным заменяет формулу, когда накопилось 2+ недели данных.
  // Только при «чистом» пересчёте (adj = 0): иначе прежние корректировки учлись бы дважды.
  const mt = adj === 0 ? estimateMaintenance(useNutrition.getState().entries, useBody.getState().weights) : null;
  const target = needTarget ? computeNutritionTarget(next, { weightKg: trendW, adjustmentKcal: adj, observedTdee: mt?.kcal, observedConfidence: mt?.confidence }) : planState.target!;

  if (needPlan) {
    const ws = useWorkouts.getState();
    const recovery = estimateRecovery({ profile: getPrefs(next).recoveryProfile, sessions: ws.sessions, checkins: useCheckins.getState().byDate, health: useHealth.getState().days });
    const plan = generatePlan(next, { previous: planState.plan, sessions: ws.sessions, customs: ws.customExercises, recovery });
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
  // База расчёта (формула или персональный расход) сохраняется: итог ровно «было + delta», макросы пересчитаны
  const target = shiftTargetKcal(profile, ps.target, trendW, delta, reason);
  ps.setTarget(target);
  ps.addAdjustment({ kind: 'calories', summary: `${delta > 0 ? '+' : ''}${delta} ккал/день: ${reason}`, source, deltaKcal: delta });
}

/**
 * Перекалибровать цель по персональному расходу: формула заменяется фактическими данными,
 * накопленные корректировки сбрасываются (они уже «внутри» фактического расхода).
 */
export function recalibrateCalories(): { ok: boolean; message: string } {
  const profile = useProfile.getState().profile;
  const ps = usePlan.getState();
  if (!profile || !ps.target) return { ok: false, message: 'Нет плана питания' };
  const mt = estimateMaintenance(useNutrition.getState().entries, useBody.getState().weights);
  if (!mt) return { ok: false, message: 'Пока мало данных: нужно 2+ недели дневника и взвешиваний' };
  const trendW = latestTrendWeight(useBody.getState().weights) ?? profile.weightKg;
  const target = computeNutritionTarget(profile, { weightKg: trendW, adjustmentKcal: 0, observedTdee: mt.kcal, observedConfidence: mt.confidence });
  const delta = target.kcal - ps.target.kcal;
  ps.setTarget(target);
  ps.addAdjustment({ kind: 'calories', summary: `Калибровка по фактическому расходу ~${mt.kcal} ккал: ${delta > 0 ? '+' : ''}${delta} ккал`, source: 'adaptive', deltaKcal: delta });
  return { ok: true, message: `Цель: ${target.kcal} ккал (${delta > 0 ? '+' : ''}${delta})` };
}
