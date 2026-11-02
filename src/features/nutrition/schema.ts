import type { DiaryDraft, FoodEntry, FoodProduct, FoodUnit, FoodVerification, ISODate, Macros, MealSlot, Recipe } from '@/types';

/**
 * Схема дневника питания v2 (docs/design/NUTRITION_SPEC.md §3) — чистые функции, покрыты тестом (scripts/nutrition-test.ts).
 *
 * Правила:
 *  • запись дневника хранит снимок КБЖУ: изменение продукта или рецепта прошлые записи не трогает;
 *  • КБЖУ считаются от граммов и per100 без округления; округляется только показ и итог (sumMacros);
 *  • ключ хранилища `form.nutrition` не меняется, версия растёт 1 → 2, старые данные переводятся migrateNutrition.
 */

export const NUTRITION_VERSION = 2;

/** КБЖУ порции без округления */
export function macrosExact(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  const m: Macros = { kcal: per100.kcal * k, protein: per100.protein * k, fat: per100.fat * k, carbs: per100.carbs * k };
  if (per100.fiber !== undefined) m.fiber = per100.fiber * k;
  return m;
}

/** Статус данных продукта: у записей v1 его нет — выводится из источника */
export function verificationOf(p: Pick<FoodProduct, 'source' | 'verification'>): FoodVerification {
  if (p.verification) return p.verification;
  if (p.source === 'local') return 'verified';
  if (p.source === 'custom' || p.source === 'recipe') return 'label';
  return 'database';
}

export const VERIFICATION_LABEL: Record<FoodVerification, string> = {
  verified: 'Проверено',
  database: 'Из базы продуктов',
  label: 'С этикетки — ваш продукт',
  estimate: 'Оценка по фото',
};

const ATTRIBUTION: Partial<Record<FoodProduct['source'], string>> = {
  openfoodfacts: 'Open Food Facts (ODbL)',
  usda: 'USDA FoodData Central',
};

/** Слова, по которым продукт считается жидкостью: для него предлагаются миллилитры */
const LIQUID = /(молок|кефир|йогурт питьев|сок\b|напит|вода|морс|компот|квас|ряженк|айран|тан\b|коктейл|смузи|чай|кофе|бульон|лимонад|кола|масло растит|оливков|подсолнечн)/i;

export function isLiquid(p: Pick<FoodProduct, 'name' | 'densityGPerMl'>): boolean {
  return p.densityGPerMl !== undefined || LIQUID.test(p.name);
}

/**
 * Единицы, доступные для продукта: всегда граммы, затем мл (жидкости), порция и свои единицы продукта.
 * Порядок: как человек скорее всего ввёл бы — штуки и порции раньше миллилитров.
 */
export function unitsFor(p: FoodProduct): FoodUnit[] {
  const out: FoodUnit[] = [{ id: 'g', label: 'г', grams: 1 }];
  const own = (p.units ?? []).filter((u) => u.id !== 'g' && u.grams > 0 && Number.isFinite(u.grams));
  for (const u of own) if (!out.some((x) => x.id === u.id && x.grams === u.grams)) out.push(u);
  if (p.serving && p.serving.grams > 0 && !out.some((u) => u.id === 'serving')) out.push({ id: 'serving', label: 'порция', grams: p.serving.grams });
  if (isLiquid(p) && !out.some((u) => u.id === 'ml')) out.push({ id: 'ml', label: 'мл', grams: p.densityGPerMl ?? 1 });
  return out;
}

/** Масса порции в граммах: «2 шт» → 2 × граммы одной штуки. Округление до 0,1 г — меньше весы не покажут */
export function gramsOf(qty: number, unit: Pick<FoodUnit, 'grams'>): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  // + 1e-9: 1,5 × 33,3 в двоичной арифметике = 49,9499…, а на весах это 50 г
  return Math.round(qty * unit.grams * 10 + 1e-9) / 10;
}

