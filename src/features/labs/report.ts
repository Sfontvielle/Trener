import type { ISODate, LabReport, LabResult } from '@/types';
import { uid } from '@/utils/id';
import { BIOMARKER_BY_ID, matchMarker } from './catalog';
import { normalizeUnit, toCanonical } from './normalize';
import type { ParsedLab, ParsedRow } from './parse';

/**
 * Черновик анализа — то, что показывается на экране «Проверьте распознанные данные».
 * Пользователь правит любое поле; сохраняется только после подтверждения (confirmed: true).
 */
export interface DraftRow {
  key: string;
  name: string;
  markerId?: string;
  valueText: string;
  unit: string;
  refText: string;
  flag?: 'H' | 'L';
  confidence: 'high' | 'low';
}

export interface LabDraft {
  date: ISODate;
  lab: string;
  source: LabReport['source'];
  rows: DraftRow[];
}

const num = (s: string) => {
  const m = s.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

export function draftFromParsed(p: ParsedLab, source: LabReport['source'], fallbackDate: ISODate): LabDraft {
  return {
    date: p.date ?? fallbackDate,
    lab: p.lab ?? '',
    source,
    rows: p.rows.map((r: ParsedRow, i) => ({ key: `r${i}`, name: r.name, markerId: r.markerId, valueText: r.valueText, unit: r.unit, refText: r.refText ?? '', flag: r.flag, confidence: r.confidence })),
  };
}

/** «132 – 173», «< 41», «> 1,0», «до 5» → границы */
export function parseRefText(t: string): { refLow?: number; refHigh?: number } {
  const s = t.replace(/,/g, '.').trim();
  const range = s.match(/(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)/);
  if (range) return { refLow: parseFloat(range[1]), refHigh: parseFloat(range[2]) };
  const up = s.match(/(?:<|≤|до|менее)\s*(\d+(?:\.\d+)?)/i);
  if (up) return { refHigh: parseFloat(up[1]) };
  const lo = s.match(/(?:>|≥|от|более|свыше)\s*(\d+(?:\.\d+)?)/i);
  if (lo) return { refLow: parseFloat(lo[1]) };
  return {};
}

/** Проверка черновика: какие строки не сохранятся и почему */
export function draftIssues(d: LabDraft): string[] {
  const out: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) out.push('Укажите дату исследования');
  d.rows.forEach((r) => {
    if (!r.name.trim()) out.push('У одной из строк нет названия');
    else if (!Number.isFinite(num(r.valueText))) out.push(`«${r.name}»: нет числового значения`);
  });
  if (!d.rows.length) out.push('Нет ни одного показателя');
  return out;
}

/** Черновик → сохранённый отчёт. Исходные значения сохраняются как есть, нормализация — рядом */
export function reportFromDraft(d: LabDraft, now = Date.now()): LabReport {
  const results: LabResult[] = d.rows
    .filter((r) => r.name.trim() && Number.isFinite(num(r.valueText)))
    .map((r) => {
      const markerId = r.markerId && BIOMARKER_BY_ID[r.markerId] ? r.markerId : matchMarker(r.name)?.id;
      const value = num(r.valueText);
      const unit = normalizeUnit(r.unit);
      const ref = parseRefText(r.refText);
      const norm = markerId ? toCanonical(markerId, value, unit, ref.refLow, ref.refHigh) : undefined;
      const res: LabResult = { id: uid('lr_'), markerId, name: r.name.trim(), value, valueText: r.valueText.trim(), unit, ...ref, refText: r.refText.trim() || undefined, flag: r.flag };
      // normalized — только если единица отличается от канонической и пересчёт однозначен
      if (norm && markerId && unit !== BIOMARKER_BY_ID[markerId].unit) res.normalized = norm;
      return res;
    });
  return { id: uid('lab_'), date: d.date, lab: d.lab.trim() || undefined, source: d.source, results, confirmed: true, createdAt: now };
}

/** Ответ сервера распознавания (модель только переписывает бланк, без интерпретации) */
export interface ExtractedLab {
  lab: string;
  date: string;
  rows: { name: string; value: string; unit: string; refText: string; flag: 'H' | 'L' | '' }[];
}

/** Распознанный бланк → черновик: сопоставление с каталогом и единицы считает приложение, не модель */
export function draftFromExtracted(x: ExtractedLab, source: LabReport['source'], fallbackDate: ISODate): LabDraft {
  const seen = new Set<string>();
  const rows: DraftRow[] = [];
  for (const r of x.rows ?? []) {
    const name = String(r.name ?? '').trim();
    if (!name) continue;
    const marker = matchMarker(name);
    const key = marker?.id ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const unit = normalizeUnit(r.unit);
    const valueText = String(r.value ?? '').trim();
    rows.push({
      key: `x${rows.length}`,
      name,
      markerId: marker?.id,
      valueText,
      unit,
      refText: String(r.refText ?? '').trim(),
      flag: r.flag === 'H' || r.flag === 'L' ? r.flag : undefined,
      confidence: marker && unit && Number.isFinite(num(valueText)) ? 'high' : 'low',
    });
  }
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : fallbackDate, lab: x.lab ?? '', source, rows };
}

/** Пустая строка для ручного ввода */
export function emptyRow(i: number): DraftRow {
  return { key: `m${i}_${Date.now().toString(36)}`, name: '', valueText: '', unit: '', refText: '', confidence: 'low' };
}
