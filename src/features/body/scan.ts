import type { Sex } from '@/types';
import { navyBodyFat } from '@/features/progress/body';

/**
 * Скан тела по двум фото (спереди и боком) — геометрия по силуэту, на устройстве.
 *
 * Распознавание (силуэт человека и точки скелета MediaPipe) делает веб-компонент ScanEngine; сюда приходят только
 * «срезы» силуэта по строкам и точки скелета. Отсюда — обхваты и процент жира, без выдуманных чисел:
 *  1. масштаб — рост из профиля / высота силуэта от макушки до стоп (см на пиксель);
 *  2. уровни — по точкам скелета: шея (между подбородком и плечами — самое узкое место), грудь (~25% от плеч к тазу),
 *     талия (у мужчин — на уровне пупка, ~70% от плеч к тазу; у женщин — самое узкое место), бёдра (самое широкое место
 *     ягодиц), бедро (треть от таза к колену), плечо руки (середина от плеча к локтю);
 *  3. ширина спереди и глубина сбоку на том же уровне (доля роста) → обхват как эллипс (формула Рамануджана);
 *  4. процент жира — формула ВМС США (Hodgdon & Beckett 1984) по шее, талии и бёдрам — ДИАПАЗОНОМ ±5 п.п.:
 *     ошибка формулы (~±3,5) плюс ошибка обхвата по силуэту (~±4%).
 * Если фото не подходит (человек не целиком в кадре, руки прижаты, не боком) — результата нет, только что исправить.
 * Это оценка, не медицинское измерение.
 */

export type Pt = { x: number; y: number; v: number };
/** Строка силуэта: y (px) и непрерывные участки [x0, x1] маски человека */
export type Row = { y: number; runs: [number, number][] };

export interface ScanView {
  width: number;
  height: number;
  /** Верх и низ силуэта, px */
  top: number;
  bottom: number;
  rows: Row[];
  /** 33 точки скелета MediaPipe Pose, px; v — видимость 0–1 */
  landmarks: Pt[];
}

export type ScanSite = 'neck' | 'chest' | 'waist' | 'hips' | 'thigh' | 'arm';
export const SCAN_SITES: ScanSite[] = ['neck', 'chest', 'waist', 'hips', 'thigh', 'arm'];

export const SITE_LABEL: Record<ScanSite, string> = {
  neck: 'Шея',
  chest: 'Грудь',
  waist: 'Талия',
  hips: 'Бёдра (ягодицы)',
  thigh: 'Бедро',
  arm: 'Плечо (рука)',
};

export type ScanIssue = 'no_person' | 'not_full_body' | 'too_small' | 'not_facing' | 'arms_close' | 'not_profile' | 'implausible';

export const ISSUE_TEXT: Record<ScanIssue, string> = {
  no_person: 'На фото не найден человек — нужен хороший свет и однотонный фон',
  not_full_body: 'Нужен рост целиком: от макушки до стоп, с небольшим запасом сверху и снизу',
  too_small: 'Подойди ближе: силуэт занимает слишком мало кадра',
  not_facing: 'На первом фото встань лицом к камере, плечи ровно',
  arms_close: 'Отведи руки от тела (буквой «А») — иначе талия и бёдра не видны',
  not_profile: 'На втором фото встань строго боком к камере',
  implausible: 'Обхваты получились вне разумных границ — переснимите в облегающей одежде, без мешковатых вещей',
};

// Точки MediaPipe Pose
const NOSE = 0, L_EAR = 7, R_EAR = 8, L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_HIP = 23, R_HIP = 24, L_KNEE = 25, R_KNEE = 26, L_ANK = 27, R_ANK = 28;

const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
const seen = (p: Pt | undefined, min = 0.5) => !!p && p.v >= min;

/** Ближайшая к y строка силуэта */
function rowAt(v: ScanView, y: number): Row | undefined {
  let best: Row | undefined;
  for (const r of v.rows) if (!best || Math.abs(r.y - y) < Math.abs(best.y - y)) best = r;
  return best && Math.abs(best.y - y) <= 6 ? best : undefined;
}

