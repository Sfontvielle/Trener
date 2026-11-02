import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FoodEntry, FoodProduct } from '../src/types';
import {
  buildRecipe,
  entryFor,
  gramsOf,
  macrosExact,
  migrateNutrition,
  normalizeProduct,
  recipeProduct,
  recipeYield,
  rescaleEntry,
  unitsFor,
  unitText,
  verificationOf,
} from '../src/features/nutrition/schema';
import { sumMacros } from '../src/features/nutrition/status';
import { isCountedDay, nutritionPeriod, weightLinkText } from '../src/features/nutrition/analytics';
import type { NutritionTarget, WeightEntry } from '../src/types';
import { addDays } from '../src/utils/date';

// Фикстура хранилища v1 — в том виде, в каком его писало приложение до фазы C (macrosFor с округлением)
const V1 = {
  entries: [
    { id: 'f_1', date: '2026-10-30', productId: 'local:oats', name: 'Овсяные хлопья', grams: 60, macros: { kcal: 220, protein: 7.4, fat: 3.7, carbs: 35.7 }, meal: 'breakfast', createdAt: 1 },
    { id: 'f_2', date: '2026-10-30', productId: 'off:4600000000001', name: 'Творог 5% · Простоквашино', grams: 180, macros: { kcal: 218, protein: 31, fat: 9, carbs: 5.4, fiber: 0 }, meal: 'breakfast', createdAt: 2 },
    { id: 'f_3', date: '2026-10-31', productId: 'custom:abc', name: 'Батончик', grams: 40, macros: { kcal: 160, protein: 8, fat: 6, carbs: 18 }, meal: 'snack', createdAt: 3 },
    { id: 'broken', date: '2026-10-31', productId: 'x', name: 'битая', macros: null },
  ],
  products: {
    'local:oats': { id: 'local:oats', name: 'Овсяные хлопья', per100: { kcal: 366, protein: 12.3, fat: 6.1, carbs: 59.5 }, source: 'local', serving: { label: 'порция', grams: 60 } },
    'off:4600000000001': { id: 'off:4600000000001', name: 'Творог 5%', brand: 'Простоквашино', barcode: '4600000000001', per100: { kcal: 121, protein: 17.2, fat: 5, carbs: 3 }, source: 'openfoodfacts' },
    'custom:abc': { id: 'custom:abc', name: 'Батончик', per100: { kcal: 400, protein: 20, fat: 15, carbs: 45 }, source: 'custom', serving: { label: '1 шт', grams: 40 } },
    'bad': { id: 'bad', name: 'без КБЖУ' },
  },
  recent: ['custom:abc', 'local:oats', 7],
  lastGrams: { 'local:oats': 60 },
  meals: [{ id: 'meal_1', name: 'Завтрак', items: [{ productId: 'local:oats', name: 'Овсяные хлопья', grams: 60 }], createdAt: 1, uses: 2 }],
  water: { '2026-10-30': 1500 },
  favorites: ['local:oats'],
};

test('Миграция v1 → v2: записи дневника переносятся байт в байт, битые отбрасываются', () => {
  const m = migrateNutrition(JSON.parse(JSON.stringify(V1)), 1);
  assert.equal(m.entries.length, 3);
  assert.deepEqual(m.entries, V1.entries.slice(0, 3));
  assert.deepEqual(m.meals, V1.meals);
  assert.deepEqual(m.water, V1.water);
  assert.deepEqual(m.favorites, ['local:oats']);
  assert.deepEqual(m.recent, ['custom:abc', 'local:oats']);
  assert.deepEqual(m.recipes, []);
  assert.equal(m.draft, null);
});

test('Миграция v1 → v2: продукты получают статус данных, атрибуцию и единицу «порция»', () => {
  const m = migrateNutrition(V1, 1);
  assert.equal(m.products['bad'], undefined, 'продукт без КБЖУ отброшен');
  assert.equal(m.products['local:oats'].verification, 'verified');
  assert.equal(m.products['off:4600000000001'].verification, 'database');
  assert.equal(m.products['off:4600000000001'].attribution, 'Open Food Facts (ODbL)');
  assert.equal(m.products['custom:abc'].verification, 'label');
  assert.deepEqual(m.products['local:oats'].units, [{ id: 'serving', label: 'порция', grams: 60 }]);
  assert.deepEqual(m.products['local:oats'].per100, V1.products['local:oats'].per100, 'КБЖУ продукта не меняются');
});