/** Подпись количества для дневника: «180 г», «2 шт», «1,5 порции» */
export function unitText(qty: number, unit: Pick<FoodUnit, 'id' | 'label'>): string {
  const n = String(Math.round(qty * 100) / 100).replace('.', ',');
  if (unit.id === 'serving') return `${n} ${qty === 1 ? 'порция' : qty > 1 && qty < 5 && Number.isInteger(qty) ? 'порции' : 'порц.'}`;
  return `${n} ${unit.label}`;
}

/** Продукт в формате v2: статус данных и атрибуция; единица «порция» из serving. Идемпотентно */
export function normalizeProduct(p: FoodProduct): FoodProduct {
  const out: FoodProduct = { ...p, verification: verificationOf(p) };
  if (!out.attribution && ATTRIBUTION[p.source]) out.attribution = ATTRIBUTION[p.source];
  if (p.serving && p.serving.grams > 0 && !(p.units ?? []).some((u) => u.id === 'serving')) out.units = [...(p.units ?? []), { id: 'serving', label: 'порция', grams: p.serving.grams }];
  return out;
}

/** Новая запись дневника из продукта: снимок КБЖУ без округления */
export function entryFor(args: { id: string; product: FoodProduct; grams: number; meal: MealSlot; date: ISODate; now: number; unit?: FoodEntry['unit']; recipeId?: string }): FoodEntry {
  const p = args.product;
  const e: FoodEntry = {
    id: args.id,
    date: args.date,
    productId: p.id,
    name: p.brand ? `${p.name} · ${p.brand}` : p.name,
    grams: args.grams,
    macros: macrosExact(p.per100, args.grams),
    meal: args.meal,
    createdAt: args.now,
  };
  if (args.unit) e.unit = args.unit;
  const recipeId = args.recipeId ?? (p.source === 'recipe' ? p.id.replace(/^recipe:/, '') : undefined);
  if (recipeId) e.recipeId = recipeId;
  if (p.verification === 'estimate') e.estimate = true;
  return e;
}

/**
 * Изменить массу записи. Если продукт ещё в кэше — от его per100; иначе — пропорционально снимку (без округления,
 * поэтому многократная правка туда-обратно не «уплывает»). Единица ввода сбрасывается, если не передана новая.
 */
export function rescaleEntry(e: FoodEntry, grams: number, product?: FoodProduct, unit?: FoodEntry['unit']): FoodEntry {
  const macros = product ? macrosExact(product.per100, grams) : scale(e.macros, e.grams > 0 ? grams / e.grams : 0);
  const next: FoodEntry = { ...e, grams, macros };
  if (unit) next.unit = unit;
  else delete next.unit;
  return next;
}

function scale(m: Macros, k: number): Macros {
  const out: Macros = { kcal: m.kcal * k, protein: m.protein * k, fat: m.fat * k, carbs: m.carbs * k };
  if (m.fiber !== undefined) out.fiber = m.fiber * k;
  return out;
}

// ── Рецепты ───────────────────────────────────────────────────────────────

/** Сумма КБЖУ ингредиентов (без округления) */
export function recipeTotals(ingredients: Recipe['ingredients']): Macros {
  const fibers = ingredients.filter((i) => i.macros.fiber !== undefined);
  const t: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const i of ingredients) {
    t.kcal += i.macros.kcal;
    t.protein += i.macros.protein;
    t.fat += i.macros.fat;
    t.carbs += i.macros.carbs;
  }
  // Клетчатка известна, только если она есть у всех ингредиентов — иначе сумма была бы занижена
  if (ingredients.length && fibers.length === ingredients.length) t.fiber = fibers.reduce((a, i) => a + (i.macros.fiber ?? 0), 0);
  return t;
}

/**
 * Рецепт из ингредиентов: КБЖУ на 100 г ГОТОВОГО блюда = сумма / вес готового × 100.
 * Уварка (вес меньше сырого) делает 100 г калорийнее, впитанная вода (вес больше) — наоборот.
 */
