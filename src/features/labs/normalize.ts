import { BIOMARKER_BY_ID } from './catalog';

/**
 * Единицы: приведение записи к одному виду и безопасный пересчёт в каноническую единицу показателя.
 * Исходные значения не меняются — normalized хранится рядом (см. LabResult.normalized).
 */
const UNIT_ALIASES: [RegExp, string][] = [
  [/^g\/l$/, 'г/л'],
  [/^g\/dl$/, 'г/дл'],
  [/^mmol\/l$/, 'ммоль/л'],
  [/^[μµu]mol\/l$/, 'мкмоль/л'],
  [/^мкм\/л$/, 'мкмоль/л'],
  [/^pmol\/l$/, 'пмоль/л'],
  [/^nmol\/l$/, 'нмоль/л'],
  [/^mg\/dl$/, 'мг/дл'],
  [/^mg\/l$/, 'мг/л'],
  [/^ng\/dl$/, 'нг/дл'],
  [/^ng\/ml$/, 'нг/мл'],
  [/^pg\/ml$/, 'пг/мл'],
  [/^[μµu]g\/l$/, 'мкг/л'],
  [/^(u|iu|ед|ме)\/l$/, 'ед/л'],
  [/^(ед|ме)\/л$/, 'ед/л'],
  [/^(m?iu|мме|мед|мме)\/ml$/, 'мед/мл'],
  [/^(мме|мме)\/мл$/, 'мед/мл'],
  [/^мед\/мл$/, 'мед/мл'],
  [/^(miu|mu)\/l$/, 'мед/л'],
  [/^(мме|мед)\/л$/, 'мед/л'],
  [/^(мкме|мкед|[μµu]iu|[μµu]u)\/мл$/, 'мкед/мл'],
  [/^(мкме|мкед|[μµu]iu|[μµu]u)\/ml$/, 'мкед/мл'],
  [/^fl$/, 'фл'],
  [/^pg$/, 'пг'],
  [/^mm\/h(our)?$/, 'мм/ч'],
  [/^мм\/час$/, 'мм/ч'],
  [/^l\/l$/, 'л/л'],
  [/^(10\^?12|10\*12|x10\^12|×10\^12|10e12)\/(l|л)$/, '10^12/л'],
  [/^(10\^?9|10\*9|x10\^9|×10\^9|10e9|тыс\/мкл)\/?(l|л)?$/, '10^9/л'],
];

export function normalizeUnit(raw: string | undefined): string {
  if (!raw) return '';
  let u = raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, '')
    .replace(/²/g, '2')
    .replace(/,/g, ',');
  if (u === '%' || u === 'проц') return '%';
  for (const [re, to] of UNIT_ALIASES) if (re.test(u)) return to;
  // кириллица/латиница: «мкмоль/л», «ммоль/л» уже в нужном виде
  u = u.replace(/^мл\/мин\/1[.,]73(м2|кв\.?м)?$/, 'мл/мин/1,73м2');
  return u;
}

/** Множитель из единицы записи в каноническую для показателя; undefined — пересчёт неоднозначен */
export function conversionFactor(markerId: string, unit: string): number | undefined {
  const b = BIOMARKER_BY_ID[markerId];
  if (!b) return undefined;
  const u = normalizeUnit(unit);
  if (!u || u === b.unit) return 1;
  return b.units?.[u];
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Пересчёт значения и референса в каноническую единицу (если однозначно) */
export function toCanonical(markerId: string, value: number, unit: string, refLow?: number, refHigh?: number): { value: number; unit: string; refLow?: number; refHigh?: number } | undefined {
  const k = conversionFactor(markerId, unit);
  if (k === undefined) return undefined;
  const b = BIOMARKER_BY_ID[markerId];
  return {
    value: round(value * k),
    unit: b.unit,
    refLow: refLow !== undefined ? round(refLow * k) : undefined,
    refHigh: refHigh !== undefined ? round(refHigh * k) : undefined,
  };
}
