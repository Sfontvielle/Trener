import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FoodProduct } from '../src/types';
import { dedupeProducts, editDistance, matchProduct, normalizeQuery, normalizeText, rankProducts, translit, type RankContext } from '../src/services/food/match';
import { createFoodSearch, type FoodProvider, type SearchState } from '../src/services/food/service';
import { LOCAL_FOODS } from '../src/data/foods';
import { localProvider } from '../src/services/food/providers';

const P = (id: string, name: string, extra: Partial<FoodProduct> = {}): FoodProduct => ({ id, name, per100: { kcal: 100, protein: 10, fat: 5, carbs: 5 }, source: 'openfoodfacts', ...extra });
const CTX: RankContext = { favorites: new Set(), freq30: new Map() };

test('Нормализация: регистр, ё, проценты, десятичная запятая, знаки', () => {
  assert.equal(normalizeText('  Творог  5 %  «Простоквашино» '), 'творог 5% простоквашино');
  assert.equal(normalizeText('Молоко 2,5%'), 'молоко 2.5%');
  assert.equal(normalizeText('Ёжевика—мёд'), 'ежевика мед');
  assert.equal(translit('prostokvashino'), 'простоквашино');
  assert.equal(translit('activia'), 'активиа');
});

test('Опечатки: Дамерау–Левенштейн и допуск по длине слова', () => {
  assert.equal(editDistance('тварог', 'творог'), 1);
  assert.equal(editDistance('твроог', 'творог'), 1, 'перестановка соседних — одна правка');
  assert.equal(editDistance('гречка', 'гречка'), 0);
  assert.equal(editDistance('кура', 'творог', 2), 3, 'ранний выход за порогом');
  const q = normalizeQuery('тварог');
  assert.equal(matchProduct(q, { name: 'Творог 5%' }), 'typo');
  assert.equal(matchProduct(normalizeQuery('бонан'), { name: 'Банан' }), 'typo');
  assert.equal(matchProduct(normalizeQuery('рис'), { name: 'Сыр' }), 'none', 'короткое слово — без опечаток');
  assert.equal(matchProduct(q, { name: 'Творог 5%' }, { typos: false }), 'none', 'сетевые результаты — без опечаток');
});

test('«тварог» находит творог среди базовых продуктов офлайн', () => {
  const q = normalizeQuery('тварог');
  const hits = LOCAL_FOODS.filter((p) => matchProduct(q, p, { typos: true, aliases: localProvider.aliases!(p) }) !== 'none').map((p) => p.name);
  assert.ok(hits.includes('Творог 5%'), hits.join(', '));
});

test('Синонимы: «гречка» находит гречневую крупу, «рыба» — лосося, но «лосось» — не треску', () => {
  assert.equal(matchProduct(normalizeQuery('гречка'), { name: 'Крупа гречневая ядрица' }), 'contains');
  assert.equal(matchProduct(normalizeQuery('рыба'), { name: 'Лосось запечённый' }), 'contains');
  assert.equal(matchProduct(normalizeQuery('лосось'), { name: 'Треска отварная' }), 'none');
  assert.equal(matchProduct(normalizeQuery('курица'), { name: 'Куриное филе' }), 'contains');
  assert.equal(matchProduct(normalizeQuery('prostokvashino'), { name: 'Творог 5%', brand: 'Простоквашино' }), 'prefix');
  assert.equal(matchProduct(normalizeQuery('творог 5%'), { name: 'Творог 5 %' }), 'exact');
  assert.equal(matchProduct(normalizeQuery('творог 9'), { name: 'Творог 5%' }), 'none', 'все слова запроса обязательны');
});

test('Ранжирование: избранное → уже ели → точное → с начала слова → статус → полнота', () => {
  const q = normalizeQuery('творог');
  const items = [
    { product: P('off:1', 'Сырок творожный'), match: 'contains' as const },
    { product: P('off:2', 'Творог 5%', { brand: 'Ферма' }), match: 'prefix' as const },
    { product: P('local:cottage', 'Творог', { source: 'local' }), match: 'exact' as const },
    { product: P('off:3', 'Творог 9%', { per100: { kcal: 159, protein: 16.7, fat: 9, carbs: 2, fiber: 0 }, serving: { label: 'пачка', grams: 180 } }), match: 'prefix' as const },
    { product: P('off:eaten', 'Творожная масса'), match: 'contains' as const },
    { product: P('custom:mine', 'Мой творог', { source: 'custom' }), match: 'prefix' as const },
  ];
  const ctx: RankContext = { favorites: new Set(), freq30: new Map([['off:eaten', 3]]) };
  const order = rankProducts(q, items, ctx).map((r) => r.product.id);
  assert.deepEqual(order, ['custom:mine', 'off:eaten', 'local:cottage', 'off:3', 'off:2', 'off:1']);
  const fav = rankProducts(q, items, { favorites: new Set(['off:1']), freq30: new Map() }).map((r) => r.product.id);
  assert.equal(fav[0], 'custom:mine');
  assert.equal(fav[1], 'off:1', 'избранное — сразу после своих');
});