/** Участок строки, в котором лежит x (туловище — участок под серединой таза) */
function runAt(r: Row | undefined, x: number): [number, number] | undefined {
  return r?.runs.find(([a, b]) => a <= x && x <= b);
}

/**
 * Ширина участка под x. Тело почти симметрично относительно оси (axis): если одна половина заметно шире —
 * к ней прилипла рука или тень, берём удвоенную меньшую половину.
 */
function spanWidth(run: [number, number], axis?: number): number {
  if (axis === undefined || axis <= run[0] || axis >= run[1]) return run[1] - run[0];
  const l = axis - run[0];
  const r = run[1] - axis;
  return Math.abs(l - r) > 0.08 * (l + r) ? 2 * Math.min(l, r) : run[1] - run[0];
}

const widthAt = (v: ScanView, y: number, x: number, axis?: number) => {
  const run = runAt(rowAt(v, y), x);
  return run ? spanWidth(run, axis) : undefined;
};

/** Экстремум ширины туловища в полосе строк [y0, y1] */
function extremum(v: ScanView, y0: number, y1: number, x: number, kind: 'min' | 'max', axis?: number): { y: number; w: number } | undefined {
  let best: { y: number; w: number } | undefined;
  for (const r of v.rows) {
    if (r.y < Math.min(y0, y1) || r.y > Math.max(y0, y1)) continue;
    const run = runAt(r, x);
    if (!run) continue;
    const w = spanWidth(run, axis);
    if (!best || (kind === 'min' ? w < best.w : w > best.w)) best = { y: r.y, w };
  }
  return best;
}

export interface FrontMeasure {
  issues: ScanIssue[];
  /** см на пиксель */
  scale: number;
  /** Уровень каждого обхвата — доля роста от макушки (по ней ищется глубина на боковом фото) */
  level: Partial<Record<ScanSite, number>>;
  /** Ширина спереди, см */
  width: Partial<Record<ScanSite, number>>;
}

