import type { DailyCheckIn, Exercise, FoodEntry, ISODate, MealSlot, PlanAdjustment, ReadinessResult, WeightEntry, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { isPersonalRecord, workingSets, historyFor } from '@/features/training/progression';
import { formatSleep, toISODate } from '@/utils/date';
import { BRAND } from '@/config/brand';
import { readinessLabel } from '@/features/science/insights';
import { sleepMinutesOf } from '@/features/science/recovery';

/**
 * Дневник дня: FORM собирает его сам из уже существующих данных — пользователю не нужно ничего вести.
 * Ручные только заметки.
 */
export type JournalKind = 'checkin' | 'weight' | 'meal' | 'workout_planned' | 'workout_active' | 'workout_done' | 'pr' | 'plan' | 'health' | 'note';

export interface JournalEvent {
  id: string;
  at: number;
  kind: JournalKind;
  title: string;
  sub?: string;
  /** Запланированное, ещё не случившееся */
  planned?: boolean;
  refId?: string;
}

const MEAL: Record<MealSlot, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
const MEAL_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const sameDay = (ts: number, date: ISODate) => toISODate(new Date(ts)) === date;
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function buildJournal(args: {
  date: ISODate;
  checkin?: DailyCheckIn;
  readiness?: ReadinessResult;
  weights: WeightEntry[];
  entries: FoodEntry[];
  sessions: WorkoutSession[];
  active?: WorkoutSession | null;
  adjustments?: PlanAdjustment[];
  notes?: { id: string; date: ISODate; at: number; text: string }[];
  planned?: { name: string; at: number } | null;
  healthSyncAt?: number | null;
  customs?: Exercise[];
}): JournalEvent[] {
  const { date } = args;
  const out: JournalEvent[] = [];

  if (args.checkin && args.checkin.date === date) {
    out.push({ id: `ci-${date}`, at: args.checkin.createdAt || new Date(`${date}T08:00:00`).getTime(), kind: 'checkin', title: 'Чек-ин', sub: args.readiness ? `Готовность: ${readinessLabel(args.readiness).toLowerCase()}` : `Сон ${formatSleep(sleepMinutesOf(args.checkin))}` });
  }
  for (const w of args.weights) if (w.date === date) out.push({ id: `w-${w.id}`, at: w.createdAt || new Date(`${date}T08:30:00`).getTime(), kind: 'weight', title: 'Вес', sub: `${fmt(w.kg)} кг` });

  // Приёмы пищи: одно событие на приём (время первой записи)
  for (const m of MEAL_ORDER) {
    const list = args.entries.filter((e) => e.date === date && e.meal === m);
    if (!list.length) continue;
    const kcal = list.reduce((a, e) => a + e.macros.kcal, 0);
    const protein = list.reduce((a, e) => a + e.macros.protein, 0);
    out.push({ id: `m-${date}-${m}`, at: Math.min(...list.map((e) => e.createdAt)), kind: 'meal', title: MEAL[m], sub: `${Math.round(kcal)} ккал · белок ${Math.round(protein)} г` });
  }

  const done = args.sessions.filter((s) => s.status === 'completed' && s.date === date);
  for (const s of done) {
    const sets = s.exercises.reduce((a, we) => a + workingSets(we.sets).length, 0);
    const min = s.finishedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : undefined;
    out.push({ id: `wd-${s.id}`, at: s.finishedAt ?? s.startedAt, kind: 'workout_done', title: s.name, sub: `${min ? `${min} мин · ` : ''}${sets} рабочих подходов`, refId: s.id });
    // Рекорды этой тренировки (по истории ДО неё)
    const before = args.sessions.filter((x) => x.status === 'completed' && (x.finishedAt ?? x.startedAt) < s.startedAt);
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId, args.customs ?? []);
      if (!ex) continue;
      const hist = historyFor(ex.id, before, 6);
      const best = workingSets(we.sets).filter((x) => isPersonalRecord(ex, x, hist)).sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
      if (best) out.push({ id: `pr-${s.id}-${we.id}`, at: (s.finishedAt ?? s.startedAt) + 1, kind: 'pr', title: 'Новый рекорд', sub: `${ex.name} ${best.weight ? `${fmt(best.weight)} × ${best.reps}` : `${best.reps} повт.`}` });
    }
  }
  if (args.active && args.active.date === date) {
    const n = args.active.exercises.reduce((a, we) => a + we.sets.filter((x) => x.done).length, 0);
    out.push({ id: `wa-${args.active.id}`, at: args.active.startedAt, kind: 'workout_active', title: args.active.name, sub: `идёт · ${n} подх.` });
  } else if (args.planned && !done.length) {
    out.push({ id: `wp-${date}`, at: args.planned.at, kind: 'workout_planned', title: args.planned.name, sub: 'запланировано', planned: true });
  }

  for (const a of args.adjustments ?? []) {
    if (!sameDay(a.createdAt, date) || a.source === 'user') continue;
    out.push({ id: `adj-${a.id}`, at: a.createdAt, kind: 'plan', title: a.source === 'coach' ? `Тренер ${BRAND}` : `${BRAND}`, sub: a.summary });
  }
  if (args.healthSyncAt && sameDay(args.healthSyncAt, date)) out.push({ id: `hs-${date}`, at: args.healthSyncAt, kind: 'health', title: 'Apple Health', sub: 'данные синхронизированы' });
  for (const n of args.notes ?? []) if (n.date === date) out.push({ id: `n-${n.id}`, at: n.at, kind: 'note', title: 'Заметка', sub: n.text, refId: n.id });

  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export type DayMode = 'morning' | 'day' | 'after_workout' | 'evening';

/** Приоритет карточек главной зависит от времени суток и того, была ли тренировка */
export function dayMode(hour: number, workoutDone: boolean): DayMode {
  if (hour >= 19) return 'evening';
  if (workoutDone) return 'after_workout';
  if (hour < 12) return 'morning';
  return 'day';
}
