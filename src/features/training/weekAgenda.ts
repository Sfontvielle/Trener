import type { DayOverride, ISODate, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '@/types';
import { addDays, startOfWeek, weekdayIndex } from '@/utils/date';
import { plannedTemplateFor } from './today';

/**
 * Неделя тренировок одним списком: что сделано, что сегодня, что впереди и что пропущено.
 * Будущие дни продолжают ротацию плана (Верх А → Низ А → Верх Б…) от сегодняшней или последней тренировки,
 * перенос/отмена дня (override) учитываются. Дни отдыха не показываются, кроме сегодняшнего.
 */
export type AgendaStatus = 'done' | 'today' | 'planned' | 'missed' | 'rest';

export interface AgendaDay {
  date: ISODate;
  status: AgendaStatus;
  template?: WorkoutTemplate;
  session?: WorkoutSession;
}

export function weekAgenda(args: { today: ISODate; plan: WorkoutPlan | null; sessions: WorkoutSession[]; overrides?: Record<ISODate, DayOverride | undefined> }): AgendaDay[] {
  const { today, plan, sessions } = args;
  const overrides = args.overrides ?? {};
  const from = startOfWeek(today);
  const done = sessions.filter((s) => s.status === 'completed');
  const out: AgendaDay[] = [];
  const byId = (id?: string | null) => (id ? plan?.templates.find((t) => t.id === id) : undefined);
  // Последний шаблон ротации — от него считаются будущие дни
  let last: string | undefined;

  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i);
    const s = done.filter((x) => x.date === date).sort((a, b) => b.startedAt - a.startedAt)[0];
    const ov = overrides[date];
    const scheduled = plan ? !!plan.schedule[weekdayIndex(date)] : false;
    if (s) {
      out.push({ date, status: 'done', session: s, template: byId(s.templateId) });
      if (s.source === 'plan' && s.templateId) last = s.templateId;
      continue;
    }
    if (!plan) {
      if (date === today) out.push({ date, status: 'rest' });
      continue;
    }
    const explicit = ov && ov.templateId !== undefined ? byId(ov.templateId) : undefined;
    const restByOverride = ov?.mode === 'rest' || (ov?.templateId !== undefined && !ov.templateId);
    if (date < today) {
      if (!restByOverride && (explicit || scheduled)) out.push({ date, status: 'missed', template: explicit ?? byId(plan.schedule[weekdayIndex(date)]) });
      continue;
    }
    if (date === today) {
      const t = restByOverride ? undefined : (explicit ?? plannedTemplateFor(date, plan, sessions));
      out.push(t ? { date, status: 'today', template: t } : { date, status: 'rest' });
      if (t) last = t.id;
      else if (!last) last = lastPlanned(done, date);
      continue;
    }
    if (restByOverride) continue;
    if (explicit) {
      out.push({ date, status: 'planned', template: explicit });
      last = explicit.id;
      continue;
    }
    if (!scheduled) continue;
    if (!last) last = lastPlanned(done, date);
    const rot = plan.rotation;
    const nextId = last && rot.includes(last) ? rot[(rot.indexOf(last) + 1) % rot.length] : plan.schedule[weekdayIndex(date)];
    const t = byId(nextId) ?? byId(plan.schedule[weekdayIndex(date)]);
    if (t) {
      out.push({ date, status: 'planned', template: t });
      last = t.id;
    }
  }
  return out;
}

function lastPlanned(done: WorkoutSession[], before: ISODate): string | undefined {
  return done.filter((s) => s.source === 'plan' && s.templateId && s.date < before).sort((a, b) => b.startedAt - a.startedAt)[0]?.templateId;
}

/** «2 из 4» — сделано плановых дней этой недели из запланированных (пропущенные тоже считаются в плане) */
export function agendaProgress(days: AgendaDay[]): { done: number; planned: number } {
  const training = days.filter((d) => d.status !== 'rest');
  return { done: training.filter((d) => d.status === 'done').length, planned: training.length };
}
