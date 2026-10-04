import type { BloodPressureEntry, BodyMetric, ISODate, LabReport, Sex, WeightEntry } from '@/types';
import type { HealthDay } from './model';
import { addDays, daysBetween, formatDayShort, today } from '@/utils/date';
import { BIOMARKER_BY_ID } from '@/features/labs/catalog';
import { compareWithPrevious, consecutiveRise, healthFlags, markerSeries } from '@/features/labs/analysis';
import { waistTrend } from '@/features/science/bodyTrend';
import type { Basis } from '@/features/science/sources';

/**
 * Мониторинг здоровья: давление, пульс покоя, анализы, вес и талия — тренды и сигналы «стоит обсудить с врачом».
 * Работает для всех; в режиме Enhanced список наблюдаемых показателей шире и напоминания чаще.
 *
 * ГРАНИЦА БЕЗОПАСНОСТИ. RYNJI может: знать факт приёма AAS, хранить историю пользователя, учитывать её как контекст,
 * мониторить показатели, показывать тренды, сообщать о потенциально неблагоприятной динамике и рекомендовать
 * медицинскую оценку. RYNJI НЕ: оптимизирует циклы, не назначает препараты, не рекомендует дозировки, не даёт
 * инструкций по корректировке курса по анализам и не утверждает, что нормальные анализы делают AAS безопасными.
 * Хороший прогресс в зале — не доказательство, что со здоровьем всё в порядке.
 */
export type SignalLevel = 'info' | 'monitor' | 'doctor' | 'urgent';

export interface HealthSignal {
  id: string;
  level: SignalLevel;
  title: string;
  text: string;
  /** На каких данных основан сигнал */
  data: string[];
  basis: Basis;
  /** Значим для тренировок: запрещает повышение нагрузки (давление, пульс, гематокрит, калий, печень, почки, КФК…) */
  gate?: boolean;
}

/**
 * Показатели, отклонение которых важно для ТРЕНИРОВОЧНОЙ нагрузки (риск тромбозов, аритмий, рабдомиолиза,
 * перегрузки печени/почек). Долгосрочные факторы риска (например, ЛПНП) — повод к врачу, но не к остановке прогрессии.
 * ЭВРИСТИКА RYNJI.
 */
export const TRAINING_GATE_MARKERS = new Set(['hct', 'hgb', 'rbc', 'k', 'na', 'alt', 'ast', 'creat', 'egfr', 'cysc', 'ck', 'tsh', 'ft4', 'ft3', 'glu']);

// ─── Артериальное давление (ACC/AHA 2017) ───────────────────────────────────

export type BpCategory = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';

export const BP_LABEL: Record<BpCategory, string> = {
  normal: 'нормальное',
  elevated: 'повышенное',
  stage1: 'гипертензия 1 ст. (по критериям ACC/AHA)',
  stage2: 'гипертензия 2 ст. (по критериям ACC/AHA)',
  crisis: 'очень высокое',
};

/** Категория по ACC/AHA 2017: <120/<80; 120–129/<80; 130–139 или 80–89; ≥140 или ≥90; >180 и/или >120 */
export function bpCategory(systolic: number, diastolic: number): BpCategory {
  if (systolic > 180 || diastolic > 120) return 'crisis';
  if (systolic >= 140 || diastolic >= 90) return 'stage2';
  if (systolic >= 130 || diastolic >= 80) return 'stage1';
  if (systolic >= 120) return 'elevated';
  return 'normal';
}

export interface BpSummary {
  /** Среднее последних измерений (до 7 за 14 дней) */
  systolic: number;
  diastolic: number;
  n: number;
  category: BpCategory;
  last: BloodPressureEntry;
  /** Изменение среднего систолического: последние 14 дней против предыдущих 28 */
  deltaSys: number | null;
}

