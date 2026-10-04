import type { ISODate } from '@/types';
import { matchMarker } from './catalog';
import { normalizeUnit } from './normalize';

/**
 * Разбор текста бланка анализов (текст из PDF, OCR, вставка) — детерминированно и без привязки к бренду.
 * Строка бланка обычно: «Название [код] значение [флаг] единица референс [флаг]», например:
 *   «Гемоглобин (HGB) 152 г/л 132 - 173»          (Инвитро)
 *   «Аланинаминотрансфераза (АЛТ) 52 Ед/л < 41 H»
 *   «Гематокрит 45.1 % 39.0 - 49.0»                (Хеликс)
 *   «Тестостерон общий ↑ 38,5 нмоль/л 8,64-29»
 * Результат ВСЕГДА показывается пользователю на экране «Проверьте распознанные данные» — без подтверждения
 * ничего не сохраняется (OCR и разбор могут ошибаться).
 */
export interface ParsedRow {
  name: string;
  markerId?: string;
  value: number;
  valueText: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
  flag?: 'H' | 'L';
  /** high — показатель из каталога и есть единица; low — стоит проверить внимательнее */
  confidence: 'high' | 'low';
}

export interface ParsedLab {
  lab?: string;
  date?: ISODate;
  rows: ParsedRow[];
}

const LABS: [RegExp, string][] = [
  [/инвитро|invitro/i, 'Инвитро'],
  [/хеликс|helix/i, 'Хеликс'],
  [/гемотест|gemotest/i, 'Гемотест'],
  [/\bkdl\b|кдл/i, 'KDL'],
  [/\bcmd\b|цмд|центр молекулярной диагностики/i, 'CMD'],
  [/ситилаб|citilab/i, 'Ситилаб'],
  [/лабквест|labquest/i, 'ЛабКвест'],
  [/днком|dnkom/i, 'DNKOM'],
  [/юнилаб|unilab/i, 'Юнилаб'],
  [/lab4u|лаб4ю/i, 'Lab4U'],
  [/мобил мед|mobil med/i, 'Мобил Мед'],
];

const num = (s: string) => parseFloat(s.replace(',', '.'));
const VALUE_RE = /^([<>≤≥]?)(\d+(?:[.,]\d+)?)([*↑↓]?)$/;
const FLAG_H = /^(h|↑|выше|повышен\S*)$/i;
const FLAG_L = /^(l|↓|ниже|понижен\S*)$/i;

