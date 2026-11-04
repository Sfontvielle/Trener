import type { CalcStep, GoalType, NutritionTarget, UserProfile } from '@/types';
import { clamp, round } from '@/utils/format';
import { BRAND } from '@/config/brand';

/**
 * Стартовый расчёт КБЖУ — только начальная оценка (initial estimate). Дальше калории корректируются по
 * фактическим данным пользователя: тренд веса, талия, силовые, дневник (adaptive.ts → science/calories.ts).
 *
 * Основания (подробно — docs/SCIENCE.md):
 *  • основной обмен — Mifflin–St Jeor (Mifflin 1990; точнее других формул по Frankenfield 2005);
 *  • бытовая активность — множитель по шагам/работе (ЭВРИСТИКА RYNJI, близкая к классическим PAL 1.2–1.6);
 *  • тренировки — MET силовой ~3.5–6 (Compendium 2024) → ~0.07 ккал/кг/мин сверх покоя (ЭВРИСТИКА-усреднение);
 *  • набор — 0.25–0.5% массы/нед (Iraki 2019), профицит ограничен 150–500 ккал; сушка — ≤1%/нед, дефицит ≤25%;
 *  • белок 1.6–2.2 г/кг (Morton 2018; ISSN 2017), на сушке выше (Helms 2014);
 *  • жиры ≥20–35% энергии (AMDR, IOM 2005) — берём не меньше 22% и не меньше ~0.8 г/кг;
 *  • клетчатка 14 г на 1000 ккал (Adequate Intake, IOM 2005);
 *  • углеводы — остаток энергии.
 */

/** Клетчатка: 14 г на 1000 ккал (IOM Adequate Intake), округление до 5 г */
export function fiberTarget(kcal: number): number {
  return Math.max(20, Math.round((kcal * 14) / 1000 / 5) * 5);
}

export const GOAL_LABEL: Record<GoalType, string> = {
  bulk: 'Набор мышечной массы',
  cut: 'Сушка',
  recomp: 'Рекомпозиция',
  maintain: 'Поддержание формы',
};

export const GOAL_SHORT: Record<GoalType, string> = {
  bulk: 'Набор',
  cut: 'Сушка',
  recomp: 'Рекомпозиция',
  maintain: 'Поддержание',
};

/** Рекомендуемый темп по умолчанию, % массы тела в неделю */
export function defaultRate(goal: GoalType, level: UserProfile['level']): number {
  if (goal === 'bulk') return level === 'beginner' ? 0.5 : level === 'intermediate' ? 0.35 : 0.25;
  if (goal === 'cut') return 0.6;
  return 0;
}

/** Целевой темп изменения веса, кг/неделю (знак = направление) */
export function targetWeeklyChangeKg(profile: Pick<UserProfile, 'goal' | 'ratePctPerWeek'>, weightKg: number): number {
  const rate = profile.ratePctPerWeek / 100;
  if (profile.goal === 'bulk') return weightKg * rate;
  if (profile.goal === 'cut') return -weightKg * rate;
  return 0;
}

