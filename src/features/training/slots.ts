import type { ID, ISODate, TrainingCycle, WorkoutPlan } from '@/types';
import { addDays, daysBetween, today as todayISO, weekdayIndex } from '@/utils/date';

/**
 * Какой день тренировочный — единая точка для обоих режимов расписания:
 *  • по дням недели: plan.schedule[0=Пн…6=Вс] → id шаблона или null;
 *  • циклом («2 через 1»): on дней тренировок, off дней отдыха, по кругу от anchor, дни недели не важны.
 *    Тренировочные дни цикла нумеруются подряд (0, 1, 2…), шаблон — rotation[n mod длина]:
 *    при «2 через 1» и Верх/Низ: Верх А, Низ А, отдых, Верх Б, Низ Б, отдых…
 * Фактический шаблон дня всё равно берётся по ротации от последней выполненной (plannedTemplateFor):
 * пропуск не «съедает» тренировку.
 */
export type SlotPlan = Pick<WorkoutPlan, 'schedule' | 'rotation' | 'cycle'>;

/** Варианты цикла для выбора (onboarding, профиль) */
export const CYCLES: { on: number; off: number; label: string; hint: string }[] = [
  { on: 1, off: 1, label: '1 через 1', hint: 'день тренировка, день отдых' },
  { on: 2, off: 1, label: '2 через 1', hint: '2 дня тренировки, 1 день отдыха' },
  { on: 3, off: 1, label: '3 через 1', hint: '3 дня тренировки, 1 день отдыха' },
];

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function cycleLabel(c: Pick<TrainingCycle, 'on' | 'off'>): string {
  return `${c.on} через ${c.off}`;
}

/** Тренировок в неделю в среднем: «2 через 1» → 4,67 */
export function cycleDaysPerWeek(c: Pick<TrainingCycle, 'on' | 'off'>): number {
  return (7 * c.on) / (c.on + c.off);
}

/** Целое «дней в неделю» для подбора сплита и расчёта расхода (2–6) */
export function cycleWeeklyCount(c: Pick<TrainingCycle, 'on' | 'off'>): number {
  return Math.min(6, Math.max(2, Math.round(cycleDaysPerWeek(c))));
}

export function isValidCycle(c: TrainingCycle | null | undefined): c is TrainingCycle {
  return !!c && Number.isInteger(c.on) && Number.isInteger(c.off) && c.on >= 1 && c.on <= 6 && c.off >= 1 && c.off <= 3 && /^\d{4}-\d{2}-\d{2}$/.test(c.anchor);
}

/** Позиция дня в цикле: 0…on-1 — тренировка, дальше — отдых; n — номер тренировочного дня от anchor */
export function cyclePosition(c: TrainingCycle, date: ISODate): { pos: number; training: boolean; n: number } {
  const len = c.on + c.off;
  const k = daysBetween(c.anchor, date);
  const pos = mod(k, len);
  return { pos, training: pos < c.on, n: Math.floor(k / len) * c.on + Math.min(pos, c.on - 1) };
}

/** Шаблон дня по расписанию (без учёта пропусков) или null — день отдыха */
export function slotTemplateId(plan: SlotPlan, date: ISODate): ID | null {
  const c = plan.cycle;
  if (isValidCycle(c)) {
    const { training, n } = cyclePosition(c, date);
    if (!training || !plan.rotation.length) return null;
    return plan.rotation[mod(n, plan.rotation.length)];
  }
  return plan.schedule[weekdayIndex(date)] ?? null;
}

export function isTrainingSlot(plan: SlotPlan, date: ISODate): boolean {
  return !!slotTemplateId(plan, date);
}

/** Тренировок в неделю по плану (для объёма: сколько раз в неделю выполняется каждый шаблон) */
export function plannedPerWeek(plan: SlotPlan): number {
  return isValidCycle(plan.cycle) ? cycleDaysPerWeek(plan.cycle) : plan.schedule.filter(Boolean).length;
}

/** Ближайшие тренировочные дни по расписанию, начиная с from (включительно) */
export function nextSlots(plan: SlotPlan, from: ISODate, count: number, horizon = 60): { date: ISODate; templateId: ID }[] {
  const out: { date: ISODate; templateId: ID }[] = [];
  for (let i = 0; i < horizon && out.length < count; i++) {
    const d = addDays(from, i);
    const id = slotTemplateId(plan, d);
    if (id) out.push({ date: d, templateId: id });
  }
  return out;
}

/** «2 через 1» или «4× в неделю» — подпись расписания */
export function scheduleLabel(plan: Pick<WorkoutPlan, 'daysPerWeek' | 'cycle'>): string {
  return isValidCycle(plan.cycle) ? cycleLabel(plan.cycle) : `${plan.daysPerWeek}× в неделю`;
}

/** Новый цикл от сегодняшнего дня (сегодня — первый день тренировок) */
export function newCycle(on: number, off: number, anchor: ISODate = todayISO()): TrainingCycle {
  return { on, off, anchor };
}
