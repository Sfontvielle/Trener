import type { DayOverride, ISODate, ReadinessResult, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '@/types';
import { addDays, weekdayIndex } from '@/utils/date';
import { estimateMinutes } from './planGenerator';

export interface TodayWorkout {
  kind: 'workout' | 'rest' | 'done' | 'no_plan';
  template?: WorkoutTemplate;
  /** Итоговый множитель объёма (readiness + override) */
  volumeFactor: number;
  rirDelta: number;
  mode: NonNullable<DayOverride['mode']>;
  estMinutes: number;
  totalSets: number;
  reason?: string;
  override?: DayOverride;
  completedSession?: WorkoutSession;
  nextWorkout?: { date: ISODate; template: WorkoutTemplate };
}

/**
 * Какой шаблон по плану сегодня.
 * Если день тренировочный — берём следующий по ротации после последней выполненной плановой тренировки,
 * чтобы пропуск не «съедал» тренировку (Pull не выпадет, если пропустил вторник).
 */
export function plannedTemplateFor(date: ISODate, plan: WorkoutPlan, sessions: WorkoutSession[]): WorkoutTemplate | undefined {
  if (!plan.schedule[weekdayIndex(date)]) return undefined;
  const lastPlan = sessions
    .filter((s) => s.status === 'completed' && s.source === 'plan' && s.templateId && s.date < date)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  const rot = plan.rotation;
  if (lastPlan?.templateId && rot.includes(lastPlan.templateId)) {
    const idx = rot.indexOf(lastPlan.templateId);
    return plan.templates.find((t) => t.id === rot[(idx + 1) % rot.length]);
  }
  const id = plan.schedule[weekdayIndex(date)];
  return plan.templates.find((t) => t.id === id);
}

export function resolveToday(args: {
  date: ISODate;
  plan: WorkoutPlan | null;
  sessions: WorkoutSession[];
  override?: DayOverride;
  readiness?: ReadinessResult;
}): TodayWorkout {
  const { date, plan, sessions, override, readiness } = args;
  const doneToday = sessions.filter((s) => s.status === 'completed' && s.date === date).sort((a, b) => b.startedAt - a.startedAt)[0];
  const base = { volumeFactor: 1, rirDelta: 0, mode: 'normal' as const, estMinutes: 0, totalSets: 0 };
  if (!plan) return { ...base, kind: 'no_plan' };

  const next = findNext(date, plan, sessions);
  if (doneToday) return { ...base, kind: 'done', completedSession: doneToday, nextWorkout: next };

  let template: WorkoutTemplate | undefined;
  if (override && override.templateId !== undefined) {
    template = override.templateId ? plan.templates.find((t) => t.id === override.templateId) : undefined;
  } else {
    template = plannedTemplateFor(date, plan, sessions);
  }
  // Тренер/пользователь изменил состав тренировки только на сегодня
  if (template && override?.exercises?.length) template = { ...template, exercises: override.exercises, estMinutes: estimateMinutes(override.exercises) };
  if (!template || override?.mode === 'rest') {
    return { ...base, kind: 'rest', override, reason: override?.reason, nextWorkout: next };
  }

  // Override задаёт режим явно; иначе — из readiness
  let volumeFactor = readiness?.volumeFactor ?? 1;
  let rirDelta = readiness?.rirDelta ?? 0;
  let mode: TodayWorkout['mode'] =
    readiness?.band === 'reduce' ? 'reduced' : readiness?.band === 'light' ? 'light' : readiness?.band === 'recover' ? 'recovery' : 'normal';
  let reason = readiness && readiness.band !== 'go' ? readiness.headline : undefined;
  if (override) {
    if (override.volumeFactor !== undefined) volumeFactor = override.volumeFactor;
    if (override.rirDelta !== undefined) rirDelta = override.rirDelta;
    if (override.mode) mode = override.mode;
    reason = override.reason;
  }

  const scaled = template.exercises.map((e) => ({ ...e, sets: Math.max(1, Math.round(e.sets * volumeFactor)) }));
  const totalSets = scaled.reduce((a, e) => a + e.sets, 0);
  return {
    kind: 'workout',
    template,
    volumeFactor,
    rirDelta,
    mode,
    estMinutes: estimateMinutes(scaled),
    totalSets,
    reason,
    override,
    nextWorkout: next,
  };
}

function findNext(date: ISODate, plan: WorkoutPlan, sessions: WorkoutSession[]): { date: ISODate; template: WorkoutTemplate } | undefined {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, i);
    const t = plannedTemplateFor(d, plan, sessions);
    if (t) return { date: d, template: t };
  }
  return undefined;
}

export const MODE_LABEL: Record<TodayWorkout['mode'], string> = {
  normal: 'По плану',
  reduced: '−15% объёма',
  light: 'Облегчённая',
  recovery: 'Восстановительная',
  rest: 'Отдых',
  deload: 'Разгрузка',
};
