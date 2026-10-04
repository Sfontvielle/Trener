import type { ISODate, LabReport, LabResult, Sex } from '@/types';
import { BIOMARKER_BY_ID, type Biomarker } from './catalog';
import { toCanonical } from './normalize';

/**
 * Интерпретация анализов — человеческим языком и без диагнозов.
 * Различаем:
 *  • выход за референс ЛАБОРАТОРИИ («выше референсного диапазона вашей лаборатории») — это не диагноз;
 *  • изменения во времени (по сравнению с прошлым анализом, рост в трёх измерениях подряд);
 *  • немногие пороги с медицинскими основаниями (catalog.serious) → «рекомендуется обсудить с врачом»,
 *    для потенциально опасных значений — заметное «обратитесь к врачу в ближайшее время».
 * Никаких назначений: RYNJI не советует препараты, дозы и изменения схем по анализам.
 */
export type LabStatus = 'low' | 'high' | 'normal' | 'unknown';
export type FindingLevel = 'info' | 'doctor' | 'urgent';

export interface LabFinding {
  level: FindingLevel;
  text: string;
}

export interface SeriesPoint {
  date: ISODate;
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  lab?: string;
  reportId: string;
}

const fmt = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Значение в единицах для сравнения: каноническое (если пересчёт однозначен), иначе исходное */
export function comparable(r: LabResult): { value: number; unit: string; refLow?: number; refHigh?: number } {
  if (r.normalized) return r.normalized;
  if (r.markerId) {
    const c = toCanonical(r.markerId, r.value, r.unit, r.refLow, r.refHigh);
    if (c) return c;
  }
  return { value: r.value, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh };
}

export function rangeOf(r: LabResult, sex?: Sex): { low?: number; high?: number; source: 'lab' | 'fallback' | 'none' } {
  const c = comparable(r);
  if (c.refLow !== undefined || c.refHigh !== undefined) return { low: c.refLow, high: c.refHigh, source: 'lab' };
  const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
  if (b?.fallbackRef && sex && c.unit === b.unit) {
    const [low, high] = b.fallbackRef[sex];
    return { low, high, source: 'fallback' };
  }
  return { source: 'none' };
}

export function statusOf(r: LabResult, sex?: Sex): LabStatus {
  if (r.flag === 'H') return 'high';
  if (r.flag === 'L') return 'low';
  const { low, high, source } = rangeOf(r, sex);
  if (source === 'none') return 'unknown';
  const v = comparable(r).value;
  if (high !== undefined && v > high) return 'high';
  if (low !== undefined && v < low) return 'low';
  return 'normal';
}

/** История показателя по всем анализам (одна единица на графике) */
export function markerSeries(reports: LabReport[], markerId: string): SeriesPoint[] {
  const pts: SeriesPoint[] = [];
  for (const rep of reports) {
    for (const r of rep.results) {
      if (r.markerId !== markerId) continue;
      const c = comparable(r);
      pts.push({ date: rep.date, value: c.value, unit: c.unit, refLow: c.refLow, refHigh: c.refHigh, lab: rep.lab, reportId: rep.id });
    }
  }
  pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Если единицы разные и пересчитать нельзя — оставляем только самую частую, чтобы не смешивать
  const counts = new Map<string, number>();
  pts.forEach((p) => counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1));
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return pts.filter((p) => p.unit === main);
}

export interface Change {
  markerId?: string;
  name: string;
  date: ISODate;
  prevDate?: ISODate;
  value: number;
  prev?: number;
  unit: string;
  delta?: number;
  direction: 'up' | 'down' | 'same' | 'new';
  significant: boolean;
  text: string;
}

/** Существенно ли изменение: проценты — ≥1 п.п.; остальное — ≥5% от прошлого значения. ЭВРИСТИКА RYNJI (шум измерения) */
export function isSignificant(b: Biomarker | undefined, prev: number, cur: number): boolean {
  const d = cur - prev;
  if (b?.percent) return Math.abs(d) >= 1;
  if (prev === 0) return d !== 0;
  return Math.abs(d) / Math.abs(prev) >= 0.05;
}

export function describeChange(b: Biomarker | undefined, prev: number, cur: number): { text: string; direction: Change['direction']; significant: boolean } {
  const d = cur - prev;
  const significant = isSignificant(b, prev, cur);
  if (!significant) return { text: 'без существенных изменений', direction: 'same', significant };
  const arrow = d > 0 ? '↑' : '↓';
  return { text: `${arrow} ${fmt(Math.abs(d))}${b?.percent ? ' п.п.' : ''}`, direction: d > 0 ? 'up' : 'down', significant };
}

