import type { FoodEntry, FoodProduct, ISODate, MealSlot } from '@/types';
import { LOCAL_FOODS } from '@/data/foods';
import { addDays } from '@/utils/date';

/** Самые частые продукты за 21 день с привычной порцией — для добавления одним тапом */
export function frequentProducts(entries: FoodEntry[], products: Record<string, FoodProduct>, lastGrams: Record<string, number>, ref: ISODate, n = 8): { product: FoodProduct; grams: number; count: number }[] {
  const from = addDays(ref, -21);
  const count = new Map<string, number>();
  for (const e of entries) if (e.date >= from && e.date <= ref) count.set(e.productId, (count.get(e.productId) ?? 0) + 1);
  return [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => {
      const product = products[id] ?? LOCAL_FOODS.find((f) => f.id === id);
      return product ? { product, grams: lastGrams[id] ?? product.serving?.grams ?? 100, count: c } : null;
    })
    .filter((x): x is { product: FoodProduct; grams: number; count: number } => !!x)
    .slice(0, n);
}

/** Тот же приём пищи вчера (если сегодня в этом слоте ещё пусто) */
export function sameMealYesterday(entries: FoodEntry[], date: ISODate, meal: MealSlot): FoodEntry[] {
  if (entries.some((e) => e.date === date && e.meal === meal)) return [];
  const y = addDays(date, -1);
  return entries.filter((e) => e.date === y && e.meal === meal);
}

/**
 * Последняя порция продукта: запомненная граммовка → последняя запись в дневнике (старые данные без lastGrams)
 * → порция с этикетки → 100 г. Источник нужен, чтобы честно подписать «Последний раз: 220 г».
 */
export function lastPortion(productId: string, lastGrams: Record<string, number>, entries: FoodEntry[], serving?: { grams: number }): { grams: number; source: 'last' | 'serving' | 'default' } {
  if (lastGrams[productId] > 0) return { grams: lastGrams[productId], source: 'last' };
  const last = entries.filter((e) => e.productId === productId).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (last && last.grams > 0) return { grams: last.grams, source: 'last' };
  if (serving?.grams) return { grams: serving.grams, source: 'serving' };
  return { grams: 100, source: 'default' };
}

export interface UsualMeal {
  slot: MealSlot;
  items: { product: FoodProduct; grams: number }[];
  kcal: number;
  /** В скольких днях из скольких встречалась комбинация */
  days: number;
  of: number;
}

/**
 * «Ваш обычный завтрак»: устойчивая комбинация продуктов в этом приёме пищи за 4 недели.
 * Алгоритм (детерминированный): берём дни, где приём заполнен (нужно ≥3); ядро — продукты, которые есть
 * в ≥60% таких дней и встречались ≥3 раз; порция — медиана граммовок продукта в этом приёме
 * (типичная, а не случайная последняя). Не предлагаем, если всё ядро уже съедено сегодня.
 */
export function usualMeal(entries: FoodEntry[], products: Record<string, FoodProduct>, ref: ISODate, slot: MealSlot, windowDays = 28): UsualMeal | null {
  const from = addDays(ref, -windowDays);
  const list = entries.filter((e) => e.meal === slot && e.date >= from && e.date < ref);
  const days = new Map<ISODate, FoodEntry[]>();
  for (const e of list) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  if (days.size < 3) return null;
  const inDays = new Map<string, number>();
  for (const es of days.values()) for (const id of new Set(es.map((e) => e.productId))) inDays.set(id, (inDays.get(id) ?? 0) + 1);
  const core = [...inDays.entries()].filter(([, n]) => n >= 3 && n / days.size >= 0.6).map(([id]) => id);
  if (!core.length) return null;
  const todayIds = new Set(entries.filter((e) => e.date === ref && e.meal === slot).map((e) => e.productId));
  if (core.every((id) => todayIds.has(id))) return null;
  const items = core
    .map((id) => {
      const product = products[id] ?? LOCAL_FOODS.find((f) => f.id === id);
      const gs = list.filter((e) => e.productId === id).map((e) => e.grams).sort((a, b) => a - b);
      return product ? { product, grams: Math.round(gs[Math.floor(gs.length / 2)]) } : null;
    })
    .filter((x): x is { product: FoodProduct; grams: number } => !!x);
  if (!items.length) return null;
  const together = [...days.values()].filter((es) => core.every((id) => es.some((e) => e.productId === id))).length;
  const kcal = Math.round(items.reduce((a, it) => a + (it.product.per100.kcal * it.grams) / 100, 0));
  return { slot, items, kcal, days: together, of: days.size };
}