function isoDate(d: string, m: string, y: string): ISODate | undefined {
  const yy = y.length === 2 ? `20${y}` : y;
  const dd = Number(d);
  const mm = Number(m);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return undefined;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function detectLab(text: string): string | undefined {
  return LABS.find(([re]) => re.test(text))?.[1];
}

/** Дата исследования: сначала рядом с «дата взятия/забора/исследования», иначе первая дата не из строки с датой рождения */
export function detectDate(text: string): ISODate | undefined {
  const near = text.match(/(?:дата|время)\s+(?:и\s+время\s+)?(?:взятия|забора|исследования|выполнения|регистрации|получения|поступления|сбора)[^0-9]{0,50}(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i);
  if (near) return isoDate(near[1], near[2], near[3]);
  for (const line of text.split(/\r?\n/)) {
    if (/рожд|г\.?\s?р\.|возраст|д\.?р\.?/i.test(line)) continue;
    const m = line.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return isoDate(m[1], m[2], m[3]);
  }
  return undefined;
}

function looksLikeUnit(t: string): boolean {
  if (!t) return false;
  if (VALUE_RE.test(t)) return false;
  if (t === '%') return true;
  return /[a-zа-яμµ%/^]/i.test(t) && t.length <= 22 && !/^(h|l)$/i.test(t);
}

function parseRef(rest: string): { refLow?: number; refHigh?: number; refText?: string } {
  const r = rest.replace(/\s+/g, ' ').trim();
  const range = r.match(/(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/);
  if (range) return { refLow: num(range[1]), refHigh: num(range[2]), refText: `${range[1]} – ${range[2]}` };
  const up = r.match(/(?:<|≤|до|менее)\s*(\d+(?:[.,]\d+)?)/i);
  if (up) return { refHigh: num(up[1]), refText: `< ${up[1]}` };
  const lo = r.match(/(?:>|≥|от|более|свыше)\s*(\d+(?:[.,]\d+)?)/i);
  if (lo) return { refLow: num(lo[1]), refText: `> ${lo[1]}` };
  return {};
}

/** Одна строка бланка → показатель (или null) */
export function parseLine(line: string): ParsedRow | null {
  const clean = line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length < 4 || clean.length > 220) return null;
  const tokens = clean.split(' ');
  let vi = -1;
  for (let i = 1; i < tokens.length; i++) {
    // «< 0,1» — знак отдельным токеном
    if (/^[<>≤≥]$/.test(tokens[i]) && VALUE_RE.test(tokens[i + 1] ?? '')) {
      tokens.splice(i, 2, tokens[i] + tokens[i + 1]);
    }
    if (VALUE_RE.test(tokens[i])) {
      vi = i;
      break;
    }
  }
  if (vi < 1) return null;
  let nameTokens = tokens.slice(0, vi);
  let flag: 'H' | 'L' | undefined;
  // флаг перед значением: «Тестостерон ↑ 38,5»
  while (nameTokens.length && (FLAG_H.test(nameTokens[nameTokens.length - 1]) || FLAG_L.test(nameTokens[nameTokens.length - 1]) || nameTokens[nameTokens.length - 1] === '*')) {
    const t = nameTokens.pop()!;
    if (FLAG_H.test(t)) flag = 'H';
    else if (FLAG_L.test(t)) flag = 'L';
  }
  const name = nameTokens.join(' ').replace(/[\s:.-]+$/, '').trim();
  if (!/[a-zа-яё]{2,}/i.test(name)) return null;
  const vm = tokens[vi].match(VALUE_RE)!;
  if (vm[3] === '↑') flag = 'H';
  if (vm[3] === '↓') flag = 'L';
  const value = num(vm[2]);
  let j = vi + 1;
  // флаг сразу после значения
  if (tokens[j] && (FLAG_H.test(tokens[j]) || FLAG_L.test(tokens[j]))) {
    flag = FLAG_H.test(tokens[j]) ? 'H' : 'L';
    j++;
  }
  let unitRaw = '';
  if (looksLikeUnit(tokens[j] ?? '')) {
    unitRaw = tokens[j];
    j++;
    // составные единицы: «10^9 /л», «мл/мин/1,73 м2», «г/ л»
    if (tokens[j] && (/^\/./.test(tokens[j]) || /^(м2|м²|кв\.?м)$/i.test(tokens[j]) || /\/$/.test(unitRaw))) {
      unitRaw += tokens[j];
      j++;
    }
  }
  const rest = tokens.slice(j).join(' ');
  const ref = parseRef(rest);
  for (const t of tokens.slice(j)) {
    if (/^(h|↑|выше)$/i.test(t)) flag = 'H';
    else if (/^(l|↓|ниже)$/i.test(t)) flag = 'L';
  }
  const marker = matchMarker(name);
  const unit = normalizeUnit(unitRaw);
  // Строка без показателя из каталога сохраняется только если похожа на результат (есть единица и референс)
  if (!marker && !(unit && (ref.refLow !== undefined || ref.refHigh !== undefined))) return null;
  // Отсечь служебные строки: телефоны, номера заказов, возраст
  if (/тел|заказ|инз|возраст|стр\.|страниц|лицензи|паспорт/i.test(name)) return null;
  return {
    name,
    markerId: marker?.id,
    value,
    valueText: vm[1] ? `${vm[1]}${vm[2]}` : vm[2],
    unit,
    ...ref,
    flag,
    confidence: marker && unit ? 'high' : 'low',
  };
}

export function parseLabText(text: string): ParsedLab {
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const r = parseLine(line);
    if (!r) continue;
    const key = r.markerId ?? r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return { lab: detectLab(text), date: detectDate(text), rows };
}
