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
