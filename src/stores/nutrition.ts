import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FoodEntry, FoodProduct, ISODate, MealSlot } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';
import { macrosFor } from '@/features/nutrition/status';
import { LOCAL_FOODS } from '@/data/foods';

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
  /** Мои блюда: сохранённые комбинации продуктов */
  meals: SavedMeal[];
  saveMeal: (name: string, items: SavedMeal['items']) => SavedMeal;
  removeMeal: (id: string) => void;
  /** Добавить блюдо целиком; возвращает id созданных записей (для «Отменить») */
  addSavedMeal: (mealId: string, slot: MealSlot, date: ISODate) => string[];
  removeEntries: (ids: string[]) => void;
  /** Вода за день, мл */
  water: Record<ISODate, number>;
  addWater: (date: ISODate, ml: number) => void;
  /** Избранные продукты — всегда сверху при добавлении */
  favorites: string[];
  toggleFavorite: (productId: string) => void;
  /** Скопировать приём пищи или весь день с другой даты */
  copyEntries: (fromDate: ISODate, toDate: ISODate, meal?: MealSlot) => string[];
  reset: () => void;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: { productId: string; name: string; grams: number }[];
  createdAt: number;
  uses: number;
}

export const MEAL_LABEL: Record<MealSlot, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекусы' };

/** Ориентир воды: ~33 мл/кг (1,5–4 л) + 0,5 л в день тренировки. Ориентир, а не медицинская норма */
export function waterTarget(weightKg: number, trainingDay: boolean): number {
  const base = Math.min(3500, Math.max(1500, Math.round((weightKg * 33) / 250) * 250));
  return base + (trainingDay ? 500 : 0);
}

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
      meals: [],
      saveMeal: (name, items) => {
        const m: SavedMeal = { id: uid('meal_'), name: name.trim() || 'Моё блюдо', items, createdAt: Date.now(), uses: 0 };
        set((s) => ({ meals: [m, ...s.meals] }));
        return m;
      },
      removeMeal: (id) => set((s) => ({ meals: s.meals.filter((m) => m.id !== id) })),
      addSavedMeal: (mealId, slot, date) => {
        const m = get().meals.find((x) => x.id === mealId);
        if (!m) return [];
        const ids: string[] = [];
        for (const it of m.items) {
          const p = get().products[it.productId] ?? LOCAL_FOODS.find((f) => f.id === it.productId);
          if (p) ids.push(get().addEntry(p, it.grams, slot, date).id);
        }
        set((s) => ({ meals: s.meals.map((x) => (x.id === mealId ? { ...x, uses: x.uses + 1 } : x)) }));
        return ids;
      },
      removeEntries: (ids) => set((s) => ({ entries: s.entries.filter((e) => !ids.includes(e.id)) })),
      water: {},
      addWater: (date, ml) => set((s) => ({ water: { ...s.water, [date]: Math.max(0, Math.min(8000, (s.water[date] ?? 0) + ml)) } })),
      favorites: [],
      toggleFavorite: (id) => set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [id, ...s.favorites].slice(0, 100) })),
      copyEntries: (fromDate, toDate, meal) => {
        const src = get().entries.filter((e) => e.date === fromDate && (!meal || e.meal === meal));
        const now = Date.now();
        const copies: FoodEntry[] = src.map((e, i) => ({ ...e, id: uid('f_'), date: toDate, createdAt: now + i }));
        set((s) => ({ entries: [...s.entries, ...copies] }));
        return copies.map((c) => c.id);
      },
      reset: () => set({ entries: [], products: {}, recent: [], lastGrams: {}, meals: [], water: {}, favorites: [] }),
    }),
    persistOptions<NutritionState>('nutrition', 1, (s) => ({ entries: s.entries, products: s.products, recent: s.recent, lastGrams: s.lastGrams, meals: s.meals, water: s.water, favorites: s.favorites }) as NutritionState),
  ),
);