/** Решение — по среднему нескольких измерений, не по одному (ACC/AHA: ≥2 измерения в ≥2 разных дня) */
export function bpSummary(bp: BloodPressureEntry[], ref: ISODate = today()): BpSummary | null {
  const sorted = [...bp].filter((x) => x.date <= ref).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  if (!sorted.length) return null;
  const recent = sorted.filter((x) => x.date > addDays(ref, -14)).slice(-7);
  const use = recent.length ? recent : sorted.slice(-1);
  const avg = (k: 'systolic' | 'diastolic', a: BloodPressureEntry[]) => Math.round(a.reduce((s, x) => s + x[k], 0) / a.length);
  const before = sorted.filter((x) => x.date <= addDays(ref, -14) && x.date > addDays(ref, -42));
  const sys = avg('systolic', use);
  const dia = avg('diastolic', use);
  return { systolic: sys, diastolic: dia, n: use.length, category: bpCategory(sys, dia), last: sorted[sorted.length - 1], deltaSys: before.length >= 2 && use.length >= 2 ? sys - avg('systolic', before) : null };
}

const BP_BASIS: Basis = { kind: 'evidence', sources: ['acc2017bp'], note: 'категории ACC/AHA 2017; решение по среднему нескольких измерений' };

export function bpSignals(bp: BloodPressureEntry[], ref: ISODate = today()): HealthSignal[] {
  const s = bpSummary(bp, ref);
  if (!s) return [];
  const out: HealthSignal[] = [];
  const lastCat = bpCategory(s.last.systolic, s.last.diastolic);
  const data = [`${s.n} изм. давления за 14 дней, среднее ${s.systolic}/${s.diastolic}`, `последнее ${s.last.systolic}/${s.last.diastolic} (${formatDayShort(s.last.date)})`];
  if (lastCat === 'crisis' && s.last.date >= addDays(ref, -2)) {
    out.push({ id: 'bp_crisis', level: 'urgent', gate: true, title: 'Очень высокое давление', text: `Последнее измерение ${s.last.systolic}/${s.last.diastolic}. Повторите измерение в покое через 5 минут. Если давление остаётся выше 180/120 или есть боль в груди, одышка, сильная головная боль, нарушение зрения или речи — вызовите скорую (103/112). Тренировку сегодня не проводите.`, data, basis: BP_BASIS });
  } else if (s.n >= 2 && (s.category === 'stage2' || s.category === 'crisis')) {
    out.push({ id: 'bp_high', level: 'doctor', gate: true, title: 'Давление в среднем ≥140/90', text: `Среднее ${s.systolic}/${s.diastolic} по ${s.n} измерениям. Рекомендуется обсудить результат с врачом в ближайшее время. До консультации — без максимальных усилий и задержки дыхания.`, data, basis: BP_BASIS });
  } else if (s.n >= 2 && s.category === 'stage1') {
    out.push({ id: 'bp_stage1', level: 'monitor', title: 'Давление выше оптимального', text: `Среднее ${s.systolic}/${s.diastolic} — в диапазоне 130–139/80–89. Продолжайте измерять (утром и вечером, в покое). Если сохраняется — рекомендуется обсудить с врачом.`, data, basis: BP_BASIS });
  }
  if (s.deltaSys !== null && s.deltaSys >= 8 && s.category !== 'normal') {
    out.push({ id: 'bp_rising', level: 'monitor', title: 'Давление растёт', text: `Среднее систолическое выросло на ${s.deltaSys} мм рт. ст. по сравнению с предыдущим месяцем.`, data, basis: { kind: 'heuristic', sources: ['acc2017bp'], note: 'порог роста — правило RYNJI' } });
  }
  return out;
}

// ─── Пульс покоя (персональная базовая линия) ───────────────────────────────

