import { useEffect, useMemo, useState } from 'react';
import { useNutrition } from '@/stores/nutrition';
import { appFoodSearch, rankContext } from '@/services/food/providers';
import type { SearchState } from '@/services/food/service';
import { today } from '@/utils/date';

const EMPTY: SearchState = { query: '', items: [], pending: [], errors: [], done: true };

/** Пауза в наборе перед сетевым запросом */
const NETWORK_DELAY = 350;

/**
 * Поиск продуктов для экрана. Свои и базовые продукты — сразу на каждый символ; базы в сети — после паузы в наборе.
 * Ввод не блокируется: пока идёт сетевой запрос, можно печатать дальше — старый запрос отменяется.
 */
export function useFoodSearch(query: string): SearchState {
  const [state, setState] = useState<SearchState>(EMPTY);
  const engine = useMemo(
    () =>
      appFoodSearch(
        () => useNutrition.getState().products,
        () => {
          const s = useNutrition.getState();
          return rankContext(s.favorites, s.entries, today());
        },
      ),
    [],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      engine.cancel();
      setState(EMPTY);
      return;
    }
    engine.search(q, setState, { network: false });
    const t = setTimeout(() => engine.search(q, setState), NETWORK_DELAY);
    return () => clearTimeout(t);
  }, [query, engine]);

  useEffect(() => () => engine.cancel(), [engine]);
  return state;
}