test('Ранжирование: бренд в запросе поднимает брендовые продукты, без бренда — базовые', () => {
  const raw = [
    { product: P('off:b', 'Творог 5%', { brand: 'Простоквашино' }), match: 'prefix' as const },
    { product: P('local:c', 'Творог 5%', { source: 'local' }), match: 'prefix' as const },
  ];
  // При равном статусе данных («проверено» у базового выше «из базы») решает тип источника
  const same = raw.map((r) => ({ ...r, product: { ...r.product, verification: 'database' as const } }));
  assert.equal(rankProducts(normalizeQuery('творог простоквашино'), same, CTX)[0].product.id, 'off:b');
  assert.equal(rankProducts(normalizeQuery('творог'), same, CTX)[0].product.id, 'local:c');
  // Базовый продукт под брендовый запрос просто не подходит: не все слова запроса нашлись
  assert.equal(matchProduct(normalizeQuery('творог простоквашино'), raw[1].product), 'none');
});

test('Дубли по штрихкоду склеиваются: остаётся свой продукт или запись полнее', () => {
  const a = P('off:4600000000017', 'Йогурт', { barcode: '4600000000017' });
  const b = P('usda:99', 'Yogurt', { barcode: '04600000000017', source: 'usda', per100: { kcal: 60, protein: 3, fat: 2, carbs: 7, fiber: 0 }, serving: { label: '1 cup', grams: 150 } });
  const mine = P('custom:y', 'Йогурт с этикетки', { barcode: '4600000000017', source: 'custom' });
  assert.deepEqual(dedupeProducts([a, b], CTX).map((p) => p.id), ['usda:99']);
  assert.deepEqual(dedupeProducts([a, b, mine], CTX).map((p) => p.id), ['custom:y']);
  assert.deepEqual(dedupeProducts([a, P('off:4600000000017', 'Йогурт (кэш)', { barcode: '4600000000017' })], CTX).length, 1, 'один id — одна запись');
  assert.equal(dedupeProducts([P('a', 'A'), P('b', 'B')], CTX).length, 2, 'без штрихкода — по id');
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test('Сервис: офлайн-результаты сразу, сетевые дописываются; новый запрос отменяет старый', async () => {
  const slow = new Map<string, ReturnType<typeof deferred<FoodProduct[]>>>();
  const signals: AbortSignal[] = [];
  const net: FoodProvider = {
    id: 'openfoodfacts',
    label: 'Сеть',
    offline: false,
    search: (q, { signal }) => {
      signals.push(signal);
      const d = deferred<FoodProduct[]>();
      slow.set(q.raw, d);
      return d.promise;
    },
  };
  const offline: FoodProvider = { id: 'local', label: 'Базовые', offline: true, search: () => [P('local:t', 'Творог', { source: 'local' }), P('local:r', 'Рис', { source: 'local' })] };
  const svc = createFoodSearch([offline, net], () => CTX);
  const first: SearchState[] = [];
  const second: SearchState[] = [];
  svc.search('творо', (s) => first.push(s));
  assert.equal(first.length, 1, 'офлайн — синхронно');
  assert.deepEqual(first[0].items.map((i) => i.product.id), ['local:t']);
  assert.deepEqual(first[0].pending, ['openfoodfacts']);
  svc.search('творог', (s) => second.push(s));
  assert.equal(signals[0].aborted, true, 'старый сетевой запрос отменён');
  // Опоздавший ответ старого запроса не попадает на экран
  slow.get('творо')!.resolve([P('off:old', 'Творог старый')]);
  slow.get('творог')!.resolve([P('off:new', 'Творог новый')]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(first.length, 1, 'старый запрос больше не обновляет экран');
  const last = second[second.length - 1];
  assert.equal(last.done, true);
  assert.deepEqual(last.items.map((i) => i.product.id).sort(), ['local:t', 'off:new']);
});

test('Сервис: ошибка сети не прячет офлайн-результаты; короткий запрос в сеть не уходит', async () => {
  let calls = 0;
  const failing: FoodProvider = {
    id: 'openfoodfacts',
    label: 'Сеть',
    offline: false,
    search: async () => {
      calls++;
      throw new Error('offline');
    },
  };
  const offline: FoodProvider = { id: 'local', label: 'Базовые', offline: true, search: () => [P('local:r', 'Рис отварной', { source: 'local' })] };
  const svc = createFoodSearch([offline, failing], () => CTX);
  const states: SearchState[] = [];
  svc.search('рис', (s) => states.push(s));
  await new Promise((r) => setTimeout(r, 0));
  const last = states[states.length - 1];
  assert.equal(last.errors.length, 1);
  assert.deepEqual(last.items.map((i) => i.product.id), ['local:r']);
  const short: SearchState[] = [];
  svc.search('ри', (s) => short.push(s));
  assert.equal(calls, 1, '2 символа — только офлайн');
  assert.equal(short[0].done, true);
  svc.search('рис', (s) => short.push(s), { network: false });
  assert.equal(calls, 1, 'network: false — только офлайн');
});
