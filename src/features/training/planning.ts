import type { ISODate, PlannedWorkout, UserTemplate, WorkoutDraft, WorkoutSession, WorkoutTemplate } from '@/types';
import { useSchedule } from '@/stores/schedule';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { scheduleOverride } from './hub';
import { repeatPlanned } from './journal';
import { startDraft, startTodayPlanned } from './actions';
import { today } from '@/utils/date';
import { uid } from '@/utils/id';

/**
 * Планирование любых тренировок (меню «+», шаблоны, карточка прошлой тренировки) и действия с запланированными.
 * Тренировка программы на дату ещё и ставится DayOverride — «Сегодня», календарь недели и напоминания видят её
 * как раньше; перенос/пропуск/удаление снимают только этот, поставленный вручную, override.
 */

const MANUAL = scheduleOverride('', '').reason;

function syncOverride(p: Pick<PlannedWorkout, 'source' | 'templateId' | 'date'>, on: boolean) {
  if (p.source !== 'plan' || !p.templateId) return;
  const ps = usePlan.getState();
  if (on) ps.setOverride(scheduleOverride(p.date, p.templateId));
  else {
    const o = ps.overrides[p.date];
    if (o && o.reason === MANUAL && o.templateId === p.templateId) ps.clearOverride(p.date);
  }
}

export function planProgramDay(date: ISODate, t: WorkoutTemplate): PlannedWorkout {
  const p = useSchedule.getState().plan({ date, name: t.name, source: 'plan', templateId: t.id, exercises: t.exercises });
  syncOverride(p, true);
  return p;
}

export function planUserTemplate(date: ISODate, t: UserTemplate): PlannedWorkout {
  return useSchedule.getState().plan({ date, name: t.name, source: 'template', templateId: t.id, exercises: t.exercises, color: t.color });
}

/** Повтор прошлой: состав снимком (те же подходы, диапазоны, суперсеты), исходная тренировка не меняется */
export function planRepeat(date: ISODate, s: WorkoutSession): PlannedWorkout | null {
  const exercises = repeatPlanned(s);
  if (!exercises.length) return null;
  return useSchedule.getState().plan({ date, name: s.name, source: 'repeat', fromSessionId: s.id, exercises, color: s.color });
}

export function planDraft(date: ISODate, d: WorkoutDraft): PlannedWorkout | null {
  if (!d.exercises.length) return null;
  return useSchedule.getState().plan({ date, name: d.name, source: 'custom', exercises: d.exercises, color: d.color });
}

export function movePlanned(p: PlannedWorkout, date: ISODate) {
  syncOverride(p, false);
  useSchedule.getState().move(p.id, date);
  syncOverride({ ...p, date }, true);
}

export function skipPlanned(p: PlannedWorkout) {
  syncOverride(p, false);
  useSchedule.getState().skip(p.id);
}

export function restorePlanned(p: PlannedWorkout) {
  useSchedule.getState().restore(p.id);
  if (p.date >= today()) syncOverride(p, true);
}

export function removePlanned(p: PlannedWorkout) {
  syncOverride(p, false);
  useSchedule.getState().remove(p.id);
}

/**
 * Начать запланированную. Тренировка программы на сегодня — обычным стартом (готовность, изменения дня);
 * остальное — как черновик со снимком упражнений. Сессия помнит plannedId и закроет план по завершении.
 */
export function startPlanned(p: PlannedWorkout) {
  const tpl = p.source === 'plan' ? usePlan.getState().plan?.templates.find((t) => t.id === p.templateId) : undefined;
  if (tpl && p.date === today()) return startTodayPlanned(tpl, p.id);
  startDraft({ id: uid('d_'), name: p.name, focus: tpl?.focus ?? '', source: tpl ? 'plan' : 'custom', templateId: p.templateId, exercises: tpl?.exercises ?? p.exercises, createdAt: Date.now(), color: p.color, plannedId: p.id });
}

/** Завершение активной тренировки: сохранить в историю и отметить выполненной подходящую запланированную */
export function finishWorkout(patch: Partial<WorkoutSession> = {}): WorkoutSession | null {
  const s = useWorkouts.getState().finish(patch);
  if (s) useSchedule.getState().completeWith(s, s.plannedId);
  return s;
}

/** Начать свой шаблон сейчас: новая сессия со снимком упражнений шаблона (шаблон не меняется) */
export function startUserTemplate(t: UserTemplate) {
  startDraft({ id: uid('d_'), name: t.name, focus: '', source: 'custom', templateId: t.id, exercises: t.exercises, createdAt: Date.now(), color: t.color });
}
