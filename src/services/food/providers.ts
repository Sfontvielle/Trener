import type { FoodProduct, FoodEntry, ISODate } from '@/types';
import { LOCAL_FOODS, localAliases } from '@/data/foods';
import { FoodApiError, FoodSearchCancelled, lookupBarcode, searchFdc, searchProducts } from '@/services/foodApi';
import { addDays } from '@/utils/date';
import type { RankContext } from './match';
import { createFoodSearch, type FoodProvider } from './service';

/** Базовые продукты приложения — офлайн, с синонимами из data/foods.ts */
export const localProvider: FoodProvider = {
  id: 'local',
  label: 'Базовые продукты',
  offline: true,
  search: () => LOCAL_FOODS,
  aliases: (p) => localAliases(p.id),
};

/** Свои продукты, рецепты и кэш продуктов из дневника — офлайн */
export function customProvider(products: () => Record<string, FoodProduct>): FoodProvider {
  return {
    id: 'custom',
    label: 'Мои и сохранённые',
    offline: true,
    search: () => Object.values(products()).filter((p) => p.source !== 'local'),
  };
}

export const offProvider: FoodProvider = {
  id: 'openfoodfacts',
  label: 'Open Food Facts',
  offline: false,
  // Цифры 8–14 — штрихкод: ищем по всем базам штрихкодов; «нет в базах» — пустой результат, а не ошибка
  search: (q, { signal }) =>
    q.barcode
      ? lookupBarcode(q.raw).then(
          (p) => [p],
          (e) => {
            if (e instanceof FoodApiError && e.kind === 'not_found') return [];
            throw e;
          },
        )
      : searchProducts(q.raw, 1, signal),
};

export const usdaProvider: FoodProvider = {
  id: 'usda',
  label: 'USDA FoodData Central',
  offline: false,
  search: (q, { signal }) => (q.barcode ? Promise.resolve([]) : searchFdc(q.raw, signal)),
};

/** Контекст ранжирования: избранное и сколько раз продукт ели за 30 дней */
export function rankContext(favorites: string[], entries: FoodEntry[], ref: ISODate): RankContext {
  const from = addDays(ref, -30);
  const freq30 = new Map<string, number>();
  for (const e of entries) if (e.date >= from && e.date <= ref) freq30.set(e.productId, (freq30.get(e.productId) ?? 0) + 1);
  return { favorites: new Set(favorites), freq30 };
}

/** Поиск приложения: базовые + свои офлайн, Open Food Facts и USDA по сети. FatSecret — после решения владельца */
export function appFoodSearch(products: () => Record<string, FoodProduct>, context: () => RankContext) {
  return createFoodSearch([localProvider, customProvider(products), offProvider, usdaProvider], context, { isCancel: (e) => e instanceof FoodSearchCancelled });
}