test('Миграция идемпотентна и переживает пустое и чужое хранилище', () => {
  const once = migrateNutrition(V1, 1);
  const twice = migrateNutrition(once, 2);
  assert.deepEqual(twice, once);
  const empty = migrateNutrition(undefined, 0);
  assert.deepEqual(empty, { entries: [], products: {}, recent: [], lastGrams: {}, meals: [], water: {}, favorites: [], recipes: [], draft: null });
  assert.deepEqual(migrateNutrition('мусор', 1).entries, []);
});

test('Снимок: изменение продукта не меняет прошлые записи и сумму дня', () => {
  const p: FoodProduct = { id: 'custom:x', name: 'Сырники', per100: { kcal: 220, protein: 14, fat: 10, carbs: 18 }, source: 'custom' };
  const e = entryFor({ id: 'e1', product: p, grams: 150, meal: 'breakfast', date: '2026-11-01', now: 1 });
  const before = sumMacros([e]);
  p.per100.kcal = 999; // человек поправил продукт
  const edited: FoodProduct = { ...p, per100: { ...p.per100, kcal: 300 } };
  assert.deepEqual(sumMacros([e]), before);
  assert.equal(before.kcal, 330);
  // новая запись берёт новые КБЖУ
  assert.equal(Math.round(entryFor({ id: 'e2', product: edited, grams: 100, meal: 'lunch', date: '2026-11-02', now: 2 }).macros.kcal), 300);
});

test('Округление не накапливается: сумма дня — от неокруглённых снимков', () => {
  const p: FoodProduct = { id: 'local:x', name: 'Орехи', per100: { kcal: 100, protein: 3.33, fat: 1, carbs: 1 }, source: 'local' };
  const list: FoodEntry[] = Array.from({ length: 30 }, (_, i) => entryFor({ id: `e${i}`, product: p, grams: 33.3, meal: 'snack', date: '2026-11-01', now: i }));
  // 30 × 33,3 г × 1 ккал/г = 999 ккал; при округлении каждой записи до целых вышло бы 30 × 33 = 990
  assert.equal(sumMacros(list).kcal, 999);
  assert.equal(sumMacros(list).protein, 33.3);
});

test('Правка граммов туда-обратно не «уплывает», даже без продукта в кэше', () => {
  const p: FoodProduct = { id: 'off:1', name: 'Йогурт', per100: { kcal: 67, protein: 3.1, fat: 2.5, carbs: 7.9, fiber: 0.3 }, source: 'openfoodfacts' };
  const e0 = entryFor({ id: 'e', product: p, grams: 125, meal: 'snack', date: '2026-11-01', now: 1 });
  let e = e0;
  for (const g of [37, 412, 3, 999, 125]) e = rescaleEntry(e, g); // продукта нет — пропорционально снимку
  for (const k of ['kcal', 'protein', 'fat', 'carbs', 'fiber'] as const) assert.ok(Math.abs((e.macros[k] ?? 0) - (e0.macros[k] ?? 0)) < 1e-9, k);
  const withProduct = rescaleEntry(e0, 250, p, { id: 'serving', qty: 2, label: 'порция' });
  assert.equal(withProduct.macros.kcal, 167.5);
  assert.deepEqual(withProduct.unit, { id: 'serving', qty: 2, label: 'порция' });
  assert.equal(rescaleEntry(withProduct, 100, p).unit, undefined, 'единица сбрасывается при вводе в граммах');
});