/** Пульс покоя: среднее 7 дней против базовой линии 8–35 дней назад. ЭВРИСТИКА RYNJI: рост ≥7 уд/мин держится неделю */
export function rhrTrend(health: Record<string, HealthDay>, ref: ISODate = today()): { recent: number; baseline: number; delta: number; days: number } | null {
  const vals = (from: number, to: number) => {
    const out: number[] = [];
    for (let i = from; i <= to; i++) {
      const v = health[addDays(ref, -i)]?.restingHr;
      if (v) out.push(v);
    }
    return out;
  };
  const recent = vals(0, 6);
  const base = vals(8, 35);
  if (recent.length < 4 || base.length < 10) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const r = Math.round(mean(recent));
  const b = Math.round(mean(base));
  return { recent: r, baseline: b, delta: r - b, days: recent.length };
}

export function rhrSignals(health: Record<string, HealthDay>, ref: ISODate = today()): HealthSignal[] {
  const t = rhrTrend(health, ref);
  if (!t) return [];
  const data = [`пульс покоя: ${t.recent} уд/мин в среднем за ${t.days} дн. (Apple Health)`, `ваша обычная норма ~${t.baseline}`];
  const basis: Basis = { kind: 'heuristic', sources: ['plews2013'], note: 'сравнение с личной базовой линией; пороги — правила RYNJI' };
  if (t.recent >= 100) return [{ id: 'rhr_high', level: 'doctor', gate: true, title: 'Высокий пульс покоя', text: `Пульс покоя в среднем ${t.recent} уд/мин. Рекомендуется обсудить с врачом.`, data, basis }];
  if (t.delta >= 7) return [{ id: 'rhr_rise', level: 'monitor', title: 'Пульс покоя выше обычного', text: `Неделю пульс покоя на ${t.delta} уд/мин выше вашей нормы. Бывает при недосыпе, болезни, перегрузке, а также на фоне препаратов. Нагрузку не повышаем; если держится или есть симптомы — к врачу.`, data, basis }];
  return [];
}

// ─── Анализы ────────────────────────────────────────────────────────────────

const LAB_BASIS: Basis = { kind: 'evidence', sources: ['bhasin2018', 'esc2019lipids', 'kdigo2024', 'ada2025', 'easl2019dili'], note: 'пороги из клинических рекомендаций; «вне референса» — по бланку вашей лаборатории' };

export function labSignals(reports: LabReport[], sex?: Sex, enhanced = false, ref: ISODate = today()): HealthSignal[] {
  if (!reports.length) return [];
  const out: HealthSignal[] = [];
  for (const f of healthFlags(reports, sex)) {
    out.push({ id: `lab_${f.markerId ?? f.name}`, level: f.level === 'urgent' ? 'urgent' : 'doctor', gate: f.level === 'urgent' || (!!f.markerId && TRAINING_GATE_MARKERS.has(f.markerId)), title: f.name, text: f.text, data: [`анализ от ${formatDayShort(f.date)}`], basis: LAB_BASIS });
  }
  // Enhanced: рост наблюдаемых показателей в трёх анализах подряд (гематокрит, гемоглобин, ЛПНП, АЛТ…)
  if (enhanced) {
    const ids = new Set(reports.flatMap((r) => r.results.map((x) => x.markerId).filter((x): x is string => !!x && !!BIOMARKER_BY_ID[x]?.enhancedWatch)));
    for (const id of ids) {
      if (out.some((s) => s.id === `lab_${id}`)) continue;
      const series = markerSeries(reports, id);
      if (consecutiveRise(series, 3)) {
        const b = BIOMARKER_BY_ID[id];
        out.push({ id: `lab_rise_${id}`, level: 'monitor', title: `${b.name}: рост в трёх анализах подряд`, text: `${series.slice(-3).map((p) => `${String(p.value).replace('.', ',')}`).join(' → ')} ${series[series.length - 1].unit}. Рекомендуется обсудить динамику с врачом, даже если значения в пределах референса.`, data: series.slice(-3).map((p) => `${formatDayShort(p.date)}: ${String(p.value).replace('.', ',')} ${p.unit}`), basis: LAB_BASIS });
      }
    }
  }
  // Давно не сдавали (Enhanced): напоминание о контроле, без указаний «что принимать»
  const last = [...reports].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (enhanced && daysBetween(last.date, ref) > 120) out.push({ id: 'lab_old', level: 'info', title: 'Анализы давно не обновлялись', text: `Последние анализы — ${formatDayShort(last.date)}. При приёме AAS врачи обычно контролируют общий анализ крови, липиды, печёночные и почечные показатели; частоту определяет врач.`, data: [`последний анализ ${formatDayShort(last.date)}`], basis: { kind: 'evidence', sources: ['pope2014'] } });
  return out;
}

