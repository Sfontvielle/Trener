import { useEffect, useMemo, useState } from 'react';
import { useNutrition } from '@/stores/nutrition';
import { appFoodSearch, rankContext } from '@/services/food/providers';
import { NETWORK_MIN, type SearchState } from '@/services/food/service';
import { today } from '@/utils/date';

const EMPTY: SearchState = { query: '', items: [], pending: [], errors: [], done: true };

/** Пауза в наборе перед сетевым запросом */
const NETWORK_DELAY = 350;

/**
 * Поиск продуктов для экрана. Свои и базовые продукты — сразу на каждый символ (синхронно); базы в сети — после
 * паузы в наборе. Ввод не блокируется: пока идёт сетевой запрос, можно печатать дальше — старый запрос отменяется.
 */
export function useFoodSearch(query: string): SearchState {
  const q = query.trim();
  // Свои продукты, избранное и дневник влияют на результаты и порядок — пересчёт при их изменении
  const products = useNutrition((s) => s.products);
  const favorites = useNutrition((s) => s.favorites);
  const entries = useNutrition((s) => s.entries);
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
  // Движок читает хранилище через getState: products, favorites и entries в зависимостях — чтобы пересчитать при их смене
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const offline = useMemo(() => (q.length >= 2 ? engine.offline(q) : EMPTY), [engine, q, products, favorites, entries]);
  const [net, setNet] = useState<SearchState | null>(null);

  useEffect(() => {
    if (q.length < NETWORK_MIN) {
      engine.cancel();
      return;
    }
    const t = setTimeout(() => engine.search(q, setNet), NETWORK_DELAY);
    return () => clearTimeout(t);
  }, [q, engine]);

  useEffect(() => () => engine.cancel(), [engine]);

  if (net && net.query === q) return net;
  // Пока идёт пауза в наборе — офлайн-результаты и признак «ищу в базах»
  return q.length >= NETWORK_MIN ? { ...offline, pending: engine.networkIds, done: false } : offline;
}
