/**
 * Справка из русской Википедии для вопросов, на которые во встроенной базе тренера нет ответа (R1: «умнее без
 * платного API»). Публичный API без ключа; уходит только текст вопроса (без профиля и данных), ответ — краткое
 * введение статьи со ссылкой. Нет сети, нет подходящей статьи или тема препаратов — null, тренер отвечает сам.
 */
const API = 'https://ru.wikipedia.org';

/** Препараты и дозировки в справочный поиск не отправляем: схем и доз тренер не даёт (политика безопасности) */
const DRUG_RE = /(стероид|анабол|тестостерон|нандрол|тренбол|станоз|оксандр|метан|болденон|примоболан|мастерон|гормон\S* рост|инсулин|кленбут|сарм|остарин|лигандрол|пептид|тироксин|днф|диуретик|курс|доз|мг|мкг|ед\.?\b|таблет|укол|инъекц)/i;

const STOP = new Set(['что', 'такое', 'это', 'как', 'зачем', 'почему', 'когда', 'где', 'кто', 'какой', 'какая', 'какое', 'какие', 'ли', 'мне', 'меня', 'мой', 'моя', 'мои', 'для', 'про', 'расскажи', 'объясни', 'скажи', 'можно', 'нужно', 'надо', 'ты', 'вы', 'и', 'а', 'в', 'на', 'с', 'со', 'о', 'об', 'по', 'у', 'к', 'от', 'до', 'из', 'же', 'бы', 'есть', 'был', 'чем', 'чего', 'такой', 'такая', 'знаешь', 'подробнее']);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));

/** Ключевые слова вопроса для поиска; пусто или тема препаратов — null */
export function wikiQuery(question: string): string | null {
  if (DRUG_RE.test(question)) return null;
  const w = words(question);
  return w.length ? w.slice(0, 6).join(' ') : null;
}

/** Статья подходит, только если её название делит с вопросом хотя бы одну основу слова (первые 5 букв) */
export function relevantTitle(question: string, titles: string[]): string | null {
  const stems = new Set(words(question).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
  for (const t of titles) {
    if (DRUG_RE.test(t)) continue;
    if (words(t).some((w) => stems.has(w.slice(0, 5)))) return t;
  }
  return null;
}

/** Первые 2–3 предложения введения, не длиннее ~600 знаков; убраны сноски и пустые скобки */
export function shortExtract(text: string, max = 600): string {
  const clean = text.replace(/\[\d+\]/g, '').replace(/\(\s*[;,]?\s*\)/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).length > max) break;
    out += s;
    if (out.length > max * 0.6 && /[.!?]\s*$/.test(out)) break;
  }
  return (out || clean.slice(0, max)).trim();
}

async function getJson<T>(url: string, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    // Википедия просит представляться: имя приложения, без данных пользователя
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'Api-User-Agent': 'RYNJI-iOS/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export interface WikiAnswer {
  title: string;
  text: string;
  url: string;
}

export async function wikiAnswer(question: string, ms = 5000): Promise<WikiAnswer | null> {
  const q = wikiQuery(question);
  if (!q) return null;
  try {
    const s = await getJson<{ query?: { search?: { title: string }[] } }>(`${API}/w/api.php?action=query&list=search&srlimit=5&format=json&origin=*&srsearch=${encodeURIComponent(q)}`, ms);
    const title = relevantTitle(question, (s.query?.search ?? []).map((x) => x.title));
    if (!title) return null;
    const p = await getJson<{ type?: string; title?: string; extract?: string; content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } } }>(`${API}/api/rest_v1/page/summary/${encodeURIComponent(title)}`, ms);
    if (p.type === 'disambiguation' || !p.extract) return null;
    const text = shortExtract(p.extract);
    if (text.length < 60) return null;
    return { title: p.title ?? title, text, url: p.content_urls?.mobile?.page ?? p.content_urls?.desktop?.page ?? `${API}/wiki/${encodeURIComponent(title)}` };
  } catch {
    return null;
  }
}