/** «Новые анализы: изменились N показателей» — для Coach Alerts */
export function newLabChanges(reports: LabReport[], ref: ISODate = today()): { date: ISODate; changed: number; names: string[] } | null {
  const sorted = [...reports].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted[sorted.length - 1];
  if (!last || daysBetween(last.date, ref) > 21 || sorted.length < 2) return null;
  const cmp = compareWithPrevious(reports, last.id);
  const changed = cmp.items.filter((x) => x.significant);
  return changed.length ? { date: last.date, changed: changed.length, names: changed.slice(0, 3).map((x) => x.name) } : null;
}

// ─── Вес и талия на фоне Enhanced ───────────────────────────────────────────

export function bodySignals(weights: WeightEntry[], metrics: BodyMetric[], ref: ISODate = today()): HealthSignal[] {
  const w = waistTrend(metrics, ref, 56);
  if (!w || w.days < 21 || w.cmPerWeek < 0.4) return [];
  return [{ id: 'waist_fast', level: 'monitor', title: 'Талия быстро растёт', text: `+${String(w.changeCm).replace('.', ',')} см за ${Math.round(w.days / 7)} нед. Быстрый рост талии связан с ростом висцерального жира и кардиометаболического риска.`, data: [`${w.samples} замеров талии`], basis: { kind: 'heuristic', sources: ['iraki2019'], note: 'порог 0,4 см/нед — правило RYNJI' } }];
}

// ─── Сводка и «стоп-сигнал» для тренера ─────────────────────────────────────

const RANK: Record<SignalLevel, number> = { urgent: 3, doctor: 2, monitor: 1, info: 0 };

export function healthMonitor(args: {
  enhanced: boolean;
  bp: BloodPressureEntry[];
  health: Record<string, HealthDay>;
  labs: LabReport[];
  weights: WeightEntry[];
  metrics: BodyMetric[];
  sex?: Sex;
  ref?: ISODate;
}): HealthSignal[] {
  const ref = args.ref ?? today();
  const all = [...bpSignals(args.bp, ref), ...rhrSignals(args.health, ref), ...labSignals(args.labs, args.sex, args.enhanced, ref), ...(args.enhanced ? bodySignals(args.weights, args.metrics, ref) : [])];
  return all.sort((a, b) => RANK[b.level] - RANK[a.level]);
}

export interface HealthGate {
  /** Запрет повышения нагрузки: есть сигналы уровня «врач»/«срочно» */
  blockIncrease: boolean;
  /** Не тренироваться сегодня (срочный сигнал) */
  stop: boolean;
  reason?: string;
}

/** Здоровье важнее прогресса: при значимых сигналах тренер не предлагает «+нагрузку», при срочных — отдых */
export function healthGate(signals: HealthSignal[]): HealthGate {
  const urgent = signals.find((s) => s.level === 'urgent');
  if (urgent) return { blockIncrease: true, stop: true, reason: `${urgent.title}: сначала медицинская оценка, тренировки — после.` };
  const doc = signals.find((s) => s.level === 'doctor' && s.gate);
  if (doc) return { blockIncrease: true, stop: false, reason: `${doc.title}: есть показатели, которые стоит обсудить с врачом, поэтому нагрузку не повышаем.` };
  return { blockIncrease: false, stop: false };
}
