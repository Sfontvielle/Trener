import type { FoodProduct, FoodVerification } from '@/types';
import { SYNONYM_INDEX } from '@/data/foodSynonyms';

/**
 * Поиск продуктов: нормализация запроса, синонимы, опечатки и ранжирование (NUTRITION_SPEC.md §4).
 * Чистые функции — покрыты тестом scripts/food-search-test.ts.
 */

/** Текст для сравнения: регистр, ё → е, «5 %» = «5%», «2,5» = «2.5», без знаков препинания и лишних пробелов */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\d)\s*[,.]\s*(\d)/g, '$1.$2')
    .replace(/(\d)\s*%/g, '$1%')
    .replace(/[«»"'`’()[\]{}!?;:,/\\|+*–—-]+/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Латиница → кириллица для брендов, набранных в английской раскладке: «prostokvashino» → «простоквашино»
const MULTI: [string, string][] = [
  ['shch', 'щ'],
  ['sch', 'щ'],
  ['zh', 'ж'],
  ['kh', 'х'],
  ['ts', 'ц'],
  ['ch', 'ч'],
  ['sh', 'ш'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['yo', 'е'],
  ['ye', 'е'],
];
const SINGLE: Record<string, string> = { a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс', y: 'ы', z: 'з' };

export function translit(word: string): string {
  if (!/[a-z]/.test(word)) return word;
  let out = '';
  for (let i = 0; i < word.length; ) {
    const m = MULTI.find(([lat]) => word.startsWith(lat, i));
    if (m) {
      out += m[1];
      i += m[0].length;
      continue;
    }
    out += SINGLE[word[i]] ?? word[i];
    i += 1;
  }
  // «-ый» на конце латиницей обычно «-ий»/«-ый»; «y» в середине слова чаще «и»
  return out.replace(/ы(?=[аеиоуэюя])/g, 'й');
}

export interface NormalizedQuery {
  /** Исходный запрос — его получает сеть */
  raw: string;
  /** Нормализованный текст */
  text: string;
  tokens: string[];
  /** Для каждого слова: само слово и транслитерация (direct), синонимы и виды категории (syn) */
  variants: { direct: string[]; syn: string[] }[];
  /** Похоже на штрихкод (только цифры, 8–14) */
  barcode: boolean;
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const text = normalizeText(raw);
  const tokens = text ? text.split(' ') : [];
  const variants = tokens.map((t) => {
    const direct = [...new Set([t, translit(t)])];
    const syn = new Set<string>();
    for (const w of direct) for (const x of SYNONYM_INDEX.get(w) ?? []) if (!direct.includes(x)) syn.add(x);
    return { direct, syn: [...syn] };
  });
  return { raw: raw.trim(), text, tokens, variants, barcode: /^\d{8,14}$/.test(raw.trim()) };
}

/**
 * Расстояние Дамерау–Левенштейна (оптимальное выравнивание строк): вставка, удаление, замена, перестановка соседних.
 * «тварог» → «творог» = 1, «твроог» → «творог» = 1.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Допустимое число опечаток: ≤ 1 для слов до 6 букв, ≤ 2 для длинных; короче 4 букв — без опечаток */
export function typoLimit(word: string): number {
  if (word.length < 4) return 0;
  return word.length <= 6 ? 1 : 2;
}

/** Качество совпадения: точное название · с начала слова · внутри слова · с опечаткой · нет */
export type MatchKind = 'exact' | 'prefix' | 'contains' | 'typo' | 'none';
const KIND_RANK: Record<MatchKind, number> = { exact: 4, prefix: 3, contains: 2, typo: 1, none: 0 };

function tokenMatch(v: { direct: string[]; syn: string[] }, words: string[], allowTypos: boolean): MatchKind {
  let best: MatchKind = 'none';
  const up = (k: MatchKind) => {
    if (KIND_RANK[k] > KIND_RANK[best]) best = k;
  };
  for (const d of v.direct) {
    for (const w of words) {
      if (w.startsWith(d)) return 'prefix';
      if (d.length >= 3 && w.includes(d)) up('contains');
    }
  }
  // Через синоним — ниже прямого совпадения: «курица» сначала найдёт «курицу», потом «куриное филе»
  for (const x of v.syn) if (words.some((w) => w.startsWith(x))) up('contains');
  if (best !== 'none' || !allowTypos) return best;
  const word = v.direct[0];
  const lim = typoLimit(word);
  if (!lim || /\d/.test(word)) return 'none';
  for (const w of words) {
    // Сравнение с целым словом и с его началом той же длины: «тварог» ~ «творог», «тварож» ~ «творожок»
    if (editDistance(word, w, lim) <= lim || (w.length > word.length && editDistance(word, w.slice(0, word.length), lim) <= lim)) return 'typo';
  }
  return 'none';
}

/** Насколько продукт подходит под запрос. Все слова запроса должны найтись (с синонимами и опечатками) */
export function matchProduct(q: NormalizedQuery, p: Pick<FoodProduct, 'name' | 'brand' | 'barcode'>, opts: { typos: boolean; aliases?: string } = { typos: true }): MatchKind {
  if (!q.tokens.length) return 'none';
  if (q.barcode) return p.barcode && p.barcode.replace(/^0+/, '') === q.raw.replace(/^0+/, '') ? 'exact' : 'none';
  const name = normalizeText(p.name);
  const brand = p.brand ? normalizeText(p.brand) : '';
  if (q.text === name || (brand && (q.text === brand || q.text === `${name} ${brand}` || q.text === `${brand} ${name}`))) return 'exact';
  const words = `${name} ${brand} ${opts.aliases ? normalizeText(opts.aliases) : ''}`.split(' ').filter(Boolean);
  let worst: MatchKind = 'exact';
  for (const variants of q.variants) {
    const k = tokenMatch(variants, words, opts.typos);
    if (k === 'none') return 'none';
    if (KIND_RANK[k] < KIND_RANK[worst]) worst = k;
  }
  return worst === 'exact' ? 'prefix' : worst;
}

// ── Ранжирование ────────────────────────────────────────────────────────────

export interface RankContext {
  favorites: Set<string>;
  /** Сколько раз продукт записан за 30 дней */
  freq30: Map<string, number>;
}

const VERIFY_RANK: Record<FoodVerification, number> = { verified: 3, database: 2, label: 1, estimate: 0 };

function verification(p: FoodProduct): FoodVerification {
  if (p.verification) return p.verification;
  return p.source === 'local' ? 'verified' : p.source === 'custom' || p.source === 'recipe' ? 'label' : 'database';
}

/** Полнота данных: известна клетчатка, есть порция */
export function completeness(p: FoodProduct): number {
  return (p.per100.fiber !== undefined ? 1 : 0) + (p.serving || p.units?.length ? 1 : 0) + (p.imageUrl ? 0.5 : 0);
}

export interface Ranked {
  product: FoodProduct;
  match: MatchKind;
  key: number[];
}

/**
 * Порядок результатов (по убыванию важности): 1) избранное и свои продукты; 2) уже ели (частота за 30 дней);
 * 3) точное совпадение названия или бренда; 4) совпадение с начала слова; 5) статус данных; 6) полнота данных;
 * 7) тип источника — базовые для «сырых» запросов, брендовые, если в запросе бренд. Дальше — короче название.
 */
export function rankProducts(q: NormalizedQuery, list: { product: FoodProduct; match: MatchKind }[], ctx: RankContext): Ranked[] {
  const brandWanted = list.some((x) => x.product.brand && q.tokens.some((t) => normalizeText(x.product.brand!).split(' ').some((w) => w.startsWith(t) || w.startsWith(translit(t)))));
  const ranked = list.map(({ product: p, match }) => {
    const own = ctx.favorites.has(p.id) || p.source === 'custom' || p.source === 'recipe' ? 1 : 0;
    const freq = Math.min(ctx.freq30.get(p.id) ?? 0, 20);
    const sourcePref = brandWanted ? (p.brand ? 1 : 0) : p.source === 'local' ? 1 : 0;
    return { product: p, match, key: [own, freq, match === 'exact' ? 1 : 0, KIND_RANK[match], VERIFY_RANK[verification(p)], completeness(p), sourcePref, -p.name.length] };
  });
  return ranked.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i];
    return a.product.name.localeCompare(b.product.name, 'ru');
  });
}

const gtin = (code: string) => code.replace(/\D/g, '').replace(/^0+/, '');

/**
 * Дубли склеиваются: один id или один штрихкод (UPC-A ↔ EAN-13) из разных баз. Остаётся запись, которую человек
 * уже знает (свой продукт, избранное, ел), иначе — с лучшим статусом и полнотой данных.
 */
export function dedupeProducts(list: FoodProduct[], ctx: RankContext): FoodProduct[] {
  const score = (p: FoodProduct) => (p.source === 'custom' ? 100 : 0) + (ctx.favorites.has(p.id) ? 50 : 0) + Math.min(ctx.freq30.get(p.id) ?? 0, 20) + VERIFY_RANK[verification(p)] * 2 + completeness(p);
  const byKey = new Map<string, FoodProduct>();
  const order: string[] = [];
  for (const p of list) {
    const key = p.barcode && gtin(p.barcode) ? `b:${gtin(p.barcode)}` : `i:${p.id}`;
    const idKey = `i:${p.id}`;
    const existingKey = byKey.has(key) ? key : byKey.has(idKey) ? idKey : null;
    if (!existingKey) {
      byKey.set(key, p);
      order.push(key);
      continue;
    }
    const prev = byKey.get(existingKey)!;
    if (score(p) > score(prev)) byKey.set(existingKey, p);
  }
  return order.map((k) => byKey.get(k)!);
}
