import { Platform } from 'react-native';
import type { FoodProduct, Macros } from '@/types';
import { barcodeCandidates } from '@/features/food/scanner';

/**
 * Поиск продуктов в Open Food Facts (открытая база, есть русские продукты).
 * Приоритет — штрихкод. КБЖУ берутся только из базы/этикетки, AI их не «придумывает».
 */
const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_ru,generic_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url,quantity';
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

export function mapOffProduct(p: any): FoodProduct | null {
  if (!p) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']) ?? num(n['energy-kcal']);
  if (kcal === undefined) {
    const kj = num(n['energy_100g']) ?? num(n['energy-kj_100g']);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  const protein = num(n.proteins_100g);
  const fat = num(n.fat_100g);
  const carbs = num(n.carbohydrates_100g);
  if (kcal === undefined && protein === undefined && carbs === undefined) return null;
  const per100: Macros = {
    kcal: Math.round(kcal ?? (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9),
    protein: round1(protein ?? 0),
    fat: round1(fat ?? 0),
    carbs: round1(carbs ?? 0),
  };
  // Клетчатка — только если указана на этикетке/в базе; отсутствие ≠ 0
  const fiber = num(n.fiber_100g);
  if (fiber !== undefined && fiber >= 0 && fiber <= 100) per100.fiber = round1(fiber);
  if (per100.kcal > 950 || per100.protein > 100 || per100.fat > 100 || per100.carbs > 100) return null;
  const name = (p.product_name_ru || p.product_name || p.generic_name || '').trim();
  if (!name) return null;
  const code = String(p.code ?? '');
  const sq = num(p.serving_quantity);
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

function brandOf(b: unknown): string | undefined {
  const first = Array.isArray(b) ? b[0] : typeof b === 'string' ? b.split(',')[0] : undefined;
  const t = typeof first === 'string' ? first.trim() : '';
  return t || undefined;
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

/**
 * Поиск по штрихкоду: пробуем все записи одного кода (UPC-A ↔ EAN-13, GTIN-14, UPC-E — barcodeCandidates),
 * при сбое сети — один повтор. Продукт без КБЖУ — not_found с названием (partial), чтобы дополнить с этикетки.
 */
export async function lookupBarcode(code: string, type?: string): Promise<FoodProduct> {
  const list = barcodeCandidates(code, type);
  if (!list.length) throw new FoodApiError('not_found', 'Штрихкод прочитан с ошибкой — попробуй ещё раз');
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
    if (p) return p;
    const name = String(data.product.product_name_ru || data.product.product_name || data.product.generic_name || '').trim();
    if (name && !partial) partial = { name, brand: brandOf(data.product.brands) };
  }
  throw new FoodApiError('not_found', partial ? `«${partial.name}» есть в базе, но без КБЖУ` : 'Штрихкода нет в базе', partial);
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
