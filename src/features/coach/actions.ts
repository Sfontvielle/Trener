import type { CoachAction, CoachActionType, Exercise, PlannedExercise, SplitPreference, UserProfile, WorkoutPlan, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { getPrefs } from '@/features/training/engine/prefs';
import { checkAllowed } from '@/features/training/engine/scoring';
import { VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { historyFor, workingSets } from '@/features/training/progression';

/**
 * AI предлагает действие → приложение ВАЛИДИРУЕТ → пользователь подтверждает → только тогда меняется state.
 * Валидация не доверяет модели: проверяет существование упражнений, исключения и ограничения пользователя,
 * границы чисел и отказы пользователя от таких же предложений раньше.
 */

export interface ActionContext {
  profile: UserProfile;
  plan: WorkoutPlan | null;
  /** Упражнения сегодняшней тренировки (план с учётом изменений дня или активная сессия) */
  todayExercises: PlannedExercise[];
  sessions?: WorkoutSession[];
  customs?: Exercise[];
  /** Ключи предложений, от которых пользователь отказался «больше не предлагать» */
  rejected?: string[];
}

export type Validation = { ok: true; action: CoachAction } | { ok: false; reason: string };

const SPLITS: SplitPreference[] = ['auto', 'fullbody', 'upper_lower', 'ppl', 'ul_ppl', 'custom'];

/** Ключ для «Больше не предлагать эту замену» */
export function actionKey(a: Pick<CoachAction, 'type' | 'params'>): string {
  const p = a.params;
  switch (a.type) {
    case 'replace_exercise':
      return `replace:${p.exerciseId}>${p.toExerciseId}`;
    case 'exclude_exercise':
    case 'favorite_exercise':
      return `${a.type}:${p.exerciseId}`;
    case 'change_split':
      return `split:${p.split}`;
    case 'adjust_weekly_volume':
      return `volume:${p.muscle}:${Math.sign(p.deltaSets ?? 0)}`;
    case 'adjust_calories':
      return `kcal:${Math.sign(p.deltaKcal ?? 0)}`;
    default:
      return a.type;
  }
}

const inRange = (v: number | undefined, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function validateAction(action: CoachAction, ctx: ActionContext): Validation {
  const p = action.params ?? {};
  const prefs = getPrefs(ctx.profile);
  const customs = ctx.customs ?? [];
  const fail = (reason: string): Validation => ({ ok: false, reason });
  if ((ctx.rejected ?? []).includes(actionKey(action))) return fail('ты уже отказался от этого предложения');

  const ex = p.exerciseId ? getExercise(p.exerciseId, customs) : undefined;
  if (p.exerciseId && !ex) return fail('неизвестное упражнение');
  const inToday = (id?: string) => !!id && ctx.todayExercises.some((x) => x.exerciseId === id);
  const inPlan = (id?: string) => !!id && !!ctx.plan?.templates.some((t) => t.exercises.some((x) => x.exerciseId === id));
  const scopeHas = (id?: string) => (p.scope === 'plan' ? inPlan(id) : inToday(id) || inPlan(id));

  // Всё, что добавляет упражнение в программу, проходит тот же жёсткий фильтр, что и генератор
  const allowedTarget = (id?: string): string | null => {
    if (!id) return 'не указано упражнение';
    const t = getExercise(id, customs);
    if (!t) return 'неизвестное упражнение';
    const r = checkAllowed(t, ctx.profile, prefs);
    return r.ok ? null : `«${t.name}» недопустимо: ${r.reason}`;
  };

  const t: CoachActionType = action.type;
  switch (t) {
    case 'set_day_mode':
      if (!p.mode || !['normal', 'reduced', 'light', 'recovery', 'rest', 'deload'].includes(p.mode)) return fail('неизвестный режим дня');
      if (p.volumeFactor !== undefined && !inRange(p.volumeFactor, 0.3, 1.2)) return fail('объём вне допустимого диапазона');
      break;
    case 'swap_today':
      if (p.templateId && !ctx.plan?.templates.some((x) => x.id === p.templateId)) return fail('такой тренировки нет в плане');
      break;
    case 'reschedule_workout':
      if (p.templateId && !ctx.plan?.templates.some((x) => x.id === p.templateId)) return fail('такой тренировки нет в плане');
      break;
    case 'replace_exercise': {
      if (!scopeHas(p.exerciseId)) return fail('этого упражнения нет в тренировке');
      if (p.exerciseId === p.toExerciseId) return fail('замена совпадает с исходным');
      const bad = allowedTarget(p.toExerciseId);
      if (bad) return fail(bad);
      break;
    }
    case 'generate_workout':
      if (p.minutes !== undefined && !inRange(p.minutes, 15, 120)) return fail('длительность вне диапазона 15–120 мин');
      break;
    case 'favorite_exercise': {
      const bad = allowedTarget(p.exerciseId);
      if (bad) return fail(bad);
      break;
    }
    case 'exclude_exercise':
      if (!ex) return fail('не указано упражнение');
      break;
    case 'change_sets':
      if (!scopeHas(p.exerciseId)) return fail('этого упражнения нет в тренировке');
      if (!inRange(p.sets, 1, 6)) return fail('подходов должно быть 1–6');
      break;
    case 'change_rep_range':
      if (!scopeHas(p.exerciseId)) return fail('этого упражнения нет в тренировке');
      if (!inRange(p.repMin, 3, 30) || !inRange(p.repMax, 3, 30) || p.repMin! > p.repMax!) return fail('некорректный диапазон повторений');
      break;
    case 'change_rest_time':
      if (!scopeHas(p.exerciseId)) return fail('этого упражнения нет в тренировке');
      if (!inRange(p.restSec, 30, 300)) return fail('отдых должен быть 30–300 сек');
      break;
    case 'change_target_weight': {
      if (!inToday(p.exerciseId)) return fail('этого упражнения нет в сегодняшней тренировке');
      if (!inRange(p.weightKg, 0, 500)) return fail('некорректный вес');
      // Не больше ±15% от последнего рабочего веса — AI не может «придумать» резкий скачок
      const last = historyFor(p.exerciseId!, ctx.sessions ?? [], 1)[0];
      const lastW = last ? Math.max(0, ...workingSets(last.sets).map((s) => s.weight)) : 0;
      if (lastW > 0 && Math.abs(p.weightKg! - lastW) / lastW > 0.15) return fail(`слишком резкое изменение веса (последний рабочий ${lastW} кг)`);
      break;
    }
    case 'reorder_exercises': {
      const ids = ctx.todayExercises.map((x) => x.exerciseId).sort();
      const order = [...(p.order ?? [])].sort();
      if (ids.length !== order.length || ids.some((x, i) => x !== order[i])) return fail('порядок не совпадает с составом тренировки');
      break;
    }
    case 'reduce_today_volume':
      if (!inRange(p.volumeFactor ?? 0.85, 0.4, 0.95)) return fail('снижение объёма вне диапазона');
      break;
    case 'increase_today_volume':
      if (!inRange(p.volumeFactor ?? 1.1, 1.05, 1.25)) return fail('увеличение объёма вне диапазона (до +25%)');
      break;
    case 'change_split':
      if (!p.split || !SPLITS.includes(p.split)) return fail('неизвестный сплит');
      break;
    case 'apply_deload':
      break;
    case 'adjust_weekly_volume':
      if (!p.muscle || !VOLUME_MUSCLES.includes(p.muscle)) return fail('неизвестная мышечная группа');
      if (!inRange(p.deltaSets, -6, 6) || p.deltaSets === 0) return fail('изменение объёма должно быть от −6 до +6 подходов');
      break;
    case 'adjust_calories':
      if (!inRange(Math.abs(p.deltaKcal ?? 0), 50, 400)) return fail('изменение калорий должно быть 50–400 ккал');
      break;
    case 'suggest_meal':
      break;
    default:
      return fail('неизвестное действие');
  }
  return { ok: true, action };
}

/** Валидирует список действий модели: недопустимые помечаются invalid (и не получают кнопку «Применить») */
export function validateActions(list: CoachAction[], ctx: ActionContext): CoachAction[] {
  return list.map((a) => {
    const v = validateAction(a, ctx);
    return v.ok ? a : { ...a, invalid: v.reason };
  });
}

/** Применение к списку упражнений дня (чистая функция) */
export function applyToExercises(list: PlannedExercise[], a: CoachAction): PlannedExercise[] {
  const p = a.params;
  const map = (fn: (pe: PlannedExercise) => PlannedExercise) => list.map((pe) => (pe.exerciseId === p.exerciseId ? fn(pe) : pe));
  switch (a.type) {
    case 'replace_exercise':
      return map((pe) => ({ ...pe, exerciseId: p.toExerciseId!, why: p.reason ? `Замена от тренера: ${p.reason}` : pe.why }));
    case 'change_sets':
      return map((pe) => ({ ...pe, sets: p.sets! }));
    case 'change_rep_range':
      return map((pe) => ({ ...pe, repMin: p.repMin!, repMax: p.repMax! }));
    case 'change_rest_time':
      return map((pe) => ({ ...pe, restSec: p.restSec! }));
    case 'change_target_weight':
      return map((pe) => ({ ...pe, targetWeight: p.weightKg }));
    case 'reorder_exercises': {
      const rest = [...list];
      return (p.order ?? []).map((id) => rest.splice(rest.findIndex((x) => x.exerciseId === id), 1)[0]).filter(Boolean);
    }
    default:
      return list;
  }
}
