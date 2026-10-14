import type { BodyMetric, ISODate, Sex, VolumeMuscle, WeightEntry } from '@/types';
import { daysBetween } from '@/utils/date';

/**
 * Анализ тела по замерам — детерминированно, на устройстве (фото дополняет его через сервер, см. bodyPhoto.ts).
 *
 * Процент жира — лучший доступный способ, всегда ДИАПАЗОНОМ:
 *   1. свежий замер прибором (весы-анализатор, калипер) — ±2 п.п.;
 *   2. формула ВМС США по шее, талии (и бёдрам у женщин) — Hodgdon & Beckett 1984, ошибка ~±3,5 п.п.;
 *   3. RFM по росту и талии — Woolcott & Bergman 2018, ~±4,5 п.п.;
 *   4. по ИМТ и возрасту — Deurenberg 1991, грубо, ±5 п.п.
 * Пропорции: талия/рост (≥0,5 — риск абдоминального жира, Ashwell 2012), талия/бёдра (ВОЗ: >0,90 м / >0,85 ж),
 * грудь/талия и бедро/рука — ориентиры пропорций RYNJI (ЭВРИСТИКА, не норма).
 * Локально жир не «сжигается» — зоны жира подсказывают, где он уходит последним, а не что качать.
 * Это не медицинская оценка.
 */
export type BodyZone = 'belly' | 'sides' | 'hips' | 'chest' | 'shoulders' | 'back' | 'arms' | 'legs' | 'glutes';

export const ZONE_LABEL: Record<BodyZone, string> = {
  belly: 'Живот',
  sides: 'Бока',
  hips: 'Бёдра',
  chest: 'Грудь',
  shoulders: 'Плечи',
  back: 'Спина',
  arms: 'Руки',
  legs: 'Ноги',
  glutes: 'Ягодицы',
};

/** Мышцы для акцента в плане — по зоне */
export const ZONE_MUSCLES: Partial<Record<BodyZone, VolumeMuscle[]>> = {
  chest: ['chest'],
  shoulders: ['side_delts', 'rear_delts'],
  back: ['lats', 'upper_back'],
  arms: ['biceps', 'triceps'],
  legs: ['quads', 'hamstrings'],
  glutes: ['glutes'],
};

export type BfMethod = 'measured' | 'navy' | 'rfm' | 'bmi' | 'photo';

export const BF_METHOD_LABEL: Record<BfMethod, string> = {
  measured: 'по замеру прибором',
  navy: 'по шее и талии (формула ВМС США)',
  rfm: 'по росту и талии (RFM)',
  bmi: 'по росту, весу и возрасту — грубо',
  photo: 'по фото и замерам',
};

export interface BodyFatEstimate {
  value: number;
  low: number;
  high: number;
  method: BfMethod;
}

export type BfLevel = 'athletic' | 'fit' | 'average' | 'high';

export const BF_LEVEL_LABEL: Record<BfLevel, string> = {
  athletic: 'атлетичный уровень',
  fit: 'хорошая форма',
  average: 'средний уровень',
  high: 'есть запас жира',
};

export interface Ratio {
  key: 'whtr' | 'whr' | 'chestWaist' | 'thighArm';
  label: string;
  value: number;
  ok: boolean;
  text: string;
}

export interface ZoneNote {
  zone: BodyZone;
  text: string;
}

export interface BodyAnalysis {
  bodyFat: BodyFatEstimate | null;
  level: BfLevel | null;
  ratios: Ratio[];
  fatZones: ZoneNote[];
  lagging: ZoneNote[];
  /** Зоны для акцента в тренировках — с мышцами для плана */
  focus: { zone: BodyZone; why: string; muscles: VolumeMuscle[] }[];
  trend: { text: string; tone: 'good' | 'warn' | 'neutral'; days: number } | null;
  /** Каких замеров не хватает для точности */
  missing: BodyMetric['kind'][];
}

export interface BodyInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  metrics: BodyMetric[];
  weights?: WeightEntry[];
  today: ISODate;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const clampBf = (x: number) => Math.max(3, Math.min(60, x));
const fmt = (x: number, d = 2) => x.toFixed(d).replace('.', ',');

/** Последний замер каждого вида не старше maxDays */
export function latestMetrics(metrics: BodyMetric[], today: ISODate, maxDays = 60): Partial<Record<BodyMetric['kind'], BodyMetric>> {
  const out: Partial<Record<BodyMetric['kind'], BodyMetric>> = {};
  for (const m of metrics) {
    if (daysBetween(m.date, today) > maxDays || m.date > today) continue;
    const cur = out[m.kind];
    if (!cur || cur.date <= m.date) out[m.kind] = m;
  }
  return out;
}