export function bmrMifflin(p: Pick<UserProfile, 'sex' | 'age' | 'heightCm'>, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function nonTrainingFactor(p: Pick<UserProfile, 'stepsPerDay' | 'workStyle'>): { factor: number; note: string } {
  const steps = p.stepsPerDay;
  let f = 1.2;
  if (steps >= 12000) f += 0.3;
  else if (steps >= 9000) f += 0.22;
  else if (steps >= 6500) f += 0.14;
  else if (steps >= 4000) f += 0.07;
  if (p.workStyle === 'physical') f += 0.12;
  else if (p.workStyle === 'mixed') f += 0.05;
  return { factor: Math.round(f * 100) / 100, note: `${Math.round(steps / 100) * 100} шагов/день, работа: ${p.workStyle === 'desk' ? 'сидячая' : p.workStyle === 'mixed' ? 'смешанная' : 'физическая'}` };
}

/** Средний расход на силовые, ккал/день (≈0.07 ккал/кг/мин сверх покоя) */
export function trainingKcalPerDay(p: Pick<UserProfile, 'daysPerWeek' | 'sessionMinutes'>, weightKg: number): number {
  return (p.daysPerWeek * p.sessionMinutes * 0.07 * weightKg) / 7;
}

/** Вес для расчёта белка: при высоком ИМТ используем «референсный» вес */
function proteinBaseWeight(heightCm: number, weightKg: number): number {
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  if (bmi <= 28) return weightKg;
  return 27 * h * h;
}

/**
 * Правило владельца (R1): белок 2 г/кг, жиры 1 г/кг, углеводы — остаток калорий (ориентир 3–5 г/кг).
 * На сушке белка больше и жиров меньше: 2,2 и 0,8 г/кг — белок бережёт мышцы в дефиците (Helms 2014).
 * Прибавка калорий на наборе (вес стоит) целиком уходит в углеводы — белок и жиры привязаны к весу тела.
 */
export const PROTEIN_PER_KG: Record<GoalType, number> = { bulk: 2.0, cut: 2.2, recomp: 2.0, maintain: 2.0 };
export const FAT_PER_KG: Record<GoalType, number> = { bulk: 1.0, cut: 0.8, recomp: 1.0, maintain: 1.0 };
/** Ориентир углеводов для силовых тренировок, г/кг */
export const CARBS_RANGE_PER_KG: [number, number] = [3, 5];

export function computeNutritionTarget(
  profile: UserProfile,
  opts: { weightKg?: number; adjustmentKcal?: number; observedTdee?: number; observedConfidence?: 'medium' | 'high' } = {},
): NutritionTarget {
  const w = opts.weightKg ?? profile.weightKg;
  const adj = opts.adjustmentKcal ?? 0;
  const steps: CalcStep[] = [];

  const bmr = bmrMifflin(profile, w);
  steps.push({ label: 'Основной обмен', value: `${round(bmr, 10)} ккал`, note: 'Формула Миффлина — Сан Жеора (оценка, точность ±10% у большинства людей)' });

  const nt = nonTrainingFactor(profile);
  const neat = bmr * nt.factor;
  steps.push({ label: 'Бытовая активность', value: `×${nt.factor.toFixed(2)}`, note: nt.note });

  const train = trainingKcalPerDay(profile, w);
  steps.push({ label: 'Тренировки', value: `+${round(train, 10)} ккал/день`, note: `${profile.daysPerWeek}× по ~${profile.sessionMinutes} мин, в среднем на день` });

  let tdee = neat + train;
  let source: NutritionTarget['source'] = 'formula';
  if (opts.observedTdee && opts.observedTdee > 1200) {
    // Смешиваем формулу и фактический расход (дневник + тренд веса): чем больше данных, тем больше вес факта
    const wObs = opts.observedConfidence === 'high' ? 0.85 : 0.6;
    tdee = tdee * (1 - wObs) + opts.observedTdee * wObs;
    source = 'adaptive';
    steps.push({ label: 'Ваш фактический расход', value: `${round(opts.observedTdee, 10)} ккал`, note: `По дневнику питания и тренду веса (вес в расчёте ${Math.round(wObs * 100)}%). Формула — только стартовая оценка` });
  }
  steps.push({ label: 'Расход за сутки', value: `${round(tdee, 10)} ккал` });

  let goalDelta = 0;
  const kgPerWeek = targetWeeklyChangeKg(profile, w);
  if (profile.goal === 'bulk') {
    goalDelta = clamp((kgPerWeek * 7700) / 7, 150, 500);
    steps.push({ label: 'Профицит', value: `+${round(goalDelta, 10)} ккал (~${Math.round((goalDelta / tdee) * 100)}%)`, note: `Контролируемый набор: +${kgPerWeek.toFixed(2)} кг/нед (${profile.ratePctPerWeek}% массы; ориентир 0,25–0,5%/нед — Iraki 2019). ${BRAND} будет отслеживать тренд веса, талию и силовые и при необходимости корректировать калорийность` });
  } else if (profile.goal === 'cut') {
    goalDelta = -clamp((-kgPerWeek * 7700) / 7, 250, tdee * 0.25);
    steps.push({ label: 'Дефицит', value: `${round(goalDelta, 10)} ккал`, note: `Цель ${kgPerWeek.toFixed(2)} кг/нед, не больше 25% от расхода` });
  } else if (profile.goal === 'recomp') {
    goalDelta = -Math.min(tdee * 0.08, 250);
    steps.push({ label: 'Лёгкий дефицит', value: `${round(goalDelta, 10)} ккал`, note: 'Рекомпозиция: вес ≈ стабилен, силовые растут' });
  } else {
    steps.push({ label: 'Баланс', value: '0 ккал', note: 'Поддержание веса' });
  }

  if (adj !== 0) steps.push({ label: 'Адаптивная корректировка', value: `${adj > 0 ? '+' : ''}${adj} ккал`, note: 'По реальному тренду веса' });

  const floor = Math.max(bmr * 1.05, profile.sex === 'male' ? 1500 : 1250);
  const kcal = round(Math.max(floor, tdee + goalDelta + adj), 10);

  const m = macrosFor(profile, w, kcal);
  const { protein, fat, carbs, fiber } = m;
  steps.push(...m.steps);

  return {
    kcal,
    protein,
    fat,
    carbs,
    fiber,
    tdee: round(tdee, 10),
    bmr: round(bmr, 10),
    source,
    adjustmentKcal: adj,
    observedTdee: source === 'adaptive' ? Math.round(opts.observedTdee!) : undefined,
    observedConfidence: source === 'adaptive' ? opts.observedConfidence ?? 'medium' : undefined,
    basisWeightKg: Math.round(w * 10) / 10,
    steps,
    computedAt: Date.now(),
  };
}

/**
 * Макросы под калорийность: белок и жиры — в г/кг (PROTEIN_PER_KG, FAT_PER_KG), углеводы — остаток калорий.
 * Жиры не ниже 20% энергии (нижняя граница AMDR, IOM 2005), клетчатка 14 г/1000 ккал.
 * Вызывается при ЛЮБОМ изменении калорий и веса — КБЖУ всегда согласованы с калорийностью и весом.
 */
export function macrosFor(profile: Pick<UserProfile, 'goal' | 'heightCm'>, w: number, kcal: number): { protein: number; fat: number; carbs: number; fiber: number; proteinPerKg: number; fatPerKg: number; carbsPerKg: number; steps: CalcStep[] } {
  const pBase = proteinBaseWeight(profile.heightCm, w);
  const protein = round(pBase * PROTEIN_PER_KG[profile.goal], 5);
  const fat = round(Math.max(w * FAT_PER_KG[profile.goal], (kcal * 0.2) / 9), 5);
  const carbs = Math.max(60, round((kcal - protein * 4 - fat * 9) / 4, 5));
  const fiber = fiberTarget(kcal);
  const carbsPerKg = Math.round((carbs / w) * 10) / 10;
  const [lo, hi] = CARBS_RANGE_PER_KG;
  const kgTxt = (x: number) => String(x).replace('.', ',');
  const carbsNote =
    carbsPerKg < lo
      ? `Остаток калорий: ${kgTxt(carbsPerKg)} г/кг — ниже ориентира ${lo}–${hi} г/кг для силовых; на тяжёлых тренировках может не хватать энергии`
      : carbsPerKg > hi
        ? `Остаток калорий: ${kgTxt(carbsPerKg)} г/кг — выше ${hi} г/кг: так бывает на наборе с большим расходом`
        : `Остаток калорий: ${kgTxt(carbsPerKg)} г/кг (ориентир ${lo}–${hi} г/кг)`;
  return {
    protein,
    fat,
    carbs,
    fiber,
    proteinPerKg: PROTEIN_PER_KG[profile.goal],
    fatPerKg: FAT_PER_KG[profile.goal],
    carbsPerKg,
    steps: [
      { label: 'Белок', value: `${protein} г`, note: `${kgTxt(PROTEIN_PER_KG[profile.goal])} г/кг${pBase !== w ? ' (от референсного веса)' : ''}` },
      { label: 'Жиры', value: `${fat} г`, note: `${kgTxt(FAT_PER_KG[profile.goal])} г/кг, не меньше 20% калорий` },
      { label: 'Углеводы', value: `${carbs} г`, note: carbsNote },
      { label: 'Клетчатка', value: `${fiber} г`, note: '14 г на 1000 ккал (IOM)' },
    ],
  };
}

/**
 * Вес изменился — пересчитать КБЖУ под новый вес при той же калорийности: белок и жиры следуют за весом,
 * углеводы — остаток. Калорийность меняет только адаптивный обзор (по тренду веса, с подтверждением).
 */
export function retargetForWeight(profile: Pick<UserProfile, 'goal' | 'heightCm'>, prev: NutritionTarget, w: number): NutritionTarget {
  const m = macrosFor(profile, w, prev.kcal);
  const keep = prev.steps.filter((s) => !['Белок', 'Жиры', 'Углеводы', 'Клетчатка'].includes(s.label));
  return { ...prev, protein: m.protein, fat: m.fat, carbs: m.carbs, fiber: m.fiber, basisWeightKg: Math.round(w * 10) / 10, steps: [...keep, ...m.steps], computedAt: Date.now() };
}

/**
 * Изменить калорийность цели на delta с пересчётом макросов. База (формула или персональный расход) сохраняется,
 * итог — ровно «было + delta»: тренд веса может слегка сдвинуть формулу, но пользователь видит именно +100/150.
 */
export function shiftTargetKcal(profile: UserProfile, prev: NutritionTarget, w: number, delta: number, note: string): NutritionTarget {
  const kcal = round(prev.kcal + delta, 10);
  const m = macrosFor(profile, w, kcal);
  const keep = prev.steps.filter((s) => !['Белок', 'Жиры', 'Углеводы', 'Клетчатка'].includes(s.label));
  return {
    ...prev,
    kcal,
    protein: m.protein,
    fat: m.fat,
    carbs: m.carbs,
    fiber: m.fiber,
    adjustmentKcal: (prev.adjustmentKcal ?? 0) + delta,
    basisWeightKg: Math.round(w * 10) / 10,
    steps: [...keep, { label: 'Адаптивная корректировка', value: `${delta > 0 ? '+' : ''}${delta} ккал`, note }, ...m.steps],
    computedAt: Date.now(),
  };
}