test('Единицы: граммы всегда, порция из продукта, мл — для жидкостей', () => {
  const milk: FoodProduct = { id: 'local:milk', name: 'Молоко 2,5%', per100: { kcal: 52, protein: 2.8, fat: 2.5, carbs: 4.7 }, source: 'local' };
  assert.deepEqual(unitsFor(milk).map((u) => u.id), ['g', 'ml']);
  const bar = normalizeProduct({ id: 'custom:b', name: 'Батончик', per100: { kcal: 400, protein: 20, fat: 15, carbs: 45 }, source: 'custom', serving: { label: '1 шт', grams: 40 }, units: [{ id: 'piece', label: 'шт', grams: 40 }] });
  assert.deepEqual(unitsFor(bar).map((u) => `${u.id}:${u.grams}`), ['g:1', 'piece:40', 'serving:40']);
  assert.equal(gramsOf(2, { grams: 40 }), 80);
  assert.equal(gramsOf(1.5, { grams: 33.3 }), 50);
  assert.equal(gramsOf(-1, { grams: 40 }), 0);
  assert.equal(unitText(2, { id: 'piece', label: 'шт' }), '2 шт');
  assert.equal(unitText(1.5, { id: 'serving', label: 'порция' }), '1,5 порц.');
  assert.equal(unitText(2, { id: 'serving', label: 'порция' }), '2 порции');
});

test('Рецепт: КБЖУ на 100 г готового блюда учитывают уварку', () => {
  const ing = [
    { productId: 'local:buckwheat', name: 'Гречка', grams: 200, macros: macrosExact({ kcal: 313, protein: 12.6, fat: 3.3, carbs: 62.1, fiber: 10 }, 200) },
    { productId: 'local:chicken', name: 'Курица', grams: 300, macros: macrosExact({ kcal: 113, protein: 23.6, fat: 1.9, carbs: 0.4, fiber: 0 }, 300) },
  ];
  // Сырые 500 г, после варки 1000 г (крупа впитала воду): 100 г готового — вдвое легче 100 г сырой смеси
  const r = buildRecipe({ id: 'r1', name: '  Гречка с курицей ', ingredients: ing, cookedWeightG: 1000, servings: 4, now: 5 });
  assert.equal(r.name, 'Гречка с курицей');
  assert.equal(r.rawWeightG, 500);
  assert.equal(Math.round(r.per100.kcal * 10) / 10, 96.5); // (626 + 339) / 1000 × 100
  assert.equal(Math.round(r.per100.protein * 100) / 100, 9.6);
  assert.equal(Math.round((r.per100.fiber ?? 0) * 10) / 10, 2);
  assert.deepEqual(recipeYield(r), { totalG: 1000, servingG: 250 });
  const prod = recipeProduct(r);
  assert.equal(prod.id, 'recipe:r1');
  assert.equal(verificationOf(prod), 'label');
  const e = entryFor({ id: 'e', product: prod, grams: 250, meal: 'lunch', date: '2026-11-01', now: 1, unit: { id: 'serving', qty: 1, label: 'порция' } });
  assert.equal(e.recipeId, 'r1');
  assert.equal(Math.round(e.macros.kcal), 241); // порция = четверть блюда = 965 / 4
  // без веса готового — считается по сырому
  assert.equal(Math.round(buildRecipe({ id: 'r2', name: '', ingredients: ing, servings: 0, now: 1 }).per100.kcal), 193);
  assert.equal(buildRecipe({ id: 'r2', name: '', ingredients: ing, servings: 0, now: 1 }).servings, 1);
});

test('Рецепт: клетчатка неизвестна, если её нет хотя бы у одного ингредиента', () => {
  const r = buildRecipe({
    id: 'r',
    name: 'Салат',
    ingredients: [
      { productId: 'a', name: 'Огурец', grams: 100, macros: { kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.8, fiber: 1 } },
      { productId: 'b', name: 'Соус', grams: 30, macros: { kcal: 90, protein: 0, fat: 10, carbs: 0 } },
    ],
    servings: 1,
    now: 1,
  });
  assert.equal(r.per100.fiber, undefined);
});

// ── Аналитика 7 / 30 / 90 ────────────────────────────────────────────────

const TARGET = { kcal: 2500, protein: 150, fat: 80, carbs: 290, fiber: 35 } as unknown as NutritionTarget;
const TODAY = '2026-11-02';
const E = (date: string, meal: FoodEntry['meal'], kcal: number, extra: Partial<FoodEntry['macros']> = {}): FoodEntry => ({ id: `${date}-${meal}-${kcal}`, date, productId: 'x', name: 'x', grams: 100, macros: { kcal, protein: kcal / 20, fat: kcal / 40, carbs: kcal / 10, ...extra }, meal, createdAt: 1 });

