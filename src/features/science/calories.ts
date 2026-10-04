import type { GoalType } from '@/types';
import type { Basis } from './sources';

/**
 * Решение по калорийности — детерминированные правила поверх наблюдаемых данных.
 *
 * Научная часть:
 *  • стартовый расход — Mifflin–St Jeor (самая точная из распространённых формул: Frankenfield 2005);
 *  • набор: ~0.25–0.5% массы тела в неделю для начинающих/средних, медленнее для продвинутых,
 *    профицит ~10–20% (Iraki 2019); большой профицит повышает прирост жира без доп. выигрыша в силе
 *    у тренированных (Helms 2023);
 *  • энергетическая «цена» килограмма ≈ 7700 ккал — грубое приближение (Hall 2008: точное значение
 *    зависит от состава ткани), поэтому используется только для перевода расхождения темпа в ккал.
 * Эвристики RYNJI (не из источников напрямую, а инженерные правила):
 *  • допуск темпа ±50% от цели (шум тренда при 3–4 взвешиваниях в неделю);
 *  • шаг корректировки 100–200 ккал, не чаще раза в 14 дней;
 *  • талия ≥1 см на 1 кг набора за 3+ недели → набор замедляем, даже если вес «в плане»;
 *  • вес стоит, но силовые растут → сначала ждём ещё неделю (рекомпозиция/вода), а не добавляем еду.
 */
export type CalorieAction = 'insufficient' | 'hold' | 'wait' | 'increase' | 'decrease';

export interface CalorieDecisionInput {
  goal: GoalType;
  /** Целевой темп, кг/нед (со знаком) */
  targetKgPerWeek: number;
  /** Фактический темп тренда, кг/нед; null — данных мало */
  actualKgPerWeek: number | null;
  /** Изменение талии, см/нед (null — нет замеров) */
  waistCmPerWeek: number | null;
  waistDays: number;
  /** Силовые: растут / стоят / неизвестно */
  strength: 'progressing' | 'stalled' | 'unknown';
  /** Доля дней с заполненным дневником за 14 дней (0..1) */
  coverage: number;
  daysSinceLastChange: number;
  bodyWeightKg: number;
}

export interface CalorieDecision {
  action: CalorieAction;
  deltaKcal: number;
  reasons: string[];
  basis: Basis;
}

export const KCAL_PER_KG = 7700;
const MIN_DAYS_BETWEEN = 14;
const step = (kcal: number) => Math.sign(kcal) * Math.min(200, Math.max(100, Math.round(Math.abs(kcal) / 50) * 50));
const kg = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2).replace('.', ',')} кг/нед`;

export function decideCalories(i: CalorieDecisionInput): CalorieDecision {
  const basis: Basis = { kind: 'heuristic', sources: ['iraki2019', 'helms2023', 'hall2008', 'frankenfield2005'], note: 'темпы — из обзоров; допуски и шаги — правила RYNJI' };
  if (i.actualKgPerWeek === null) return { action: 'insufficient', deltaKcal: 0, reasons: ['Нужно ≥5 взвешиваний за 10+ дней — пока решения по одному весу не принимаются.'], basis };
  const r = i.actualKgPerWeek;
  const t = i.targetKgPerWeek;
  const tol = Math.max(0.1, Math.abs(t) * 0.5, i.bodyWeightKg * 0.0012);
  const reasons: string[] = [`Тренд ${kg(r)} при цели ${kg(t)}.`];
  const waistFast = i.waistCmPerWeek !== null && i.waistDays >= 21 && r > 0.05 && i.waistCmPerWeek / r >= 1;
  const wait = i.daysSinceLastChange < MIN_DAYS_BETWEEN;
  const lowData = i.coverage < 0.5;
  if (lowData) reasons.push('Дневник питания заполнен меньше чем наполовину — точность ниже, шаги корректировки минимальные.');

  const propose = (kcal: number, why: string): CalorieDecision => {
    if (wait) return { action: 'wait', deltaKcal: 0, reasons: [...reasons, why, `Калории меняли ${i.daysSinceLastChange} дн. назад — ждём эффекта ещё ${MIN_DAYS_BETWEEN - i.daysSinceLastChange} дн.`], basis };
    const d = lowData ? Math.sign(kcal) * 100 : step(kcal);
    return { action: d > 0 ? 'increase' : 'decrease', deltaKcal: d, reasons: [...reasons, why], basis };
  };

  if (i.goal === 'bulk') {
    if (waistFast) return propose(-150, `Талия растёт на ${i.waistCmPerWeek!.toFixed(1).replace('.', ',')} см/нед — непропорционально весу. Замедляем набор, чтобы он шёл за счёт мышц, а не жира.`);
    if (r > t + tol) return propose(((t - r) * KCAL_PER_KG) / 7, 'Вес растёт быстрее цели — лишний профицит в основном уходит в жир (Helms 2023).');
    if (r < t - tol) {
      if (i.strength === 'progressing' && r > -0.05) return { action: 'hold', deltaKcal: 0, reasons: [...reasons, 'Вес почти стоит, но силовые растут — подождём ещё неделю, прежде чем добавлять калории.'], basis };
      return propose(((t - r) * KCAL_PER_KG) / 7, i.strength === 'stalled' ? 'Вес не растёт и силовые остановились — небольшое повышение калорий.' : 'Вес растёт медленнее цели — небольшое повышение калорий.');
    }
    return { action: 'hold', deltaKcal: 0, reasons: [...reasons, 'Средний вес растёт в целевом диапазоне. Калорийность пока менять не нужно.'], basis };
  }
  if (i.goal === 'cut') {
    if (r < t - tol) return propose(((t - r) * KCAL_PER_KG) / 7, `Вес уходит быстрее цели${i.strength === 'stalled' ? ', силовые проседают' : ''} — растёт риск потери мышц (Helms 2014).`);
    if (r > t + tol) return propose(((t - r) * KCAL_PER_KG) / 7, 'Вес снижается медленнее цели — немного уменьшим калории.');
    return { action: 'hold', deltaKcal: 0, reasons: [...reasons, 'Вес снижается в целевом темпе.'], basis };
  }
  // Поддержание и рекомпозиция: вес ≈ стабилен
  if (Math.abs(r) > tol + 0.05) return propose((-r * KCAL_PER_KG) / 7, r > 0 ? 'Вес растёт при цели «стабильный вес».' : 'Вес снижается при цели «стабильный вес».');
  return { action: 'hold', deltaKcal: 0, reasons: [...reasons, i.goal === 'recomp' && i.waistCmPerWeek !== null && i.waistCmPerWeek < 0 ? 'Вес стабилен, талия уменьшается — рекомпозиция идёт.' : 'Вес стабилен.'], basis };
}