/** «Что изменилось с прошлого анализа»: последний отчёт против предыдущих значений тех же показателей */
export function compareWithPrevious(reports: LabReport[], reportId?: string): { date?: ISODate; items: Change[] } {
  const sorted = [...reports].sort((a, b) => (a.date < b.date ? -1 : 1));
  const cur = reportId ? sorted.find((r) => r.id === reportId) : sorted[sorted.length - 1];
  if (!cur) return { items: [] };
  const earlier = sorted.filter((r) => r.date < cur.date || (r.date === cur.date && r.createdAt < cur.createdAt));
  const items: Change[] = [];
  for (const r of cur.results) {
    const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
    const c = comparable(r);
    let prevPoint: { date: ISODate; value: number } | undefined;
    if (r.markerId) {
      for (let i = earlier.length - 1; i >= 0 && !prevPoint; i--) {
        const pr = earlier[i].results.find((x) => x.markerId === r.markerId);
        if (pr) {
          const pc = comparable(pr);
          if (pc.unit === c.unit) prevPoint = { date: earlier[i].date, value: pc.value };
        }
      }
    }
    if (!prevPoint) {
      items.push({ markerId: r.markerId, name: b?.name ?? r.name, date: cur.date, value: c.value, unit: c.unit, direction: 'new', significant: false, text: 'первое измерение' });
      continue;
    }
    const ch = describeChange(b, prevPoint.value, c.value);
    items.push({ markerId: r.markerId, name: b?.name ?? r.name, date: cur.date, prevDate: prevPoint.date, value: c.value, prev: prevPoint.value, unit: c.unit, delta: Math.round((c.value - prevPoint.value) * 100) / 100, ...ch });
  }
  // Сначала существенные изменения
  items.sort((a, b) => Number(b.significant) - Number(a.significant));
  return { date: cur.date, items };
}

/** Рост в n последовательных измерениях (каждое следующее выше предыдущего) */
export function consecutiveRise(series: SeriesPoint[], n = 3): boolean {
  if (series.length < n) return false;
  const last = series.slice(-n);
  return last.every((p, i) => i === 0 || p.value > last[i - 1].value);
}

/** Пороги с медицинскими основаниями */
export function seriousFindings(r: LabResult): LabFinding[] {
  const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
  if (!b?.serious) return [];
  const c = comparable(r);
  if (c.unit !== b.unit) return [];
  const out: LabFinding[] = [];
  for (const s of b.serious) {
    const hit = (s.above !== undefined && c.value >= s.above) || (s.below !== undefined && c.value < s.below) || (s.aboveUln !== undefined && c.refHigh !== undefined && c.value > c.refHigh * s.aboveUln);
    if (hit) out.push({ level: s.level, text: s.text });
  }
  return out;
}

/** Объяснение одного результата с учётом истории */
export function interpretResult(r: LabResult, series: SeriesPoint[], sex?: Sex): { status: LabStatus; findings: LabFinding[] } {
  const status = statusOf(r, sex);
  const { source } = rangeOf(r, sex);
  const findings: LabFinding[] = [...seriousFindings(r)];
  if (status === 'high' || status === 'low') {
    const where = status === 'high' ? 'выше' : 'ниже';
    findings.push({ level: 'info', text: source === 'fallback' ? `Показатель ${where} общего ориентира (в бланке нет референса — сверьтесь с лабораторией).` : `Показатель ${where} референсного диапазона вашей лаборатории. Это не диагноз.` });
  }
  const prev = series.length >= 2 ? series[series.length - 2] : undefined;
  const last = series[series.length - 1];
  if (prev && last) {
    const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
    const ch = describeChange(b, prev.value, last.value);
    if (ch.significant) findings.push({ level: 'info', text: `По сравнению с предыдущим анализом показатель ${ch.direction === 'up' ? 'вырос' : 'снизился'} (${ch.text}).` });
  }
  const rising = consecutiveRise(series, 3);
  if (rising) findings.push({ level: status === 'high' ? 'doctor' : 'info', text: 'Наблюдается повышение в трёх последовательных измерениях.' });
  // Выход за референс два раза подряд — повод обсудить с врачом
  if ((status === 'high' || status === 'low') && prev) {
    const pr = prev.refHigh !== undefined && prev.value > prev.refHigh ? 'high' : prev.refLow !== undefined && prev.value < prev.refLow ? 'low' : 'normal';
    if (pr === status && !findings.some((f) => f.level !== 'info')) findings.push({ level: 'doctor', text: 'Отклонение повторяется во втором анализе подряд. Рекомендуется обсудить результат с врачом.' });
  }
  return { status, findings };
}

/** Самый высокий уровень среди находок */
export function topLevel(findings: LabFinding[]): FindingLevel | undefined {
  if (findings.some((f) => f.level === 'urgent')) return 'urgent';
  if (findings.some((f) => f.level === 'doctor')) return 'doctor';
  return findings.length ? 'info' : undefined;
}

/** Сводка по последнему анализу: значимые для здоровья находки (для тренера и предупреждений) */
export function healthFlags(reports: LabReport[], sex?: Sex): { markerId?: string; name: string; level: FindingLevel; text: string; date: ISODate }[] {
  const sorted = [...reports].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = new Map<string, { r: LabResult; date: ISODate }>();
  for (const rep of sorted) for (const r of rep.results) latest.set(r.markerId ?? `name:${r.name}`, { r, date: rep.date });
  const out: { markerId?: string; name: string; level: FindingLevel; text: string; date: ISODate }[] = [];
  for (const { r, date } of latest.values()) {
    const series = r.markerId ? markerSeries(reports, r.markerId) : [];
    const { findings } = interpretResult(r, series, sex);
    const lvl = topLevel(findings);
    if (!lvl || lvl === 'info') continue;
    const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
    out.push({ markerId: r.markerId, name: b?.name ?? r.name, level: lvl, text: findings.find((f) => f.level === lvl)!.text, date });
  }
  return out.sort((a, b) => (a.level === 'urgent' ? -1 : 0) - (b.level === 'urgent' ? -1 : 0));
}