export function measureFront(v: ScanView, heightCm: number, sex: Sex): FrontMeasure {
  const out: FrontMeasure = { issues: [], scale: 0, level: {}, width: {} };
  const L = v.landmarks;
  const h = v.bottom - v.top;
  if (!L?.length || h <= 0 || !v.rows.length) return { ...out, issues: ['no_person'] };
  if (v.top <= 2 || v.bottom >= v.height - 3 || !seen(L[NOSE]) || !(seen(L[L_ANK], 0.3) || seen(L[R_ANK], 0.3))) out.issues.push('not_full_body');
  if (h < v.height * 0.5) out.issues.push('too_small');
  const sh = mid(L[L_SH], L[R_SH]);
  const hip = mid(L[L_HIP], L[R_HIP]);
  const shW = Math.abs(L[L_SH].x - L[R_SH].x);
  // лицом к камере: плечи видны оба и на одной высоте, ширина плеч заметна
  if (!seen(L[L_SH]) || !seen(L[R_SH]) || shW < h * 0.12 || Math.abs(L[L_SH].y - L[R_SH].y) > shW * 0.12) out.issues.push('not_facing');
  if (out.issues.length) return out;

  out.scale = heightCm / h;
  const torso = hip.y - sh.y;
  const cx = hip.x;
  /** Ось тела — середина плеч и таза */
  const axis = (sh.x + hip.x) / 2;
  const frac = (y: number) => (y - v.top) / h;
  const set = (site: ScanSite, y: number, w: number | undefined) => {
    if (w === undefined || !(w > 0)) return;
    out.level[site] = frac(y);
    out.width[site] = w * out.scale;
  };
  // шея: самое узкое место между подбородком и плечами
  const ear = seen(L[L_EAR]) && seen(L[R_EAR]) ? mid(L[L_EAR], L[R_EAR]).y : L[NOSE].y;
  // шея: середина шеи (не под челюстью) — самое узкое место во второй половине между ушами и плечами
  const neck = extremum(v, ear + (sh.y - ear) * 0.45, sh.y - (sh.y - ear) * 0.12, sh.x, 'min', axis);
  if (neck) set('neck', neck.y, neck.w);
  const chestY = sh.y + torso * 0.25;
  set('chest', chestY, widthAt(v, chestY, cx, axis));
  if (sex === 'male') {
    const y = sh.y + torso * 0.72;
    set('waist', y, widthAt(v, y, cx, axis));
  } else {
    const waist = extremum(v, sh.y + torso * 0.45, sh.y + torso * 0.8, cx, 'min', axis);
    if (waist) set('waist', waist.y, waist.w);
  }
  // ягодицы: от сустава до складки — ниже уже бёдра (у массивных ног они шире таза)
  const hips = extremum(v, hip.y - torso * 0.05, hip.y + torso * 0.18, cx, 'max', axis);
  if (hips) set('hips', hips.y, hips.w);
  // бедро: ноги разделены — берём участки слева и справа от середины, среднее
  const knee = mid(L[L_KNEE], L[R_KNEE]);
  if (seen(L[L_KNEE], 0.4) || seen(L[R_KNEE], 0.4)) {
    // треть бедра от тазобедренного сустава
    const y = hip.y + (knee.y - hip.y) * 0.35;
    const r = rowAt(v, y);
    const joined = runAt(r, cx);
    if (joined) {
      // бёдра сомкнуты (массивные ноги) — один участок на обе ноги: по половине
      set('thigh', y, (joined[1] - joined[0]) / 2);
    } else {
      // ноги — ближайшие к середине участки слева и справа (дальше — кисти рук на той же высоте)
      const runs = (r?.runs ?? []).filter(([a, b]) => b - a > h * 0.04);
      const left = runs.filter(([, b]) => b <= cx).sort((p, q) => q[1] - p[1])[0];
      const right = runs.filter(([a]) => a >= cx).sort((p, q) => p[0] - q[0])[0];
      if (left && right) set('thigh', y, (left[1] - left[0] + right[1] - right[0]) / 2);
    }
  }
  // руки отведены: на уровне талии слева и справа от туловища есть отдельные участки
  const wRow = rowAt(v, out.level.waist !== undefined ? v.top + out.level.waist * h : hip.y - torso * 0.2);
  const body = runAt(wRow, cx);
  const side = (wRow?.runs ?? []).filter((run) => run !== body && run[1] - run[0] > 2);
  if (!body || side.length < 2) out.issues.push('arms_close');
  // плечо руки: середина от плеча к локтю, крайний участок со стороны руки
  if (seen(L[L_EL], 0.4) && seen(L[R_EL], 0.4)) {
    const ws: number[] = [];
    for (const [s, e] of [[L_SH, L_EL], [R_SH, R_EL]] as const) {
      const y = L[s].y + (L[e].y - L[s].y) * 0.45;
      const x = L[s].x + (L[e].x - L[s].x) * 0.45;
      const run = runAt(rowAt(v, y), x);
      const t = runAt(rowAt(v, y), cx);
      if (run && run !== t) ws.push(run[1] - run[0]);
    }
    if (ws.length) set('arm', sh.y + (mid(L[L_EL], L[R_EL]).y - sh.y) * 0.45, ws.reduce((a, b) => a + b, 0) / ws.length);
  }
  return out;
}

export interface SideMeasure {
  issues: ScanIssue[];
  depth: Partial<Record<ScanSite, number>>;
}