export function navyBodyFat(sex: Sex, heightCm: number, waist: number, neck: number, hips?: number): number | null {
  if (sex === 'male') {
    if (waist - neck <= 0) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450;
  }
  if (!hips || waist + hips - neck <= 0) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(heightCm)) - 450;
}

export const rfmBodyFat = (sex: Sex, heightCm: number, waist: number) => (sex === 'male' ? 64 : 76) - (20 * heightCm) / waist;

export function bmiBodyFat(sex: Sex, age: number, heightCm: number, weightKg: number): number {
  const bmi = weightKg / (heightCm / 100) ** 2;
  return 1.2 * bmi + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;
}

export function estimateBodyFat(i: BodyInput): BodyFatEstimate {
  const m = latestMetrics(i.metrics, i.today);
  const make = (v: number, spread: number, method: BfMethod): BodyFatEstimate => {
    const value = r1(clampBf(v));
    return { value, low: r1(clampBf(value - spread)), high: r1(clampBf(value + spread)), method };
  };
  if (m.bodyfat && daysBetween(m.bodyfat.date, i.today) <= 30) return make(m.bodyfat.value, 2, 'measured');
  if (m.waist && m.neck) {
    const v = navyBodyFat(i.sex, i.heightCm, m.waist.value, m.neck.value, m.hips?.value);
    if (v !== null && Number.isFinite(v)) return make(v, 3.5, 'navy');
  }
  if (m.waist) return make(rfmBodyFat(i.sex, i.heightCm, m.waist.value), 4.5, 'rfm');
  return make(bmiBodyFat(i.sex, i.age, i.heightCm, i.weightKg), 5, 'bmi');
}

/** Уровень по ориентирам ACE (для мужчин и женщин — разные границы) */
export function bfLevel(sex: Sex, bf: number): BfLevel {
  const [a, f, avg] = sex === 'male' ? [14, 18, 25] : [21, 25, 32];
  return bf < a ? 'athletic' : bf < f ? 'fit' : bf < avg ? 'average' : 'high';
}

export function analyzeBody(i: BodyInput): BodyAnalysis {
  const m = latestMetrics(i.metrics, i.today);
  const bodyFat = i.heightCm > 0 && i.weightKg > 0 ? estimateBodyFat(i) : null;
  const level = bodyFat ? bfLevel(i.sex, bodyFat.value) : null;
  const male = i.sex === 'male';
  const ratios: Ratio[] = [];
  const fat = new Map<BodyZone, string>();
  const lag = new Map<BodyZone, string>();

  const waist = m.waist?.value;
  if (waist) {
    const whtr = waist / i.heightCm;
    const ok = whtr < 0.5;
    ratios.push({ key: 'whtr', label: 'Талия / рост', value: whtr, ok, text: ok ? 'меньше 0,5 — хорошо' : 'от 0,5 — основной запас жира на животе' });
    if (!ok) fat.set('belly', `талия ${fmt(whtr)} от роста — жир в первую очередь на животе`);
  }
  if (waist && m.hips) {
    const whr = waist / m.hips.value;
    const lim = male ? 0.9 : 0.85;
    const ok = whr <= lim;
    ratios.push({ key: 'whr', label: 'Талия / бёдра', value: whr, ok, text: ok ? `до ${fmt(lim)} — хорошо` : `выше ${fmt(lim)} — жир скорее на животе и боках` });
    if (!ok) {
      fat.set('belly', fat.get('belly') ?? `талия ${fmt(whr)} от бёдер — жир на животе`);
      fat.set('sides', 'бока уходят вместе с животом');
    } else if (!male && level === 'high' && whr < 0.75) fat.set('hips', 'запас жира скорее на бёдрах и ягодицах — это типично и уходит последним');
  }
  if (male && waist && m.chest) {
    const cw = m.chest.value / waist;
    const ok = cw >= 1.25;
    ratios.push({ key: 'chestWaist', label: 'Грудь / талия', value: cw, ok, text: ok ? 'выраженный «V»-силуэт' : 'меньше 1,25 — верх тела стоит развивать' });
    if (!ok) {
      lag.set('back', 'шире спина — шире силуэт');
      lag.set('shoulders', 'средняя дельта визуально расширяет плечи');
    }
  }
  if (m.arm && m.thigh) {
    const ta = m.thigh.value / m.arm.value;
    const [lo, hi] = male ? [1.45, 1.95] : [1.6, 2.2];
    const ok = ta >= lo && ta <= hi;
    ratios.push({ key: 'thighArm', label: 'Бедро / рука', value: ta, ok, text: ok ? 'пропорции верха и низа сбалансированы' : ta < lo ? 'ноги отстают от рук' : 'руки отстают от ног' });
    if (ta < lo) {
      lag.set('legs', `бедро ${fmt(ta)} от руки — ноги отстают`);
      if (!male) lag.set('glutes', 'ягодицы и задняя поверхность бедра');
    } else if (ta > hi) lag.set('arms', `рука меньше пропорции к бедру (${fmt(ta)})`);
  }
  // Без замеров груди/рук: у женщин с ровной талией — акцент на ягодицы, если цель — форма
  if (!male && waist && m.hips && waist / m.hips.value > 0.8 && (level === 'athletic' || level === 'fit')) lag.set('glutes', 'объём ягодиц подчеркнёт талию');
  // Высокий процент жира без замеров — типичные зоны
  if (level === 'high' && !fat.size) {
    if (male) {
      fat.set('belly', 'у мужчин жир чаще всего на животе');
      fat.set('sides', 'и на боках');
    } else {
      fat.set('hips', 'у женщин жир чаще всего на бёдрах и ягодицах');
      fat.set('belly', 'и на животе');
    }
  }

  const focus = [...lag.entries()].filter(([z]) => ZONE_MUSCLES[z]).map(([zone, why]) => ({ zone, why, muscles: ZONE_MUSCLES[zone]! }));
  const missing: BodyMetric['kind'][] = (['waist', 'neck', ...(male ? [] : ['hips']), 'chest', 'arm', 'thigh'] as BodyMetric['kind'][]).filter((k) => !m[k]);
  return {
    bodyFat,
    level,
    ratios,
    fatZones: [...fat.entries()].map(([zone, text]) => ({ zone, text })),
    lagging: [...lag.entries()].map(([zone, text]) => ({ zone, text })),
    focus,
    trend: bodyTrend(i),
    missing,
  };
}

