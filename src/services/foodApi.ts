import { Platform } from 'react-native';
import type { FoodProduct, Macros } from '@/types';
import { barcodeCandidates } from '@/features/food/scanner';

/**
 * Поиск продуктов по штрихкоду и названию. КБЖУ берутся только из баз и с этикетки, AI их не «придумывает».
 * Порядок по штрихкоду: свои продукты (экран сканера) → Open Food Facts (открытая база, много русских товаров) →
 * USDA FoodData Central (брендовые товары с GTIN) → UPCitemdb (только название — чтобы дописать КБЖУ с этикетки).
 * Продукт, созданный с этикетки, сохраняется со штрихкодом — в следующий раз находится сразу и офлайн.
 */
const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_ru,product_name_en,product_name_uk,product_name_be,product_name_kk,abbreviated_product_name,generic_name,generic_name_ru,brands,nutriments,nutrition_data_per,serving_size,serving_quantity,image_front_small_url,quantity';
const FDC = 'https://api.nal.usda.gov/fdc/v1';
const FDC_KEY = process.env.EXPO_PUBLIC_FDC_KEY || 'DEMO_KEY';
const TIMEOUT = 9000;

export class FoodApiError extends Error {
  constructor(
    public kind: 'offline' | 'timeout' | 'bad_response' | 'not_found',
    message: string,
    /** Продукт есть в базе, но без КБЖУ: название и бренд — чтобы создать его с этикетки в один шаг */
    public partial?: { name: string; brand?: string },
  ) {
    super(message);
  }
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 404) throw new FoodApiError('not_found', 'Продукт не найден');
      throw new FoodApiError('bad_response', `Сервер ответил ${res.status}`);
    }
    try {
      return await res.json();
    } catch {
      throw new FoodApiError('bad_response', 'Некорректный ответ сервера');
    }
  } catch (e: any) {
    if (e instanceof FoodApiError) throw e;
    if (e?.name === 'AbortError') throw new FoodApiError('timeout', 'Сервер не ответил вовремя');
    throw new FoodApiError('offline', 'Нет подключения к интернету');
  } finally {
    clearTimeout(t);
  }
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Название из любой доступной записи: русское → общее → английское → соседние языки → краткое */
export function offName(p: any): string {
  for (const k of ['product_name_ru', 'product_name', 'product_name_en', 'product_name_uk', 'product_name_be', 'product_name_kk', 'abbreviated_product_name', 'generic_name_ru', 'generic_name']) {
    const v = typeof p?.[k] === 'string' ? p[k].trim() : '';
    if (v) return v;
  }
  return '';
}