test('Учтённый день: ≥ 2 приёмов или ≥ 800 ккал', () => {
  assert.equal(isCountedDay([]), false);
  assert.equal(isCountedDay([E(TODAY, 'breakfast', 300)]), false, 'один перекус — не учтён');
  assert.equal(isCountedDay([E(TODAY, 'breakfast', 300), E(TODAY, 'lunch', 200)]), true, 'два приёма');
  assert.equal(isCountedDay([E(TODAY, 'lunch', 500), E(TODAY, 'lunch', 300)]), true, 'один приём, но 800 ккал');
  assert.equal(isCountedDay([E(TODAY, 'lunch', 799.9)]), false);
});

test('Период: средние только по учтённым дням, сегодня не входит, дни без записей — null', () => {
  const entries = [
    E(addDays(TODAY, -1), 'breakfast', 1000), E(addDays(TODAY, -1), 'dinner', 1500), // учтён: 2500
    E(addDays(TODAY, -2), 'lunch', 2000), // учтён по ккал: 2000
    E(addDays(TODAY, -3), 'snack', 300), // не учтён
    E(TODAY, 'breakfast', 900), E(TODAY, 'lunch', 900), // сегодня — не в средних
    E(addDays(TODAY, -40), 'lunch', 5000), // вне периода
  ];
  const p = nutritionPeriod({ entries, target: TARGET, weights: [], days: 7, today: TODAY });
  assert.equal(p.counted, 2);
  assert.equal(p.logged, 3, 'дни с записями до сегодня');
  assert.equal(p.avg!.kcal, 2250);
  assert.equal(Math.round(p.pct!.kcal * 100), 90);
  assert.equal(p.perDay.length, 7);
  assert.deepEqual(p.perDay[p.perDay.length - 1], { date: TODAY, kcal: 1800, counted: false });
  assert.equal(p.perDay[0].kcal, null);
  assert.equal(p.avg!.fiber, null, 'клетчатки нет ни в одном дне');
  assert.equal(nutritionPeriod({ entries: [], target: TARGET, weights: [], days: 30, today: TODAY }).avg, null);
});

test('Связь с весом: нужно 14 учтённых дней и 4 взвешивания; иначе — сколько не хватает', () => {
  const entries: FoodEntry[] = [];
  for (let i = 1; i <= 20; i++) entries.push(E(addDays(TODAY, -i), 'breakfast', 1200), E(addDays(TODAY, -i), 'dinner', 1050));
  const few: WeightEntry[] = [3, 10].map((i) => ({ date: addDays(TODAY, -i), kg: 80 } as WeightEntry));
  const short = nutritionPeriod({ entries: entries.slice(0, 20), target: TARGET, weights: few, days: 30, today: TODAY });
  assert.deepEqual(short.weight, { ok: false, needDays: 4, needWeighIns: 2 });
  assert.equal(weightLinkText(short.weight), 'Недостаточно данных, чтобы связать питание с весом: нужно ещё 4 дня с записями и ещё 2 взвешивания.');
  // 20 учтённых дней по 2250 ккал (на 250 меньше цели), вес снижается
  const ws: WeightEntry[] = Array.from({ length: 10 }, (_, k) => ({ date: addDays(TODAY, -28 + k * 3), kg: 81 - k * 0.12 } as WeightEntry));
  const ok = nutritionPeriod({ entries, target: TARGET, weights: ws, days: 30, today: TODAY });
  assert.equal(ok.weight.ok, true);
  if (ok.weight.ok) {
    assert.equal(ok.weight.avgKcalDelta, -250);
    assert.ok(ok.weight.kgPerWeek < 0, `${ok.weight.kgPerWeek}`);
  }
  assert.match(weightLinkText(ok.weight), /^Вы ели в среднем на 250 ккал меньше цели, вес снижается примерно на 0,\d+ кг в неделю\.$/);
  assert.equal(weightLinkText({ ok: true, avgKcalDelta: 20, kgPerWeek: 0.01, weighIns: 8 }), 'Вы ели примерно по цели, вес почти не меняется.');
});
