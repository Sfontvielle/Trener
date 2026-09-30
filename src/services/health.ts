import type { ISODate } from '@/types';

/**
 * Архитектура под Apple Health / HealthKit.
 * Сейчас используется ManualHealthProvider (данные вводятся в чек-ине и дневнике веса).
 * Для HealthKit: добавить нативный модуль (например, @kingstinct/react-native-healthkit) в dev build через EAS,
 * реализовать HealthProvider и зарегистрировать его в setHealthProvider(). Остальной код FORM менять не нужно:
 * readiness и AI Coach уже принимают sleepHours / hrvMs / restingHr / steps / weight.
 */
export interface HealthDaySample {
  date: ISODate;
  sleepHours?: number;
  hrvMs?: number;
  restingHr?: number;
  steps?: number;
  activeEnergyKcal?: number;
  weightKg?: number;
}

export interface HealthProvider {
  id: 'manual' | 'healthkit';
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  getDay(date: ISODate): Promise<HealthDaySample | null>;
  getRange(from: ISODate, to: ISODate): Promise<HealthDaySample[]>;
}

export const ManualHealthProvider: HealthProvider = {
  id: 'manual',
  isAvailable: async () => true,
  requestPermissions: async () => true,
  getDay: async () => null,
  getRange: async () => [],
};

let provider: HealthProvider = ManualHealthProvider;

export function setHealthProvider(p: HealthProvider) {
  provider = p;
}

export function health(): HealthProvider {
  return provider;
}