export function mapOffProduct(p: any): FoodProduct | null {
  if (!p) return null;
  const n = p.nutriments ?? {};
  const sq = num(p.serving_quantity);
  // На 100 г; если в базе только «на порцию» — пересчёт по массе порции
  const per = (key: string): number | undefined => {
    const v100 = num(n[`${key}_100g`]);
    if (v100 !== undefined) return v100;
    const vs = num(n[`${key}_serving`]);
    return vs !== undefined && sq && sq > 0 ? (vs * 100) / sq : undefined;
  };
  let kcal = per('energy-kcal') ?? (p.nutrition_data_per === '100g' ? num(n['energy-kcal']) : undefined);
  if (kcal === undefined) {
    const kj = per('energy') ?? per('energy-kj');
    if (kj !== undefined) kcal = kj / 4.184;
  }
  const protein = per('proteins');
  const fat = per('fat');
  const carbs = per('carbohydrates');
  if (kcal === undefined && protein === undefined && carbs === undefined) return null;
  const per100: Macros = {
    kcal: Math.round(kcal ?? (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9),
    protein: round1(protein ?? 0),
    fat: round1(fat ?? 0),
    carbs: round1(carbs ?? 0),
  };
  // Клетчатка — только если указана на этикетке/в базе; отсутствие ≠ 0
  const fiber = per('fiber');
  if (fiber !== undefined && fiber >= 0 && fiber <= 100) per100.fiber = round1(fiber);
  if (per100.kcal > 950 || per100.protein > 100 || per100.fat > 100 || per100.carbs > 100) return null;
  const name = offName(p);
  if (!name) return null;
  const code = String(p.code ?? '');
  return {
    id: `off:${code || name}`,
    name,
    brand: brandOf(p.brands),
    barcode: code || undefined,
    per100,
    serving: sq && sq > 0 && sq < 2000 ? { label: p.serving_size || `${sq} г`, grams: sq } : undefined,
    source: 'openfoodfacts',
    imageUrl: p.image_front_small_url,
    fetchedAt: Date.now(),
  };
}

/** Коды равны без ведущих нулей (UPC-A 12 ↔ EAN-13 ↔ GTIN-14) */
export const sameGtin = (a: string, b: string) => a.replace(/^0+/, '') === b.replace(/^0+/, '');

/** Брендовый продукт USDA FoodData Central (значения на 100 г) → продукт; только при совпадении GTIN */
export function mapFdcFood(f: any, code: string): FoodProduct | null {
  if (!f || typeof f.gtinUpc !== 'string' || !sameGtin(f.gtinUpc, code)) return null;
  const by = (id: number, name: RegExp) => {
    const x = (f.foodNutrients ?? []).find((n: any) => n.nutrientId === id || n.nutrient?.id === id || name.test(String(n.nutrientName ?? n.nutrient?.name ?? '')));
    return num(x?.value ?? x?.amount);
  };
  const kcal = by(1008, /^Energy$/i);
  const protein = by(1003, /^Protein$/i);
  const fat = by(1004, /^Total lipid/i);
  const carbs = by(1005, /^Carbohydrate, by difference$/i);
  if (kcal === undefined && protein === undefined && carbs === undefined) return null;
  const per100: Macros = { kcal: Math.round(kcal ?? (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9), protein: round1(protein ?? 0), fat: round1(fat ?? 0), carbs: round1(carbs ?? 0) };
  const fiber = by(1079, /^Fiber, total dietary$/i);
  if (fiber !== undefined && fiber >= 0 && fiber <= 100) per100.fiber = round1(fiber);
  if (per100.kcal > 950 || per100.protein > 100 || per100.fat > 100 || per100.carbs > 100) return null;
  const name = String(f.description ?? '').trim();
  if (!name) return null;
  const sq = num(f.servingSize);
  const grams = sq && /^(g|grm|ml|mlt)$/i.test(String(f.servingSizeUnit ?? '')) ? sq : undefined;
  return {
    id: `usda:${f.fdcId ?? code}`,
    name: name.charAt(0) + name.slice(1).toLowerCase(),
    brand: brandOf(f.brandName || f.brandOwner),
    barcode: code,
    per100,
    serving: grams && grams > 0 && grams < 2000 ? { label: f.householdServingFullText || `${grams} г`, grams } : undefined,
    source: 'usda',
    fetchedAt: Date.now(),
  };
}

/** UPCitemdb: только название и бренд (КБЖУ в этой базе нет) */
export function upcItemName(data: any): { name: string; brand?: string } | undefined {
  const it = Array.isArray(data?.items) ? data.items[0] : undefined;
  const name = typeof it?.title === 'string' ? it.title.trim() : '';
  return name ? { name: name.slice(0, 80), brand: brandOf(it.brand) } : undefined;
}

function brandOf(b: unknown): string | undefined {
  const first = Array.isArray(b) ? b[0] : typeof b === 'string' ? b.split(',')[0] : undefined;
  const t = typeof first === 'string' ? first.trim() : '';
  return t || undefined;
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

async function offLookup(list: string[]): Promise<{ product?: FoodProduct; partial?: FoodApiError['partial'] }> {
  let partial: FoodApiError['partial'];
  for (const c of list) {
    let data: any;
    try {
      data = await fetchJson(`${OFF}/api/v2/product/${c}.json?fields=${FIELDS}`).catch(async (e) => {
        if (e instanceof FoodApiError && (e.kind === 'timeout' || e.kind === 'bad_response')) return fetchJson(`${OFF}/api/v2/product/${c}.json?fields=${FIELDS}`);
        throw e;
      });
    } catch (e) {
      if (e instanceof FoodApiError && e.kind === 'not_found') continue;
      throw e;
    }
    if (!data || data.status === 0 || !data.product) continue;
    const p = mapOffProduct({ ...data.product, code: list[0] });
    if (p) return { product: p };
    const name = offName(data.product);
    if (name && !partial) partial = { name, brand: brandOf(data.product.brands) };
  }
  return { partial };
}

async function fdcLookup(list: string[]): Promise<FoodProduct | undefined> {
  // Ищем по самому длинному варианту (GTIN без лишних нулей хранится по-разному) — и сверяем код в ответе
  const q = list.find((c) => c.length === 12) ?? list[0];
  const data = await fetchJson(`${FDC}/foods/search?api_key=${encodeURIComponent(FDC_KEY)}&dataType=Branded&pageSize=5&query=${q}`);
  for (const f of Array.isArray(data?.foods) ? data.foods : []) {
    const p = mapFdcFood(f, list[0]);
    if (p) return p;
  }
  return undefined;
}

/**
 * Поиск по штрихкоду: все записи одного кода (UPC-A ↔ EAN-13, GTIN-14, UPC-E — barcodeCandidates) по очереди
 * в нескольких базах. Нет сети — сразу «нет подключения». Продукт без КБЖУ — not_found с названием (partial),
 * чтобы дописать КБЖУ с этикетки и сохранить продукт со штрихкодом в свою базу.
 */
export async function lookupBarcode(code: string, type?: string): Promise<FoodProduct> {
  const list = barcodeCandidates(code, type);
  if (!list.length) throw new FoodApiError('not_found', 'Штрихкод прочитан с ошибкой — попробуй ещё раз');
  const off = await offLookup(list);
  if (off.product) return off.product;
  let partial = off.partial;
  // Запасные базы: их сбой не должен прятать результат — просто идём дальше
  const fdc = await fdcLookup(list).catch(() => undefined);
  if (fdc) return fdc;
  if (!partial) partial = await fetchJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${list[0]}`).then(upcItemName).catch(() => undefined);
  throw new FoodApiError('not_found', partial ? `«${partial.name}» нашёлся, но без КБЖУ` : 'Штрихкода нет в базах', partial);
}

/**
 * Поиск по названию: сначала новый поисковый сервис OFF (search-a-licious), при сбое — классический API.
 */
export async function searchProducts(query: string, page = 1): Promise<FoodProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  let raw: any[] | null = null;
  let lastErr: unknown;
  try {
    const data = await fetchJson(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=30&page=${page}&langs=ru,en&fields=${FIELDS}`);
    if (data && Array.isArray(data.hits)) raw = data.hits;
  } catch (e) {
    lastErr = e;
  }
  if (!raw) {
    try {
      const data = await fetchJson(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&page=${page}&fields=${FIELDS}`);
      if (data && Array.isArray(data.products)) raw = data.products;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!raw) throw lastErr instanceof FoodApiError ? lastErr : new FoodApiError('bad_response', 'Некорректный ответ базы продуктов');
  const out: FoodProduct[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const p = mapOffProduct(r);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

export function foodErrorText(e: unknown): string {
  if (e instanceof FoodApiError) {
    if (e.kind === 'offline')
      return Platform.OS === 'web'
        ? 'Web-превью: браузер блокирует запрос к базе продуктов (CORS) или нет сети. На iPhone поиск работает; здесь доступны штрихкод, базовые и недавние продукты.'
        : 'Нет интернета. Доступны базовые продукты и твои недавние — они работают офлайн.';
    if (e.kind === 'timeout') return 'База продуктов не отвечает. Попробуй ещё раз или выбери из базовых.';
    if (e.kind === 'not_found') return e.message;
    return 'База продуктов вернула ошибку. Попробуй позже.';
  }
  return 'Не удалось выполнить поиск.';
}
