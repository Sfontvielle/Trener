import type { FoodEntry, ISODate, PlanAdjustment, UserProfile, WeightEntry } from '@/types';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { targetWeeklyChangeKg } from './targets';
import { addDays, daysBetween, today } from '@/utils/date';
import { clamp } from '@/utils/format';
import { BRAND } from '@/config/brand';

export interface CalorieReview {
  status: 'insufficient_data' | 'on_track' | 'adjust';
  actualKgPerWeek?: number;
  targetKgPerWeek: number;
  deltaKcal: number;
  headline: string;
  detail: string;
  observedTdee?: number;
  loggingCoverage: number;
}

const MIN_DAYS_BETWEEN_ADJUSTMENTS = 14;

/**
 * Сравнивает фактический темп тренда веса с целевым и предлагает корректировку калорий.
 * Не реагирует на единичные взвешивания: нужен тренд за ≥10 дней и ≥5 замеров.
 */
export function reviewCalories(args: {
  profile: UserProfile;
  weights: WeightEntry[];
  entries: FoodEntry[];
  adjustments: PlanAdjustment[];
  targetKcal: number;
  now?: ISODate;
}): CalorieReview {
  const { profile, weights, entries, adjustments, targetKcal } = args;
  const now = args.now ?? today();
  const trend = weightTrend(weights);
  const currentW = trend.length ? trend[trend.length - 1].trend : profile.weightKg;
  const target = targetWeeklyChangeKg(profile, currentW);
  const rate = weeklyRate(trend, 21);

  // Покрытие дневника питания за 14 дней
  const since = addDays(now, -14);
  const loggedDays = new Map<ISODate, number>();
  for (const e of entries) if (e.date > since && e.date < now) loggedDays.set(e.date, (loggedDays.get(e.date) ?? 0) + e.macros.kcal);
  const fullDays = [...loggedDays.values()].filter((k) => k > targetKcal * 0.5);
  const coverage = fullDays.length / 13;

  if (!rate) {
    const n = weights.length;
    return {
      status: 'insufficient_data',
      targetKgPerWeek: target,
      deltaKcal: 0,
      headline: 'Мало данных о весе',
      detail: n === 0 ? `Взвешивайся утром 3–4 раза в неделю — через 2 недели ${BRAND} сверит калории с реальным трендом.` : `Есть ${n} ${n === 1 ? 'замер' : 'замера(ов)'}. Нужно ≥5 взвешиваний за 10+ дней, чтобы увидеть тренд.`,
      loggingCoverage: coverage,
    };
  }

  const observedTdee = coverage >= 0.7 ? avg(fullDays) - (rate.kgPerWeek * 7700) / 7 : undefined;

  // Таймер «ждём эффекта» запускают только изменения калорий (не перестройка тренировок)
  const lastCal = adjustments.filter((a) => a.kind === 'calories' && (a.deltaKcal !== 0 || a.source === 'goal_change')).sort((a, b) => b.createdAt - a.createdAt)[0];
  const daysSinceAdj = lastCal ? daysBetween(isoFromMs(lastCal.createdAt), now) : Infinity;

  const diff = rate.kgPerWeek - target; // >0 — набираем быстрее цели / худеем медленнее
  const tolerance = Math.max(0.1, currentW * 0.0015);
  const fmt = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(2)} кг/нед`;

  if (Math.abs(diff) <= tolerance) {
    return {
      status: 'on_track',
      actualKgPerWeek: rate.kgPerWeek,
      targetKgPerWeek: target,
      deltaKcal: 0,
      headline: 'Вес идёт по плану',
      detail: `Тренд ${fmt(rate.kgPerWeek)} при цели ${fmt(target)}. Калории не меняем.`,
      observedTdee,
      loggingCoverage: coverage,
    };
  }

  // Переводим расхождение в ккал/день, корректируем мягко: ±100…250, шаг 50
  const raw = (-diff * 7700) / 7;
  const delta = Math.sign(raw) * clamp(Math.round(Math.abs(raw) / 50) * 50, 100, 250);

  if (daysSinceAdj < MIN_DAYS_BETWEEN_ADJUSTMENTS) {
    return {
      status: 'on_track',
      actualKgPerWeek: rate.kgPerWeek,
      targetKgPerWeek: target,
      deltaKcal: 0,
      headline: 'Ждём эффекта корректировки',
      detail: `Калории меняли ${daysSinceAdj} дн. назад. Следующая проверка — через ${MIN_DAYS_BETWEEN_ADJUSTMENTS - daysSinceAdj} дн.`,
      observedTdee,
      loggingCoverage: coverage,
    };
  }

  let headline: string;
  if (profile.goal === 'bulk') headline = diff < 0 ? 'Вес не растёт — добавим калорий' : 'Вес растёт слишком быстро';
  else if (profile.goal === 'cut') headline = diff > 0 ? 'Вес снижается медленнее плана' : 'Вес уходит слишком быстро';
  else headline = diff > 0 ? 'Вес растёт' : 'Вес снижается';

  return {
    status: 'adjust',
    actualKgPerWeek: rate.kgPerWeek,
    targetKgPerWeek: target,
    deltaKcal: delta,
    headline,
    detail: `Тренд за ${rate.days} дн.: ${fmt(rate.kgPerWeek)}, цель ${fmt(target)}. Предлагаю ${delta > 0 ? '+' : ''}${delta} ккал/день.${coverage < 0.7 ? ' Дневник питания заполнен не полностью — точность ниже.' : ''}`,
    observedTdee,
    loggingCoverage: coverage,
  };
}

function avg(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

function isoFromMs(ms: number): ISODate {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
