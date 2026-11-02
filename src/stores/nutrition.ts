import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DiaryDraft, FoodEntry, FoodProduct, ISODate, MealSlot, Recipe } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';
import { LOCAL_FOODS } from '@/data/foods';
import { buildRecipe, entryFor, migrateNutrition, normalizeProduct, NUTRITION_VERSION, recipeProduct, rescaleEntry, type NutritionPersisted } from '@/features/nutrition/schema';

interface NutritionState {
  entries: FoodEntry[];
  /** Кэш продуктов (из Open Food Facts и своих) — работает офлайн */
  products: Record<string, FoodProduct>;
  /** Последние использованные продукты (id), самые свежие первыми */
  recent: string[];
  /** Запомненная граммовка для продукта */
  lastGrams: Record<string, number>;
  addEntry: (p: FoodProduct, grams: number, meal: MealSlot, date: ISODate, unit?: FoodEntry['unit']) => FoodEntry;
  /** Изменить порцию (и приём пищи); прошлая версия записи возвращается для «Отменить» */
  updateEntry: (id: string, grams: number, unit?: FoodEntry['unit'], meal?: MealSlot) => FoodEntry | undefined;
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
  /** v2: рецепты (вес до/после, порции); в дневник добавляются как продукт `recipe:<id>` */
  recipes: Recipe[];
  saveRecipe: (r: { id?: string; name: string; ingredients: Recipe['ingredients']; cookedWeightG?: number; servings: number }) => Recipe;
  removeRecipe: (id: string) => void;
  /** v2: корзина добавления — несколько продуктов одним действием; сохраняется между запусками */
  draft: DiaryDraft | null;
  draftAdd: (date: ISODate, meal: MealSlot, item: DiaryDraft['items'][number]) => void;
  draftUpdate: (index: number, item: DiaryDraft['items'][number]) => void;
  draftRemove: (index: number) => void;
  draftSetMeal: (meal: MealSlot) => void;
  draftClear: () => void;
  /** Записать корзину в дневник; возвращает id новых записей (для «Отменить») */
  draftCommit: () => string[];
  /** Удалить записи и вернуть их — тост «Отменить» кладёт их обратно через restoreEntries */
  deleteEntries: (ids: string[]) => FoodEntry[];
  restoreEntries: (entries: FoodEntry[]) => void;
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
      addEntry: (p, grams, meal, date, unit) => {
        const prod = normalizeProduct(p);
        const e = entryFor({ id: uid('f_'), product: prod, grams, meal, date, now: Date.now(), unit });
        set((s) => ({
          entries: [...s.entries, e],
          products: { ...s.products, [prod.id]: prod },
          recent: [prod.id, ...s.recent.filter((x) => x !== prod.id)].slice(0, 60),
          lastGrams: { ...s.lastGrams, [prod.id]: grams },
        }));
        return e;
      },
      updateEntry: (id, grams, unit, meal) => {
        const prev = get().entries.find((e) => e.id === id);
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...rescaleEntry(e, grams, s.products[e.productId], unit), ...(meal ? { meal } : null) } : e)),
          ...(prev ? { lastGrams: { ...s.lastGrams, [prev.productId]: grams } } : null),
        }));
        return prev;
      },
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      cacheProduct: (p) => set((s) => ({ products: { ...s.products, [p.id]: normalizeProduct(p) } })),
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
      recipes: [],
      saveRecipe: (r) => {
        const prev = r.id ? get().recipes.find((x) => x.id === r.id) : undefined;
        const rec = buildRecipe({ id: prev?.id ?? uid('rcp_'), name: r.name, ingredients: r.ingredients, cookedWeightG: r.cookedWeightG, servings: r.servings, now: Date.now(), createdAt: prev?.createdAt });
        // Продукт рецепта обновляется для новых записей; прошлые записи хранят свой снимок КБЖУ и не меняются
        const prod = recipeProduct(rec);
        set((s) => ({ recipes: prev ? s.recipes.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...s.recipes], products: { ...s.products, [prod.id]: prod } }));
        return rec;
      },
      removeRecipe: (id) => set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id), favorites: s.favorites.filter((f) => f !== `recipe:${id}`) })),
      draft: null,
      draftAdd: (date, meal, item) =>
        set((s) => {
          const it = { ...item, product: normalizeProduct(item.product) };
          // Корзина — на один день и приём; новая дата начинает новую корзину
          const base = s.draft && s.draft.date === date ? s.draft : { date, meal, items: [] };
          const i = base.items.findIndex((x) => x.product.id === it.product.id);
          const items = i >= 0 ? base.items.map((x, k) => (k === i ? it : x)) : [...base.items, it];
          return { draft: { ...base, meal: base.items.length ? base.meal : meal, items } };
        }),
      draftUpdate: (index, item) => set((s) => (s.draft ? { draft: { ...s.draft, items: s.draft.items.map((x, k) => (k === index ? item : x)) } } : {})),
      draftRemove: (index) =>
        set((s) => {
          if (!s.draft) return {};
          const items = s.draft.items.filter((_, k) => k !== index);
          return { draft: items.length ? { ...s.draft, items } : null };
        }),
      draftSetMeal: (meal) => set((s) => (s.draft ? { draft: { ...s.draft, meal } } : {})),
      draftClear: () => set({ draft: null }),
      draftCommit: () => {
        const d = get().draft;
        if (!d) return [];
        const ids = d.items.map((it) => get().addEntry(it.product, it.grams, d.meal, d.date, it.unit).id);
        set({ draft: null });
        return ids;
      },
      deleteEntries: (ids) => {
        const gone = get().entries.filter((e) => ids.includes(e.id));
        set((s) => ({ entries: s.entries.filter((e) => !ids.includes(e.id)) }));
        return gone;
      },
      restoreEntries: (list) => set((s) => ({ entries: [...s.entries.filter((e) => !list.some((x) => x.id === e.id)), ...list] })),
      reset: () => set({ entries: [], products: {}, recent: [], lastGrams: {}, meals: [], water: {}, favorites: [], recipes: [], draft: null }),
    }),
    persistOptions<NutritionState, NutritionPersisted>(
      'nutrition',
      NUTRITION_VERSION,
      (s) => ({ entries: s.entries, products: s.products, recent: s.recent, lastGrams: s.lastGrams, meals: s.meals, water: s.water, favorites: s.favorites, recipes: s.recipes, draft: s.draft }),
      (p, v) => migrateNutrition(p, v),
    ),
  ),
);