export function buildRecipe(args: { id: string; name: string; ingredients: Recipe['ingredients']; cookedWeightG?: number; servings: number; now: number; createdAt?: number }): Recipe {
  const raw = args.ingredients.reduce((a, i) => a + i.grams, 0);
  const cooked = args.cookedWeightG && args.cookedWeightG > 0 ? args.cookedWeightG : undefined;
  const total = recipeTotals(args.ingredients);
  const per100 = raw > 0 ? scale(total, 100 / (cooked ?? raw)) : { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const r: Recipe = {
    id: args.id,
    name: args.name.trim() || 'Мой рецепт',
    ingredients: args.ingredients,
    rawWeightG: raw,
    servings: Math.max(1, Math.round(args.servings) || 1),
    per100,
    createdAt: args.createdAt ?? args.now,
    updatedAt: args.now,
  };
  if (cooked) r.cookedWeightG = cooked;
  return r;
}

/** Вес готового блюда (если не взвешено — сумма сырых) и масса одной порции */
export function recipeYield(r: Recipe): { totalG: number; servingG: number } {
  const totalG = r.cookedWeightG ?? r.rawWeightG;
  return { totalG, servingG: r.servings > 0 ? totalG / r.servings : totalG };
}

/** Рецепт как продукт для дневника: id `recipe:<id>`, единица «порция» = выход / порции */
export function recipeProduct(r: Recipe): FoodProduct {
  const { servingG } = recipeYield(r);
  return {
    id: `recipe:${r.id}`,
    name: r.name,
    per100: r.per100,
    source: 'recipe',
    verification: 'label',
    serving: { label: 'порция', grams: Math.round(servingG) },
    units: [{ id: 'serving', label: 'порция', grams: Math.round(servingG * 10) / 10 }],
  };
}

// ── Миграция хранилища ──────────────────────────────────────────────────────

export interface NutritionPersisted {
  entries: FoodEntry[];
  products: Record<string, FoodProduct>;
  recent: string[];
  lastGrams: Record<string, number>;
  meals: { id: string; name: string; items: { productId: string; name: string; grams: number }[]; createdAt: number; uses: number }[];
  water: Record<ISODate, number>;
  favorites: string[];
  recipes: Recipe[];
  draft: DiaryDraft | null;
}

const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const obj = <T>(x: unknown): Record<string, T> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, T>) : {});

/**
 * Данные дневника любой прошлой версии (или резервной копии) → v2.
 * Записи дневника переносятся как есть — их снимки КБЖУ не пересчитываются. Продукты получают статус данных
 * и единицу «порция». Битые записи (без даты, граммов или КБЖУ) отбрасываются, а не роняют приложение.
 */
export function migrateNutrition(persisted: unknown, _fromVersion: number): NutritionPersisted {
  const st = obj<unknown>(persisted);
  const products: Record<string, FoodProduct> = {};
  for (const [k, p] of Object.entries(obj<FoodProduct>(st.products))) {
    if (p && typeof p === 'object' && typeof p.name === 'string' && p.per100 && typeof p.per100.kcal === 'number') products[k] = normalizeProduct(p);
  }
  const entries = arr<FoodEntry>(st.entries).filter(
    (e) => e && typeof e.date === 'string' && typeof e.grams === 'number' && e.macros && typeof e.macros.kcal === 'number' && typeof e.productId === 'string',
  );
  const draftRaw = st.draft as DiaryDraft | null | undefined;
  const draft = draftRaw && typeof draftRaw.date === 'string' && Array.isArray(draftRaw.items) ? { ...draftRaw, items: draftRaw.items.filter((i) => i && i.product && i.grams > 0).map((i) => ({ ...i, product: normalizeProduct(i.product) })) } : null;
  return {
    entries,
    products,
    recent: arr<string>(st.recent).filter((x) => typeof x === 'string'),
    lastGrams: obj<number>(st.lastGrams),
    meals: arr(st.meals),
    water: obj<number>(st.water),
    favorites: arr<string>(st.favorites).filter((x) => typeof x === 'string'),
    recipes: arr<Recipe>(st.recipes).filter((r) => r && typeof r.id === 'string' && r.per100),
    draft: draft && draft.items.length ? draft : null,
  };
}
