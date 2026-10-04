import type { BodyMetric, DailyCheckIn, Exercise, FoodEntry, ISODate, MealSlot, WorkoutPlan, WeightEntry, WorkoutSession } from '@/types';
import type { HealthDay } from '@/features/health/model';
import { getExercise } from '@/data/exercises';
import { historyFor, isPersonalRecord, workingSets } from '@/features/training/progression';
import { sumFiber, sumMacros } from '@/features/nutrition/status';
import { sleepMinutesOf } from '@/features/science/recovery';
import { weekdayIndex } from '@/utils/date';

/**
 * Сводка одного дня — общая модель для Главной, календаря тренировок, истории и прогресса.
 * Чистая функция над уже сохранёнными данными: ничего не дублирует и не хранит отдельно.
 */
export interface DaySetRow {
  weight: number;
  reps: number;
  rir?: number;
  feel?: string;
  pr: boolean;
}

export interface DayWorkout {
  id: string;
  name: string;
  minutes?: number;
  workingSets: number;
  volumeKg: number;
  prs: number;
  exercises: { id: string; name: string; sets: DaySetRow[] }[];
}

export interface DayMeal {
  slot: MealSlot;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number | null;
  fiberComplete: boolean;
  items: { name: string; grams: number; kcal: number }[];
}

export interface DaySummary {
  date: ISODate;
  workouts: DayWorkout[];
  nutrition: { kcal: number; protein: number; fat: number; carbs: number; fiber: number | null; fiberComplete: boolean; meals: DayMeal[] } | null;
  checkin: { sleepMinutes: number; sleepSource?: 'manual' | 'health'; sleepQuality: number; energy: number; stress: number; soreness: number; pain: boolean } | null;
  health: { steps?: number; restingHr?: number; hrvMs?: number; sleepMinutes?: number; activeKcal?: number } | null;
  weightKg: number | null;
  measurements: { kind: BodyMetric['kind']; value: number }[];
  /** По плану: день отдыха (нет тренировки в расписании) */
  plannedRest: boolean;
  plannedName?: string;
  hasRecord: boolean;
  hasAny: boolean;
}

export interface DaySources {
  sessions: WorkoutSession[];
  entries: FoodEntry[];
  checkins: Record<string, DailyCheckIn>;
  health?: Record<string, HealthDay>;
  weights: WeightEntry[];
  metrics: BodyMetric[];
  plan?: WorkoutPlan | null;
  customs?: Exercise[];
}

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildDaySummary(date: ISODate, src: DaySources): DaySummary {
  const done = src.sessions.filter((s) => s.status === 'completed');
  const workouts: DayWorkout[] = done
    .filter((s) => s.date === date)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const before = done.filter((x) => (x.finishedAt ?? x.startedAt) < s.startedAt);
      let prs = 0;
      let volume = 0;
      let sets = 0;
      const exercises = s.exercises
        .map((we) => {
          const ex = getExercise(we.exerciseId, src.customs ?? []);
          const hist = ex ? historyFor(ex.id, before, 6) : [];
          const rows = workingSets(we.sets).map((x) => {
            const pr = !!ex && isPersonalRecord(ex, x, hist);
            if (pr) prs++;
            volume += x.weight * x.reps;
            sets++;
            return { weight: x.weight, reps: x.reps, rir: x.rir, feel: x.feel, pr };
          });
          return { id: we.id, name: ex?.name ?? we.exerciseId, sets: rows };
        })
        .filter((e) => e.sets.length);
      return { id: s.id, name: s.name, minutes: s.finishedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : undefined, workingSets: sets, volumeKg: Math.round(volume), prs, exercises };
    });

  const dayEntries = src.entries.filter((e) => e.date === date);
  let nutrition: DaySummary['nutrition'] = null;
  if (dayEntries.length) {
    const tot = sumMacros(dayEntries);
    const fib = sumFiber(dayEntries);
    const meals: DayMeal[] = MEALS.map((slot) => {
      const list = dayEntries.filter((e) => e.meal === slot);
      const m = sumMacros(list);
      const f = sumFiber(list);
      return { slot, kcal: Math.round(m.kcal), protein: r1(m.protein), fat: r1(m.fat), carbs: r1(m.carbs), fiber: f.g, fiberComplete: f.complete, items: list.map((e) => ({ name: e.name, grams: e.grams, kcal: Math.round(e.macros.kcal) })) };
    }).filter((m) => m.items.length);
    nutrition = { kcal: Math.round(tot.kcal), protein: r1(tot.protein), fat: r1(tot.fat), carbs: r1(tot.carbs), fiber: fib.g, fiberComplete: fib.complete, meals };
  }

  const c = src.checkins[date];
  const checkin: DaySummary['checkin'] = c ? { sleepMinutes: sleepMinutesOf(c), sleepSource: c.sleepSource, sleepQuality: c.sleepQuality, energy: c.energy, stress: c.stress, soreness: c.soreness, pain: c.pain } : null;
  const h = src.health?.[date];
  const health: DaySummary['health'] =
    h && (h.steps || h.restingHr || h.hrvMs || h.sleepHours || h.activeKcal) ? { steps: h.steps, restingHr: h.restingHr, hrvMs: h.hrvMs, sleepMinutes: h.sleepHours ? Math.round(h.sleepHours * 60) : undefined, activeKcal: h.activeKcal } : null;

  const w = src.weights.filter((x) => x.date === date).sort((a, b) => b.createdAt - a.createdAt)[0];
  // Последний замер каждого вида за этот день
  const measurements: DaySummary['measurements'] = [];
  for (const m of src.metrics.filter((x) => x.date === date)) {
    const i = measurements.findIndex((x) => x.kind === m.kind);
    if (i >= 0) measurements[i] = { kind: m.kind, value: m.value };
    else measurements.push({ kind: m.kind, value: m.value });
  }

  const tplId = src.plan?.schedule[weekdayIndex(date)] ?? null;
  const plannedName = tplId ? src.plan?.templates.find((t) => t.id === tplId)?.name : undefined;
  const hasRecord = workouts.some((x) => x.prs > 0);
  return {
    date,
    workouts,
    nutrition,
    checkin,
    health,
    weightKg: w ? w.kg : null,
    measurements,
    plannedRest: !!src.plan && !tplId,
    plannedName,
    hasRecord,
    hasAny: !!(workouts.length || nutrition || checkin || health || w || measurements.length),
  };
}

export type DayMarker = { trained: boolean; record: boolean; rest: boolean; data: boolean };

/** Лёгкие маркеры для календаря (без полного разбора подходов, кроме дней с тренировкой) */
export function dayMarkers(dates: ISODate[], src: DaySources): Record<ISODate, DayMarker> {
  const out: Record<ISODate, DayMarker> = {};
  const trainedDays = new Set(src.sessions.filter((s) => s.status === 'completed').map((s) => s.date));
  const dataDays = new Set<string>([...src.entries.map((e) => e.date), ...Object.keys(src.checkins), ...src.weights.map((w) => w.date), ...src.metrics.map((m) => m.date)]);
  for (const d of dates) {
    const trained = trainedDays.has(d);
    out[d] = {
      trained,
      record: trained ? buildDaySummary(d, src).hasRecord : false,
      rest: !trained && !!src.plan && !src.plan.schedule[weekdayIndex(d)],
      data: trained || dataDays.has(d),
    };
  }
  return out;
}
