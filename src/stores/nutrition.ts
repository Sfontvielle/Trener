import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FoodEntry, FoodProduct, ISODate, MealSlot } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';
import { macrosFor } from '@/features/nutrition/status';

interface NutritionState {
  entries: FoodEntry[];
  /** Кэш продуктов (из Open Food Facts и своих) — работает офлайн */
  products: Record<string, FoodProduct>;
  /** Последние использованные продукты (id), самые свежие первыми */
  recent: string[];
  /** Запомненная граммовка для продукта */
  lastGrams: Record<string, number>;
  addEntry: (p: FoodProduct, grams: number, meal: MealSlot, date: ISODate) => FoodEntry;
  updateEntry: (id: string, grams: number) => void;
  removeEntry: (id: string) => void;
  cacheProduct: (p: FoodProduct) => void;
  reset: () => void;
}

export const MEAL_LABEL: Record<MealSlot, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекусы' };

export function mealForHour(h: number): MealSlot {
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export const useNutrition = create<NutritionState>()(
  persist(
    (set, get) => ({
      entries: [],
      products: {},
      recent: [],
      lastGrams: {},
      addEntry: (p, grams, meal, date) => {
        const e: FoodEntry = { id: uid('f_'), date, productId: p.id, name: p.brand ? `${p.name} · ${p.brand}` : p.name, grams, macros: macrosFor(p.per100, grams), meal, createdAt: Date.now() };
        set((s) => ({
          entries: [...s.entries, e],
          products: { ...s.products, [p.id]: p },
          recent: [p.id, ...s.recent.filter((x) => x !== p.id)].slice(0, 60),
          lastGrams: { ...s.lastGrams, [p.id]: grams },
        }));
        return e;
      },
      updateEntry: (id, grams) =>
        set((s) => ({
          entries: s.entries.map((e) => {
            if (e.id !== id) return e;
            const p = get().products[e.productId];
            if (!p) {
              const k = grams / e.grams;
              return { ...e, grams, macros: { kcal: Math.round(e.macros.kcal * k), protein: e.macros.protein * k, fat: e.macros.fat * k, carbs: e.macros.carbs * k } };
            }
            return { ...e, grams, macros: macrosFor(p.per100, grams) };
          }),
        })),
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      cacheProduct: (p) => set((s) => ({ products: { ...s.products, [p.id]: p } })),
      reset: () => set({ entries: [], products: {}, recent: [], lastGrams: {} }),
    }),
    persistOptions<NutritionState>('nutrition', 1, (s) => ({ entries: s.entries, products: s.products, recent: s.recent, lastGrams: s.lastGrams }) as NutritionState),
  ),
);
