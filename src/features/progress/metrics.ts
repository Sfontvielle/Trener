import type { BodyMetric } from '@/types';

/** Замеры тела: подписи, единицы, шаг ввода и подсказка, как мерить */
type Kind = BodyMetric['kind'];
export const METRIC_META: Record<Kind, { label: string; unit: string; step: number; min: number; max: number; def: number; hint: string }> = {
  waist: { label: 'Талия', unit: 'см', step: 0.5, min: 40, max: 200, def: 85, hint: 'на уровне пупка, на выдохе' },
  chest: { label: 'Грудь', unit: 'см', step: 0.5, min: 50, max: 200, def: 100, hint: 'по самой широкой части' },
  hips: { label: 'Бёдра (таз)', unit: 'см', step: 0.5, min: 50, max: 200, def: 100, hint: 'по самой выступающей точке ягодиц' },
  arm: { label: 'Рука', unit: 'см', step: 0.5, min: 15, max: 70, def: 35, hint: 'бицепс в напряжении' },
  thigh: { label: 'Бедро', unit: 'см', step: 0.5, min: 30, max: 100, def: 58, hint: 'на 15 см выше колена' },
  bodyfat: { label: 'Процент жира', unit: '%', step: 0.5, min: 3, max: 60, def: 18, hint: 'весы-анализатор / калипер' },
};
