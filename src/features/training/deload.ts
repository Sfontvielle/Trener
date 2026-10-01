import type { DailyCheckIn, ISODate, PlanAdjustment, WorkoutPlan, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { addDays, daysBetween, today, weekdayIndex } from '@/utils/date';
import { e1rm, historyFor } from './progression';

/**
 * Автоматическое обнаружение необходимости разгрузки.
 * Сигналы: застой e1RM в нескольких базовых упражнениях, накопленная усталость (готовность),
 * тяжесть сессий (RPE/отказ), много недель подряд без разгрузки. Один плохой день — не повод:
 * нужно ≥2 разных сигнала либо явный застой в ≥2 упражнениях.
 */
export interface DeloadCheck {
  suggest: boolean;
  reasons: string[];
  weeksTrained: number;
  stalled: string[];
}

export const DELOAD_FACTOR = 0.6;
export const DELOAD_RIR = 2;

function lastDeloadDate(adjustments: PlanAdjustment[]): ISODate | undefined {
  const a = adjustments.filter((x) => x.kind === 'deload').sort((x, y) => y.createdAt - x.createdAt)[0];
  if (!a) return undefined;
  const d = new Date(a.createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function checkDeload(args: {
  plan: WorkoutPlan | null;
  sessions: WorkoutSession[];
  checkins: Record<string, DailyCheckIn>;
  adjustments: PlanAdjustment[];
  overrides: Record<string, { mode?: string }>;
  ref?: ISODate;
}): DeloadCheck {
  const ref = args.ref ?? today();
  const none: DeloadCheck = { suggest: false, reasons: [], weeksTrained: 0, stalled: [] };
  if (!args.plan) return none;
  // Уже идёт разгрузка
  for (let i = 0; i < 7; i++) if (args.overrides[addDays(ref, i)]?.mode === 'deload') return none;

  const since = lastDeloadDate(args.adjustments);
  const done = args.sessions.filter((s) => s.status === 'completed' && (!since || s.date > since));
  if (done.length < 6) return none;

  // Недели с тренировками подряд (с последней разгрузки)
  const first = done.reduce((m, s) => (s.date < m ? s.date : m), ref);
  const weeksTrained = Math.floor(daysBetween(first, ref) / 7);

  // Застой в базовых: последние 3 тренировки не превзошли лучший e1RM до них
  const mains = new Set(args.plan.templates.map((t) => t.exercises[0]?.exerciseId).filter(Boolean) as string[]);
  const stalled: string[] = [];
  for (const id of mains) {
    const h = historyFor(id, done, 8);
    if (h.length < 5) continue;
    const best = (sets: typeof h[number]['sets']) => Math.max(...sets.map((x) => e1rm(x.weight, x.reps)));
    const recent = Math.max(...h.slice(0, 3).map((x) => best(x.sets)));
    const before = Math.max(...h.slice(3).map((x) => best(x.sets)));
    if (recent > 0 && recent <= before * 1.005) stalled.push(getExercise(id)?.name ?? id);
  }

  // Усталость: средняя готовность за 7 дней
  const recentCheckins = Object.values(args.checkins).filter((c) => c.date > addDays(ref, -7) && c.date <= ref);
  const avgSore = recentCheckins.length ? recentCheckins.reduce((a, c) => a + c.soreness + (6 - c.energy), 0) / recentCheckins.length : 0;
  const fatigued = recentCheckins.length >= 4 && avgSore >= 7;

  // Тяжесть сессий: RPE ≥ 9 в 3+ из последних 5 тренировок или частые «тяжело/до отказа» в подходах
  const last5 = [...done].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);
  const hardRpe = last5.filter((s) => (s.sessionRpe ?? 0) >= 9).length;
  const sets5 = last5.flatMap((s) => s.exercises.flatMap((we) => we.sets.filter((x) => x.done && !x.warmup)));
  const grind = sets5.length >= 20 && sets5.filter((x) => x.feel === 'hard' || (x.rir !== undefined && x.rir <= 0)).length / sets5.length >= 0.5;
  const strained = hardRpe >= 3 || grind;

  const reasons: string[] = [];
  if (strained) reasons.push(hardRpe >= 3 ? `${hardRpe} из 5 последних тренировок с RPE 9–10` : 'Больше половины подходов — до отказа или «тяжело»');
  if (stalled.length) reasons.push(`Нет прироста в ${stalled.length === 1 ? 'упражнении' : 'упражнениях'}: ${stalled.slice(0, 3).join(', ')}`);
  if (fatigued) reasons.push('Неделю подряд высокая усталость и мало энергии по чек-инам');
  if (weeksTrained >= 6) reasons.push(`${weeksTrained} нед. тренировок без разгрузки`);

  const signals = (stalled.length ? 1 : 0) + (fatigued ? 1 : 0) + (weeksTrained >= 6 ? 1 : 0) + (strained ? 1 : 0);
  const suggest = stalled.length >= 2 || signals >= 2 || weeksTrained >= 8;
  return { suggest, reasons, weeksTrained, stalled };
}

/** Даты тренировок по плану на ближайшие 7 дней — их и облегчает разгрузка */
export function deloadDates(plan: WorkoutPlan, ref: ISODate = today()): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ref, i);
    if (plan.schedule[weekdayIndex(d)]) out.push(d);
  }
  return out;
}

export function isDeloadActive(overrides: Record<string, { mode?: string }>, ref: ISODate = today()): boolean {
  for (let i = 0; i < 7; i++) if (overrides[addDays(ref, i)]?.mode === 'deload') return true;
  return false;
}