/** Глубина тела сбоку на тех же уровнях (доля роста); руки на боковом фото — вперёд, на уровне плеч */
export function measureSide(v: ScanView, heightCm: number, level: Partial<Record<ScanSite, number>>): SideMeasure {
  const out: SideMeasure = { issues: [], depth: {} };
  const L = v.landmarks;
  const h = v.bottom - v.top;
  if (!L?.length || h <= 0 || !v.rows.length) return { ...out, issues: ['no_person'] };
  if (v.top <= 2 || v.bottom >= v.height - 3) out.issues.push('not_full_body');
  if (h < v.height * 0.5) out.issues.push('too_small');
  // боком: плечи почти совпадают по горизонтали
  const shW = Math.abs(L[L_SH].x - L[R_SH].x);
  if (shW > h * 0.07) out.issues.push('not_profile');
  if (out.issues.length) return out;
  const scale = heightCm / h;
  const cx = (mid(L[L_SH], L[R_SH]).x + mid(L[L_HIP], L[R_HIP]).x) / 2;
  for (const site of ['neck', 'chest', 'waist', 'hips'] as ScanSite[]) {
    const f = level[site];
    if (f === undefined) continue;
    const y = v.top + f * h;
    const x = site === 'neck' ? mid(L[L_SH], L[R_SH]).x : cx;
    // шея сбоку — самое узкое место в ±2% роста от уровня: строка чуть выше уже задевает подбородок
    const w = site === 'neck' ? extremum(v, y - h * 0.02, y + h * 0.02, x, 'min')?.w : widthAt(v, y, x);
    if (w) out.depth[site] = w * scale;
  }
  return out;
}

/** Обхват эллипса по ширине и глубине (Рамануджан) */
export function ellipse(width: number, depth: number): number {
  const a = width / 2;
  const b = depth / 2;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/** Обхваты по силуэту: глубина руки и бедра на боковом фото не видна (перекрываются) — сечение как у круга, ±8% */
const ROUND_DEPTH: Partial<Record<ScanSite, number>> = { thigh: 1.0, arm: 0.95 };

export const PLAUSIBLE: Record<ScanSite, [number, number]> = { neck: [25, 60], chest: [65, 160], waist: [50, 170], hips: [60, 175], thigh: [35, 90], arm: [18, 60] };

export interface ScanResult {
  issues: ScanIssue[];
  /** Обхваты, см, с погрешностью */
  girths: Partial<Record<ScanSite, { value: number; error: number }>>;
  bodyFat: { value: number; low: number; high: number } | null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function scanResult(front: FrontMeasure, side: SideMeasure, sex: Sex, heightCm: number): ScanResult {
  const issues = [...new Set([...front.issues, ...side.issues])];
  const girths: ScanResult['girths'] = {};
  if (issues.some((i) => i !== 'arms_close')) return { issues, girths, bodyFat: null };
  for (const site of SCAN_SITES) {
    const w = front.width[site];
    if (!w) continue;
    const d = side.depth[site] ?? (ROUND_DEPTH[site] ? w * ROUND_DEPTH[site]! : undefined);
    if (!d) continue;
    // руки прижаты — талия и бёдра спереди слились с руками: их не считаем
    if (issues.includes('arms_close') && (site === 'waist' || site === 'hips' || site === 'chest' || site === 'arm')) continue;
    const c = ellipse(w, d);
    const [lo, hi] = PLAUSIBLE[site];
    if (c < lo || c > hi) {
      if (!issues.includes('implausible')) issues.push('implausible');
      continue;
    }
    girths[site] = { value: r1(c), error: r1(c * (side.depth[site] ? 0.04 : 0.08)) };
  }
  const n = girths.neck?.value;
  const w = girths.waist?.value;
  const hp = girths.hips?.value;
  let bodyFat: ScanResult['bodyFat'] = null;
  if (n && w && (sex === 'male' || hp)) {
    const bf = navyBodyFat(sex, heightCm, w, n, hp);
    if (bf !== null && Number.isFinite(bf) && bf >= 3 && bf <= 60) {
      const v = r1(bf);
      bodyFat = { value: v, low: r1(Math.max(3, v - 5)), high: r1(Math.min(60, v + 5)) };
    }
  }
  return { issues, girths, bodyFat };
}
