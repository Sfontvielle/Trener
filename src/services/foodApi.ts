import { Platform } from 'react-native';
import type { FoodProduct, Macros } from '@/types';

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

export async function lookupBarcode(code: string): Promise<FoodProduct> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 8) throw new FoodApiError('not_found', 'Некорректный штрихкод');
  const data = await fetchJson(`${OFF}/api/v2/product/${clean}.json?fields=${FIELDS}`);
  if (!data || data.status === 0 || !data.product) throw new FoodApiError('not_found', 'Штрихкод не найден в базе');
  const p = mapOffProduct({ ...data.product, code: clean });
  if (!p) throw new FoodApiError('not_found', 'В базе нет КБЖУ для этого продукта');
  return p;
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
