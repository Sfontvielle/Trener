import { Platform } from 'react-native';
import type { HealthDay, HealthStatus } from '@/features/health/model';
import { addDays, toISODate } from '@/utils/date';

/**
 * Apple Health (HealthKit) через @kingstinct/react-native-healthkit.
 *
 * Нативный модуль есть только в iOS development/production build (EAS). В Expo Go, в вебе и на Android
 * модуля нет — загрузка ленивая и обёрнута в try/catch, приложение работает без Health.
 * FORM только ЧИТАЕТ данные (запись не запрашивается).
 */

type HK = typeof import('@kingstinct/react-native-healthkit');
let cached: HK | null | undefined;

function load(): HK | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@kingstinct/react-native-healthkit') as HK;
    // В Expo Go Nitro-модуль отсутствует: обращение бросает — считаем недоступным
    cached.isHealthDataAvailable();
  } catch {
    cached = null;
  }
  return cached;
}

export const READ_TYPES = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKWorkoutTypeIdentifier',
] as const;

/** Доступность Health на этом устройстве/сборке (без запроса разрешений) */
export function healthAvailability(): Exclude<HealthStatus, 'connected' | 'not_connected' | 'denied'> | 'available' {
  if (Platform.OS !== 'ios') return 'unsupported';
  const hk = load();
  if (!hk) return 'needs_dev_build';
  try {
    return hk.isHealthDataAvailable() ? 'available' : 'unavailable';
  } catch {
    return 'needs_dev_build';
  }
}

/** Системный диалог доступа. iOS не сообщает, что именно запрещено к чтению, — проверяем по факту данных */
export async function requestHealthAccess(): Promise<boolean> {
  const hk = load();
  if (!hk) return false;
  try {
    return await hk.requestAuthorization({ toRead: READ_TYPES as unknown as Parameters<HK['requestAuthorization']>[0]['toRead'] });
  } catch {
    return false;
  }
}

const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);

/** Чтение последних N дней. Каждый тип читается отдельно: отказ в одном не ломает остальные */
export async function fetchHealthDays(days = 21, ref = new Date()): Promise<HealthDay[]> {
  const hk = load();
  if (!hk) return [];
  const today = toISODate(ref);
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i)));
  const out = new Map<string, HealthDay>(dates.map((d) => [d, { date: d }]));
  const range = (d: string) => ({ date: { startDate: dayStart(d), endDate: dayStart(addDays(d, 1)) } });
  const safe = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  };

  // Суммы за день: шаги, активные калории, дистанция
  await Promise.all(
    dates.map(async (d) => {
      const day = out.get(d)!;
      const steps = await safe(() => hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], { filter: range(d), unit: 'count' }));
      if (steps?.sumQuantity) day.steps = Math.round(steps.sumQuantity.quantity);
      const kcal = await safe(() => hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], { filter: range(d), unit: 'kcal' }));
      if (kcal?.sumQuantity) day.activeKcal = Math.round(kcal.sumQuantity.quantity);
      const dist = await safe(() => hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', ['cumulativeSum'], { filter: range(d), unit: 'km' }));
      if (dist?.sumQuantity) day.distanceKm = Math.round(dist.sumQuantity.quantity * 10) / 10;
    }),
  );

  const from = dayStart(dates[0]);
  const to = dayStart(addDays(today, 1));
  const all = { filter: { date: { startDate: from, endDate: to } }, limit: 0 };

  const rhr = await safe(() => hk.queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { ...all, unit: 'count/min' }));
  for (const s of rhr ?? []) {
    const d = out.get(toISODate(new Date(s.startDate)));
    if (d) d.restingHr = Math.round(s.quantity);
  }
  // HRV: несколько замеров в день → среднее
  const hrv = await safe(() => hk.queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { ...all, unit: 'ms' }));
  const hrvBy = new Map<string, number[]>();
  for (const s of hrv ?? []) {
    const k = toISODate(new Date(s.startDate));
    hrvBy.set(k, [...(hrvBy.get(k) ?? []), s.quantity]);
  }
  for (const [k, v] of hrvBy) {
    const d = out.get(k);
    if (d) d.hrvMs = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  }
  const mass = await safe(() => hk.queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { ...all, unit: 'kg' }));
  for (const s of mass ?? []) {
    const d = out.get(toISODate(new Date(s.startDate)));
    if (d) d.weightKg = Math.round(s.quantity * 10) / 10;
  }

  // Сон: интервалы «спал» (core/deep/REM/unspecified) за ночь — относим к дате пробуждения. Пересечения источников сливаем
  const sleepFrom = new Date(from.getTime() - 12 * 3600_000);
  const sleep = await safe(() => hk.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { filter: { date: { startDate: sleepFrom, endDate: to } }, limit: 0 }));
  if (sleep?.length) {
    const asleep = sleep.filter((s) => [1, 3, 4, 5].includes(Number(s.value))).map((s) => [new Date(s.startDate).getTime(), new Date(s.endDate).getTime()] as [number, number]);
    const byDay = new Map<string, [number, number][]>();
    for (const iv of asleep) {
      // Сон, закончившийся до 18:00, относится к этому дню; позже — к следующему утру
      const end = new Date(iv[1]);
      const key = end.getHours() < 18 ? toISODate(end) : addDays(toISODate(end), 1);
      byDay.set(key, [...(byDay.get(key) ?? []), iv]);
    }
    for (const [k, ivs] of byDay) {
      const d = out.get(k);
      if (d) d.sleepHours = Math.round((mergedMinutes(ivs) / 60) * 100) / 100;
    }
  }

  const workouts = await safe(() => hk.queryWorkoutSamples({ filter: { date: { startDate: from, endDate: to } }, limit: 0, ascending: true }));
  for (const w of workouts ?? []) {
    const start = new Date(w.startDate);
    const d = out.get(toISODate(start));
    if (!d) continue;
    const type = Number(w.workoutActivityType);
    d.workouts = [...(d.workouts ?? []), { start: start.getTime(), minutes: Math.round((new Date(w.endDate).getTime() - start.getTime()) / 60000), kcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned.quantity) : undefined, strength: type === 20 || type === 50 }];
  }
  return [...out.values()];
}

/** Сумма объединения интервалов, мин (часы + Apple Watch пишут пересекающиеся записи сна) */
export function mergedMinutes(ivs: [number, number][]): number {
  const s = [...ivs].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of s) {
    if (!cur || iv[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [iv[0], iv[1]];
    } else cur[1] = Math.max(cur[1], iv[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total / 60000;
}
