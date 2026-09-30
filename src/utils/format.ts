import type { WeightUnit } from '@/types';

export const LB_PER_KG = 2.20462;

export function round(n: number, step = 1): number {
  return Math.round(n / step) * step;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  const fixed = n.toFixed(digits);
  const [i, f] = fixed.split('.');
  const withSpaces = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return f && Number(f) !== 0 ? `${withSpaces},${f}` : withSpaces;
}

/** Вес для отображения: 82.5 → «82,5» */
export function fmtWeight(kg: number, unit: WeightUnit = 'kg'): string {
  const v = unit === 'lb' ? kg * LB_PER_KG : kg;
  return fmtNum(v, v % 1 === 0 ? 0 : 1);
}

export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round(kg * LB_PER_KG * 10) / 10 : kg;
}

export function fromDisplayWeight(v: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round((v / LB_PER_KG) * 100) / 100 : v;
}

export function unitLabel(unit: WeightUnit): string {
  return unit === 'lb' ? 'lb' : 'кг';
}

export function parseDecimal(s: string): number {
  const n = parseFloat(s.replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return part / whole;
}
