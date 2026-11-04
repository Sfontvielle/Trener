import type { FoodProduct } from '@/types';
import { dedupeProducts, matchProduct, normalizeQuery, rankProducts, type MatchKind, type NormalizedQuery, type RankContext, type Ranked } from './match';

/**
 * Единый поиск продуктов (NUTRITION_SPEC.md §4). Провайдеры опрашиваются параллельно: офлайн-источники
 * (базовые, свои, кэш) отвечают сразу, сетевые дописывают результаты по мере ответа. Новый запрос отменяет старый
 * через AbortController — опоздавший ответ старого запроса на экран не попадает.
 */

export type ProviderId = 'local' | 'custom' | 'openfoodfacts' | 'usda' | 'fatsecret';

export interface FoodProvider {
  id: ProviderId;
  /** Для группы результатов и атрибуции */
  label: string;
  /** Работает без сети: отвечает сразу, по нему действуют опечатки и синонимы */
  offline: boolean;
  /** Офлайн-провайдер возвращает кандидатов для сопоставления; сетевой — уже найденное базой */
  search(q: NormalizedQuery, opts: { signal: AbortSignal }): FoodProduct[] | Promise<FoodProduct[]>;
  /** Слова-подсказки для продукта (синонимы базовых продуктов) */
  aliases?(p: FoodProduct): string;
}

export interface SearchError {
  provider: ProviderId;
  label: string;
  error: unknown;
}

export interface SearchState {
  query: string;
  items: Ranked[];
  /** Сетевые источники, которые ещё не ответили */
  pending: ProviderId[];
  errors: SearchError[];
  done: boolean;
}

/** Минимальная длина запроса для сети: 1–2 буквы дают тысячи случайных результатов */
export const NETWORK_MIN = 3;

export function createFoodSearch(providers: FoodProvider[], context: () => RankContext, opts: { isCancel?: (e: unknown) => boolean } = {}) {
  let current: AbortController | null = null;

  /** network: false — только офлайн-источники (мгновенный ответ на каждый символ, сеть — после паузы в наборе) */
  function search(raw: string, onUpdate: (s: SearchState) => void, o: { network?: boolean } = {}): AbortController {
    current?.abort();
    const ctrl = new AbortController();
    current = ctrl;
    run(raw, onUpdate, o, ctrl);
    return ctrl;
  }

  function run(raw: string, onUpdate: (s: SearchState) => void, o: { network?: boolean }, ctrl: AbortController): void {
    const q = normalizeQuery(raw);
    const found: { product: FoodProduct; match: MatchKind }[] = [];
    const errors: SearchError[] = [];
    const pending = new Set<ProviderId>();
    const emit = () => {
      if (ctrl.signal.aborted) return;
      const ctx = context();
      const unique = dedupeProducts(
        found.map((f) => f.product),
        ctx,
      );
      const best = new Map<string, MatchKind>();
      for (const f of found) {
        const prev = best.get(f.product.id);
        if (!prev || rankOf(f.match) > rankOf(prev)) best.set(f.product.id, f.match);
      }
      onUpdate({ query: q.raw, items: rankProducts(q, unique.map((p) => ({ product: p, match: best.get(p.id) ?? 'none' })), ctx), pending: [...pending], errors: [...errors], done: pending.size === 0 });
    };
    if (!q.tokens.length) {
      onUpdate({ query: q.raw, items: [], pending: [], errors: [], done: true });
      return;
    }

    // 1. Офлайн — сразу, с опечатками и синонимами
    for (const p of providers.filter((x) => x.offline)) {
      try {
        const list = p.search(q, { signal: ctrl.signal }) as FoodProduct[];
        for (const product of list) {
          const m = matchProduct(q, product, { typos: true, aliases: p.aliases?.(product) });
          if (m !== 'none') found.push({ product, match: m });
        }
      } catch (error) {
        errors.push({ provider: p.id, label: p.label, error });
      }
    }
    const network = o.network !== false && q.raw.length >= NETWORK_MIN ? providers.filter((x) => !x.offline) : [];
    for (const p of network) pending.add(p.id);
    emit();

    // 2. Сеть — исходный запрос; результаты дописываются, как только придут
    for (const p of network) {
      let req: Promise<FoodProduct[]>;
      try {
        req = Promise.resolve(p.search(q, { signal: ctrl.signal }));
      } catch (e) {
        req = Promise.reject(e);
      }
      req
        .then((list) => {
          if (ctrl.signal.aborted) return;
          for (const product of list) found.push({ product, match: matchProduct(q, product, { typos: false }) });
        })
        .catch((error) => {
          if (ctrl.signal.aborted || opts.isCancel?.(error)) return;
          errors.push({ provider: p.id, label: p.label, error });
        })
        .finally(() => {
          pending.delete(p.id);
          emit();
        });
    }
  }

  /** Только офлайн-источники, синхронно и без побочных эффектов — для показа на каждый введённый символ */
  function offline(raw: string): SearchState {
    let out: SearchState = { query: raw.trim(), items: [], pending: [], errors: [], done: true };
    run(raw, (st) => (out = st), { network: false }, new AbortController());
    return out;
  }

  return {
    search,
    offline,
    /** Сетевые источники — для индикатора «ищу в базах» до начала запроса */
    networkIds: providers.filter((p) => !p.offline).map((p) => p.id),
    /** Отменить текущий запрос (уход с экрана) */
    cancel: () => current?.abort(),
  };
}

const RANK: Record<MatchKind, number> = { exact: 4, prefix: 3, contains: 2, typo: 1, none: 0 };
const rankOf = (k: MatchKind) => RANK[k];
