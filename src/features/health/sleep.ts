import type { ISODate } from '@/types';
import { addDays, toISODate } from '@/utils/date';
import { mergedMinutes } from './dedupe';

/**
 * Сон по ночам из записей Apple Health (HKCategoryTypeIdentifierSleepAnalysis).
 * Значения: 0 — в постели, 1 — спал (без стадий), 2 — бодрствовал, 3/4/5 — стадии сна (core/deep/REM).
 *
 *  • Есть «спал» (Apple Watch, кольцо, сторонние трекеры) — считаем его, пересечения источников сливаем.
 *  • Только «в постели» — так пишет сам iPhone (режим «Сон» и учёт времени в постели по использованию телефона):
 *    считаем это время и помечаем источник, чтобы честно сказать «в постели», а не «спал».
 *  • Ночь относится к дате пробуждения: закончилась до 18:00 — этот день, позже — следующее утро.
 *  • Подъём — конец последнего интервала основной ночи (до 14:00); дневной сон время подъёма не сдвигает.
 */
export interface SleepSample {
  value: number;
  start: number;
  end: number;
}

export interface SleepNight {
  minutes: number;
  /** Время подъёма (мс) */
  wakeAt: number;
  source: 'asleep' | 'inBed';
}

const ASLEEP = new Set([1, 3, 4, 5]);

function nightKey(end: number): ISODate {
  const d = new Date(end);
  return d.getHours() < 18 ? toISODate(d) : addDays(toISODate(d), 1);
}

export function sleepNights(samples: SleepSample[]): Map<ISODate, SleepNight> {
  const by = new Map<ISODate, SleepSample[]>();
  for (const s of samples) {
    if (!(s.end > s.start)) continue;
    const k = nightKey(s.end);
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  const out = new Map<ISODate, SleepNight>();
  for (const [k, list] of by) {
    const asleep = list.filter((s) => ASLEEP.has(Number(s.value)));
    const inBed = list.filter((s) => Number(s.value) === 0);
    const use = asleep.length ? asleep : inBed;
    if (!use.length) continue;
    const minutes = Math.round(mergedMinutes(use.map((s) => [s.start, s.end] as [number, number])));
    if (minutes <= 0) continue;
    const morning = use.filter((s) => new Date(s.end).getHours() < 14);
    const wakeAt = Math.max(...(morning.length ? morning : use).map((s) => s.end));
    out.set(k, { minutes, wakeAt, source: asleep.length ? 'asleep' : 'inBed' });
  }
  return out;
}
