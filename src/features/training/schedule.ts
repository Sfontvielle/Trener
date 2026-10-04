import type { DayOverride, Exercise, ISODate, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '@/types';
import { getExercise } from '@/data/exercises';
import { addDays, weekdayIndex } from '@/utils/date';
import { plannedTemplateFor } from './today';

/**
 * Перенос пропущенной тренировки. Программа — ПОСЛЕДОВАТЕЛЬНОСТЬ (Верх A → Низ A → Верх B → …):
 * пропуск не «съедает» тренировку и не проваливает неделю — она переезжает, порядок сохраняется
 * (это уже делает ротация в plannedTemplateFor). Здесь — предложение и детерминированный пересчёт:
 *  • вечером (≥19:00), если сегодняшняя тренировка не сделана → «Перенести на завтра?»;
 *  • утром, если вчерашняя пропущена, а сегодня по расписанию отдых → «Сделать сегодня?»;
 *  • после переноса: если следующая по ротации тренировка нагружает те же мышцы (пересечение ≥50%)
 *    и попадает на следующий день — ставим между ними день отдыха (ЭВРИСТИКА: ~48 ч на группу мышц).
 */
export interface ShiftProposal {
  kind: 'tomorrow' | 'today';
  template: WorkoutTemplate;
  text: string;
  action: string;
  overrides: DayOverride[];
}

const isSlot = (plan: WorkoutPlan, d: ISODate) => !!plan.schedule[weekdayIndex(d)];
const doneOn = (sessions: WorkoutSession[], d: ISODate) => sessions.some((s) => s.status === 'completed' && s.date === d);

function muscles(t: WorkoutTemplate, customs: Exercise[]): Set<string> {
  return new Set(t.exercises.flatMap((pe) => getExercise(pe.exerciseId, customs)?.groups.primary ?? []));
}

/** Доля общих основных мышц (Жаккар) */
export function muscleOverlap(a: WorkoutTemplate, b: WorkoutTemplate, customs: Exercise[] = []): number {
  const A = muscles(a, customs);
  const B = muscles(b, customs);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / new Set([...A, ...B]).size;
}

function nextInRotation(plan: WorkoutPlan, t: WorkoutTemplate): WorkoutTemplate | undefined {
  const i = plan.rotation.indexOf(t.id);
  if (i < 0) return undefined;
  return plan.templates.find((x) => x.id === plan.rotation[(i + 1) % plan.rotation.length]);
}

/** Если на день после переноса выпадает тренировка на те же мышцы — вставляем отдых */
function spacing(plan: WorkoutPlan, moved: WorkoutTemplate, movedTo: ISODate, overrides: Record<string, DayOverride>, customs: Exercise[]): DayOverride[] {
  const after = addDays(movedTo, 1);
  const next = nextInRotation(plan, moved);
  if (!next || !isSlot(plan, after) || overrides[after]) return [];
  if (muscleOverlap(moved, next, customs) < 0.5) return [];
  return [{ date: after, mode: 'rest', templateId: null, reason: `Отдых после переноса «${moved.name}»: те же мышцы два дня подряд`, source: 'user', createdAt: Date.now() }];
}

export function missedWorkoutProposal(a: { date: ISODate; hour: number; plan: WorkoutPlan | null; sessions: WorkoutSession[]; overrides: Record<string, DayOverride>; customs?: Exercise[] }): ShiftProposal | null {
  const { date, plan, sessions, overrides } = a;
  const customs = a.customs ?? [];
  if (!plan) return null;
  const active = sessions.some((s) => s.status === 'active' && s.date === date);
  if (active || doneOn(sessions, date)) return null;
  const todayOv = overrides[date];

  // Вечер: сегодняшняя тренировка не сделана
  if (a.hour >= 19 && isSlot(plan, date) && !(todayOv && (todayOv.mode === 'rest' || todayOv.templateId === null))) {
    const t = todayOv?.templateId ? plan.templates.find((x) => x.id === todayOv.templateId) : plannedTemplateFor(date, plan, sessions);
    if (!t) return null;
    const tomorrow = addDays(date, 1);
    const ov: DayOverride[] = [{ date, mode: 'rest', templateId: null, reason: `«${t.name}» перенесена на завтра`, source: 'user', createdAt: Date.now() }];
    // Завтра по расписанию отдых → ставим перенесённую; если тренировка — ротация и так даст именно её
    if (!isSlot(plan, tomorrow) || overrides[tomorrow]?.mode === 'rest') ov.push({ date: tomorrow, templateId: t.id, mode: 'normal', reason: `Перенесено с ${date}`, source: 'user', createdAt: Date.now() });
    ov.push(...spacing(plan, t, tomorrow, overrides, customs));
    return { kind: 'tomorrow', template: t, text: `Сегодня пропущена «${t.name}». Перенести её на завтра?`, action: 'Перенести на завтра', overrides: ov };
  }

  // Утро: вчера пропуск, сегодня по расписанию отдых
  const y = addDays(date, -1);
  const yOv = overrides[y];
  if (isSlot(plan, y) && !doneOn(sessions, y) && !(yOv && (yOv.mode === 'rest' || yOv.templateId === null)) && !isSlot(plan, date) && !todayOv) {
    const t = yOv?.templateId ? plan.templates.find((x) => x.id === yOv.templateId) : plannedTemplateFor(y, plan, sessions);
    if (!t) return null;
    const ov: DayOverride[] = [{ date, templateId: t.id, mode: 'normal', reason: `Перенесено со вчера (${y})`, source: 'user', createdAt: Date.now() }, ...spacing(plan, t, date, overrides, customs)];
    return { kind: 'today', template: t, text: `Вчера пропущена «${t.name}». Сделать её сегодня? Последовательность программы сохранится.`, action: 'Сделать сегодня', overrides: ov };
  }
  return null;
}