/**
 * Что меняется в теле: талия против веса за 3–10 недель.
 * Вес вверх при стабильной талии и растущей руке/груди — качественный набор; талия растёт быстро — набор жира.
 */
export function bodyTrend(i: BodyInput): BodyAnalysis['trend'] {
  const waists = i.metrics.filter((m) => m.kind === 'waist' && m.date <= i.today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (waists.length < 2) return null;
  const last = waists[waists.length - 1];
  const first = [...waists].reverse().find((w) => daysBetween(w.date, last.date) >= 21 && daysBetween(w.date, last.date) <= 70) ?? (daysBetween(waists[0].date, last.date) >= 21 ? waists[0] : undefined);
  if (!first) return null;
  const days = daysBetween(first.date, last.date);
  const dw = last.value - first.value;
  const near = (date: ISODate) => (i.weights ?? []).filter((w) => Math.abs(daysBetween(w.date, date)) <= 4).sort((a, b) => Math.abs(daysBetween(a.date, date)) - Math.abs(daysBetween(b.date, date)))[0];
  const w0 = near(first.date);
  const w1 = near(last.date);
  const dkg = w0 && w1 ? w1.kg - w0.kg : null;
  const grow = (kind: 'arm' | 'chest') => {
    const xs = i.metrics.filter((m) => m.kind === kind && m.date >= first.date && m.date <= last.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    return xs.length >= 2 ? xs[xs.length - 1].value - xs[0].value : 0;
  };
  const muscle = grow('arm') >= 0.5 || grow('chest') >= 1;
  const cm = (x: number) => `${x > 0 ? '+' : '−'}${fmt(Math.abs(x), 1)} см`;
  const kg = (x: number) => `${x > 0 ? '+' : '−'}${fmt(Math.abs(x), 1)} кг`;
  if (dkg !== null && dkg >= 0.8) {
    if (dw >= 1.5 * dkg && dw >= 2) return { tone: 'warn', days, text: `Талия ${cm(dw)} при ${kg(dkg)} — набор идёт с жиром, стоит замедлить темп` };
    if (Math.abs(dw) <= 1) return { tone: 'good', days, text: `${kg(dkg)} при почти той же талии${muscle ? ' и растущих объёмах' : ''} — качественный набор` };
  }
  if (dkg !== null && dkg <= -0.8 && dw <= -1) return { tone: 'good', days, text: `Талия ${cm(dw)}, вес ${kg(dkg)} — уходит жир` };
  if (dkg !== null && Math.abs(dkg) < 0.8 && dw <= -1) return { tone: 'good', days, text: `Талия ${cm(dw)} при том же весе${muscle ? ' и растущих объёмах' : ''} — рекомпозиция работает` };
  if (Math.abs(dw) < 1) return { tone: 'neutral', days, text: `Талия без изменений за ${Math.round(days / 7)} нед.` };
  return { tone: dw > 0 ? 'warn' : 'good', days, text: `Талия ${cm(dw)} за ${Math.round(days / 7)} нед.` };
}

/** Итог по фото и замерам: если есть оценка по фото — диапазон пересечения (или объединения, если не пересекаются) */
export function combineBodyFat(measured: BodyFatEstimate | null, photo?: { low: number; high: number } | null): BodyFatEstimate | null {
  if (!photo || !(photo.high > photo.low)) return measured;
  if (!measured || measured.method === 'bmi') {
    const value = r1((photo.low + photo.high) / 2);
    return { value, low: r1(photo.low), high: r1(photo.high), method: 'photo' };
  }
  if (measured.method === 'measured') return measured;
  const low = Math.max(measured.low, photo.low);
  const high = Math.min(measured.high, photo.high);
  const [l, h] = low <= high ? [low, high] : [Math.min(measured.low, photo.low), Math.max(measured.high, photo.high)];
  return { value: r1((l + h) / 2), low: r1(l), high: r1(h), method: 'photo' };
}

/** Анализ фото прогресса (сервер RYNJI) — визуальная, приблизительная оценка; хранится на устройстве */
export interface PhotoAnalysis {
  id: string;
  date: ISODate;
  createdAt: number;
  photoIds: string[];
  quality: 'good' | 'fair' | 'poor';
  qualityNote: string;
  bodyFat: { low: number; high: number } | null;
  summary: string;
  strengths: string[];
  lagging: ZoneNote[];
  fatZones: ZoneNote[];
  focus: ZoneNote[];
}

const ZONES = Object.keys(ZONE_LABEL) as BodyZone[];
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** Ответ модели → проверенная структура: только известные зоны, до 3 в списке, процент — в разумных границах */
export function parsePhotoAnalysis(raw: unknown, meta: { id: string; date: ISODate; createdAt: number; photoIds: string[] }): PhotoAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const quality = r.quality === 'good' || r.quality === 'fair' || r.quality === 'poor' ? r.quality : 'poor';
  const zones = (list: unknown, key: 'note' | 'why'): ZoneNote[] => {
    const seen = new Set<BodyZone>();
    const out: ZoneNote[] = [];
    for (const z of Array.isArray(list) ? list : []) {
      const zone = (z as Record<string, unknown>)?.zone as BodyZone;
      const text = str((z as Record<string, unknown>)?.[key], 120);
      if (!ZONES.includes(zone) || seen.has(zone) || !text) continue;
      seen.add(zone);
      out.push({ zone, text });
    }
    return out.slice(0, 3);
  };
  const lo = Number(r.bodyFatLow);
  const hi = Number(r.bodyFatHigh);
  const bodyFat = quality !== 'poor' && Number.isFinite(lo) && Number.isFinite(hi) && lo >= 3 && hi <= 60 && hi > lo && hi - lo <= 10 ? { low: r1(lo), high: r1(hi) } : null;
  const poor = quality === 'poor';
  return {
    ...meta,
    quality,
    qualityNote: str(r.qualityNote, 160),
    bodyFat,
    summary: poor ? '' : str(r.summary, 300),
    strengths: poor ? [] : (Array.isArray(r.strengths) ? r.strengths : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 3),
    lagging: poor ? [] : zones(r.lagging, 'note'),
    fatZones: poor ? [] : zones(r.fatZones, 'note'),
    focus: poor ? [] : zones(r.focus, 'why'),
  };
}

/** Зоны из замеров и из фото — без повторов (замеры первыми: они точнее) */
export function mergeZones(a: ZoneNote[], b: ZoneNote[] = []): ZoneNote[] {
  const out = [...a];
  for (const z of b) if (!out.some((x) => x.zone === z.zone)) out.push(z);
  return out;
}

/** Зона, которую фото называет сильной стороной, не попадает в «что подтянуть» (без противоречий на экране) */
export function withoutStrengths<T extends ZoneNote>(zones: T[], strengths: string[] = []): T[] {
  const s = strengths.map((x) => x.toLowerCase());
  return zones.filter((z) => !s.some((x) => x.includes(ZONE_LABEL[z.zone].toLowerCase())));
}
