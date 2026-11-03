import type { FoodEntry, ISODate, Macros, NutritionTarget, WeightEntry } from '@/types';
import { addDays, daysBetween } from '@/utils/date';
import { weightTrend } from '@/features/progress/weightTrend';

/**
 * Аналитика питания за 7 / 30 / 90 дней (NUTRITION_SPEC.md §11). Чистые функции — scripts/nutrition-test.ts.
 *
 * Правила:
 *  • день учтён, если в нём записано ≥ 2 приёмов пищи или ≥ 800 ккал; остальные дни в средние не входят —
 *    их число показывается, чтобы человек видел, на чём основаны цифры;
 *  • сегодняшний день не закончен и в средние не входит (в графике виден);
 *  • связь с весом — только при ≥ 14 учтённых днях и ≥ 4 взвешиваниях в периоде; иначе «недостаточно данных»
 *    с тем, чего не хватает. Без процентов «точности».
 */

export const COUNTED_MIN_MEALS = 2;
export const COUNTED_MIN_KCAL = 800;
export const LINK_MIN_DAYS = 14;
export const LINK_MIN_WEIGHINS = 4;

export function isCountedDay(dayEntries: Pick<FoodEntry, 'meal' | 'macros'>[]): boolean {
  if (!dayEntries.length) return false;
  const meals = new Set(dayEntries.map((e) => e.meal)).size;
  const kcal = dayEntries.reduce((a, e) => a + e.macros.kcal, 0);
  return meals >= COUNTED_MIN_MEALS || kcal >= COUNTED_MIN_KCAL;
}

export interface NutritionPeriod {
  days: number;
  from: ISODate;
  to: ISODate;
  /** Учтённые дни (входят в средние) */
  counted: number;
  /** Дни с любыми записями */
  logged: number;
  /** Средние по учтённым дням; null — учтённых нет */
  avg: (Omit<Macros, 'fiber'> & { fiber: number | null }) | null;
  /** Доля цели, 0…∞ */
  pct: { kcal: number; protein: number; fat: number; carbs: number } | null;
  /** Ккал по дням периода (сегодня включительно); null — день без записей; counted — входит в средние */
  perDay: { date: ISODate; kcal: number | null; counted: boolean }[];
  weight: WeightLink;
}

export type WeightLink =
  | { ok: true; avgKcalDelta: number; kgPerWeek: number; weighIns: number }
  | { ok: false; needDays: number; needWeighIns: number };

export function nutritionPeriod(args: { entries: FoodEntry[]; target: NutritionTarget | null; weights: WeightEntry[]; days: 7 | 30 | 90; today: ISODate }): NutritionPeriod {
  const { days, today } = args;
  const from = addDays(today, -(days - 1));
  const byDay = new Map<ISODate, FoodEntry[]>();
  for (const e of args.entries) if (e.date >= from && e.date <= today) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const perDay: NutritionPeriod['perDay'] = [];
  const counted: FoodEntry[][] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const list = byDay.get(d) ?? [];
    const ok = d !== today && isCountedDay(list);
    if (ok) counted.push(list);
    perDay.push({ date: d, kcal: list.length ? Math.round(list.reduce((a, e) => a + e.macros.kcal, 0)) : null, counted: ok });
  }
  const sum = (k: keyof Macros) => counted.reduce((a, l) => a + l.reduce((b, e) => b + (e.macros[k] ?? 0), 0), 0);
  // Клетчатка — средняя только по дням, где она известна у всех записей (иначе занижена)
  const fiberDays = counted.filter((l) => l.every((e) => e.macros.fiber !== undefined));
  const avg = counted.length
    ? {
        kcal: Math.round(sum('kcal') / counted.length),
        protein: Math.round(sum('protein') / counted.length),
        fat: Math.round(sum('fat') / counted.length),
        carbs: Math.round(sum('carbs') / counted.length),
        fiber: fiberDays.length ? Math.round(fiberDays.reduce((a, l) => a + l.reduce((b, e) => b + (e.macros.fiber ?? 0), 0), 0) / fiberDays.length) : null,
      }
    : null;
  const t = args.target;
  const pct = avg && t ? { kcal: avg.kcal / t.kcal, protein: avg.protein / t.protein, fat: avg.fat / t.fat, carbs: avg.carbs / t.carbs } : null;

  // Связь с весом: тренд в начале и конце периода, взвешивания внутри периода
  const weighIns = args.weights.filter((w) => w.date >= from && w.date <= today);
  const weighDays = new Set(weighIns.map((w) => w.date)).size;
  let weight: WeightLink;
  if (counted.length < LINK_MIN_DAYS || weighDays < LINK_MIN_WEIGHINS || !avg || !t) {
    weight = { ok: false, needDays: Math.max(0, LINK_MIN_DAYS - counted.length), needWeighIns: Math.max(0, LINK_MIN_WEIGHINS - weighDays) };
  } else {
    const tr = weightTrend(args.weights.filter((w) => w.date <= today));
    const inP = tr.filter((p) => p.date >= from);
    const span = inP.length >= 2 ? daysBetween(inP[0].date, inP[inP.length - 1].date) : 0;
    const kgPerWeek = span >= 7 ? Math.round(((inP[inP.length - 1].trend - inP[0].trend) / span) * 7 * 100) / 100 : 0;
    weight = { ok: true, avgKcalDelta: avg.kcal - t.kcal, kgPerWeek, weighIns: weighDays };
  }
  return { days, from, to: today, counted: counted.length, logged: byDay.size - (byDay.has(today) ? 1 : 0), avg, pct, perDay, weight };
}

const kg = (x: number) => String(Math.round(Math.abs(x) * 100) / 100).replace('.', ',');

/** Одна фраза о связи питания и веса — или чего не хватает для вывода */
export function weightLinkText(w: WeightLink): string {
  if (!w.ok) {
    const parts = [w.needDays ? `ещё ${w.needDays} ${plural(w.needDays, 'день', 'дня', 'дней')} с записями` : '', w.needWeighIns ? `ещё ${w.needWeighIns} ${plural(w.needWeighIns, 'взвешивание', 'взвешивания', 'взвешиваний')}` : ''].filter(Boolean);
    return `Недостаточно данных, чтобы связать питание с весом: нужно ${parts.join(' и ')}.`;
  }
  const d = Math.round(w.avgKcalDelta / 10) * 10;
  const eat = Math.abs(d) < 50 ? 'Питание в среднем по цели' : `Питание в среднем на ${Math.abs(d)} ккал ${d > 0 ? 'выше' : 'ниже'} цели`;
  const trend = Math.abs(w.kgPerWeek) < 0.05 ? 'вес почти не меняется' : `вес ${w.kgPerWeek > 0 ? 'растёт' : 'снижается'} примерно на ${kg(w.kgPerWeek)} кг в неделю`;
  return `${eat}, ${trend}.`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
