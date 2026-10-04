import { Platform } from 'react-native';
import type { HealthDay } from '@/features/health/model';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { addDays, toISODate } from '@/utils/date';
import { BRAND } from '@/config/brand';

/**
 * Apple Health (HealthKit) через @kingstinct/react-native-healthkit.
 *
 * Нативный модуль есть только в iOS development/production build (EAS), собранной ПОСЛЕ добавления
 * библиотеки в package.json/app.json (плагин добавляет entitlement com.apple.developer.healthkit и
 * NSHealthShareUsageDescription). В Expo Go, в вебе и на Android модуля нет — состояние показывается
 * явно, ошибки логируются (console.warn) и доступны в «Подробнее». Только ЧТЕНИЕ.
 */

type HK = typeof import('@kingstinct/react-native-healthkit');
let cached: HK | null | undefined;
/** Техническая причина, почему модуль не загрузился (для «Подробнее» и логов) */
let loadError: string | null = null;

/** Expo Go не содержит нативный модуль HealthKit — даже не пытаемся его загружать (иначе красная ошибка в dev) */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

export function logHealthError(where: string, e: unknown) {
  console.warn(`[${BRAND}] HealthKit ${where}:`, errText(e));
}

function load(): HK | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') return (cached = null);
  if (isExpoGo()) {
    loadError = 'Expo Go: нативного модуля HealthKit нет в этой среде';
    return (cached = null);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@kingstinct/react-native-healthkit') as HK;
  } catch (e) {
    // Модуль не слинкован в нативной сборке (сборка сделана до добавления библиотеки) или несовместим Nitro
    loadError = errText(e);
    logHealthError('load', e);
    cached = null;
  }
  return cached;
}

/**
 * Только то, что нужно для решений RYNJI: сон, шаги, вес, пульс покоя, HRV, активная энергия, тренировки.
 * Запись не запрашивается (NSHealthUpdateUsageDescription отключён в app.json).
 */
export const READ_TYPES = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBodyMass',
  'HKWorkoutTypeIdentifier',
] as const;

type ReadArg = Parameters<HK['requestAuthorization']>[0];
const AUTH: ReadArg = { toRead: READ_TYPES as unknown as ReadArg['toRead'] };

export type HealthAvailability = 'unsupported' | 'expo_go' | 'module_missing' | 'unavailable' | 'available';

/** Доступность Health на этом устройстве/сборке (без запроса разрешений) */
export function healthAvailability(): HealthAvailability {
  if (Platform.OS !== 'ios') return 'unsupported';
  if (isExpoGo()) return 'expo_go';
  const hk = load();
  if (!hk) return 'module_missing';
  try {
    return hk.isHealthDataAvailable() ? 'available' : 'unavailable';
  } catch (e) {
    loadError = errText(e);
    logHealthError('isHealthDataAvailable', e);
    return 'module_missing';
  }
}

export function healthLoadError(): string | null {
  return loadError;
}

/**
 * Нужно ли показывать системный диалог. iOS из соображений приватности не сообщает, разрешено ли ЧТЕНИЕ:
 * 'unnecessary' значит «диалог уже показывался», а не «всё разрешено» — поэтому наличие данных проверяется отдельно.
 */
export async function healthRequestStatus(): Promise<'should_request' | 'requested' | 'unknown'> {
  const hk = load();
  if (!hk) return 'unknown';
  try {
    const st = Number(await hk.getRequestStatusForAuthorization(AUTH));
    return st === 1 ? 'should_request' : st === 2 ? 'requested' : 'unknown';
  } catch (e) {
    logHealthError('getRequestStatusForAuthorization', e);
    return 'unknown';
  }
}

/** Системный диалог доступа. Ошибка возвращается с текстом — не превращается молча в «нет доступа» */
export async function requestHealthAccess(): Promise<{ ok: boolean; error?: string }> {
  const hk = load();
  if (!hk) return { ok: false, error: loadError ?? 'HealthKit не загружен' };
  try {
    const ok = await hk.requestAuthorization(AUTH);
    return { ok };
  } catch (e) {
    logHealthError('requestAuthorization', e);
    return { ok: false, error: errText(e) };
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
    } catch (e) {
      logHealthError('query', e);
      return undefined;
    }
  };

  // Суммы за день: шаги, активные калории
  await Promise.all(
    dates.map(async (d) => {
      const day = out.get(d)!;
      const steps = await safe(() => hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], { filter: range(d), unit: 'count' }));
      if (steps?.sumQuantity) day.steps = Math.round(steps.sumQuantity.quantity);
      const kcal = await safe(() => hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], { filter: range(d), unit: 'kcal' }));
      if (kcal?.sumQuantity) day.activeKcal = Math.round(kcal.sumQuantity.quantity);
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
  // Несколько взвешиваний за день (весы + ручные записи в «Здоровье») → берём самое раннее (утреннее, натощак)
  const firstAt = new Map<string, number>();
  for (const s of mass ?? []) {
    const k = toISODate(new Date(s.startDate));
    const t = new Date(s.startDate).getTime();
    const d = out.get(k);
    if (!d || (firstAt.has(k) && firstAt.get(k)! <= t)) continue;
    firstAt.set(k, t);
    d.weightKg = Math.round(s.quantity * 10) / 10;
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
