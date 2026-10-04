import type { FoodEntry, ISODate, WeightEntry } from '@/types';
import { addDays, daysBetween, today } from '@/utils/date';
import { KCAL_PER_KG } from './calories';
import type { Basis } from './sources';

/**
 * Персональная оценка расхода (maintenance) по фактическим данным — замена формулы после накопления истории.
 *
 * Энергобаланс: изменение запасов = поступление − расход ⇒ расход ≈ средняя калорийность − (темп веса × 7700 / 7).
 * Метод — тот же, что в адаптивных калькуляторах (MacroFactor и др.), основание — Hall 2008 (7700 ккал/кг —
 * грубое приближение). Используются только сглаженные данные:
 *  • темп — линейная регрессия по всем взвешиваниям окна (не разница двух дней);
 *  • калорийность — среднее по «полным» дням дневника (неполные дни занижали бы оценку);
 *  • нужно ≥14 дней, ≥6 взвешиваний и дневник ≥70% дней окна — иначе честное «мало данных».
 * Шаги и тренировки отдельно не прибавляются: они уже «внутри» фактического расхода.
 * ЭВРИСТИКИ RYNJI: порог «полного дня» (≥60% медианы дней), округление до 50 ккал, пороги уверенности.
 */
export interface MaintenanceEstimate {
  kcal: number;
  avgIntake: number;
  kgPerWeek: number;
  days: number;
  loggedDays: number;
  weighIns: number;
  confidence: 'medium' | 'high';
  text: string;
  basis: Basis;
}

const round50 = (x: number) => Math.round(x / 50) * 50;

export function regressionKgPerWeek(weights: WeightEntry[], from: ISODate, to: ISODate): { kgPerWeek: number; n: number; span: number } | null {
  const pts = weights.filter((w) => w.date >= from && w.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length < 2) return null;
  const xs = pts.map((p) => daysBetween(from, p.date));
  const span = xs[xs.length - 1] - xs[0];
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = pts.reduce((a, p) => a + p.kg, 0) / pts.length;
  let num = 0;
  let den = 0;
  pts.forEach((p, i) => {
    num += (xs[i] - mx) * (p.kg - my);
    den += (xs[i] - mx) ** 2;
  });
  if (!den) return null;
  return { kgPerWeek: (num / den) * 7, n: pts.length, span };
}

export function estimateMaintenance(entries: FoodEntry[], weights: WeightEntry[], ref: ISODate = today(), windowDays = 28): MaintenanceEstimate | null {
  // Сегодняшний день не считаем: дневник ещё заполняется
  const to = addDays(ref, -1);
  const from = addDays(ref, -windowDays);
  const byDay = new Map<ISODate, number>();
  for (const e of entries) if (e.date >= from && e.date <= to) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.macros.kcal);
  const all = [...byDay.values()].sort((a, b) => a - b);
  if (all.length < 10) return null;
  const median = all[Math.floor(all.length / 2)];
  const full = all.filter((k) => k >= median * 0.6 && k >= 800);
  // Окно — от первого дня с данными (новый пользователь), но не меньше 14 дней
  const firstDay = [...byDay.keys()].sort()[0];
  const span = daysBetween(firstDay, to) + 1;
  if (span < 14 || full.length / span < 0.7) return null;
  const rate = regressionKgPerWeek(weights, firstDay, ref);
  if (!rate || rate.n < 6 || rate.span < 14) return null;
  const avgIntake = full.reduce((a, b) => a + b, 0) / full.length;
  const kcal = round50(avgIntake - (rate.kgPerWeek * KCAL_PER_KG) / 7);
  if (kcal < 1200 || kcal > 6000) return null; // явно битые данные — не используем
  const confidence = full.length >= 21 && rate.n >= 10 ? 'high' : 'medium';
  const weeks = Math.max(2, Math.round(span / 7));
  const trendTxt = Math.abs(rate.kgPerWeek) < 0.05 ? 'средний вес практически не изменился' : `средний вес менялся на ${rate.kgPerWeek > 0 ? '+' : '−'}${Math.abs(rate.kgPerWeek).toFixed(2).replace('.', ',')} кг/нед`;
  return {
    kcal,
    avgIntake: Math.round(avgIntake),
    kgPerWeek: Math.round(rate.kgPerWeek * 100) / 100,
    days: span,
    loggedDays: full.length,
    weighIns: rate.n,
    confidence,
    text: `За ${weeks} нед. в среднем ~${fmt(round50(avgIntake))} ккал/день, ${trendTxt} → ваш расход ≈ ${fmt(kcal)} ккал.`,
    basis: { kind: 'estimate', sources: ['hall2008'], note: 'энергобаланс по дневнику и тренду веса' },
  };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}
