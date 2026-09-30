import type { CalcStep, GoalType, NutritionTarget, UserProfile } from '@/types';
import { clamp, round } from '@/utils/format';

/**
 * Стартовый расчёт КБЖУ. Это адаптивный baseline, а не «идеальная формула»:
 * после 2–3 недель данных FORM корректирует калории по реальному тренду веса (adaptive.ts).
 */

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

const PROTEIN_PER_KG: Record<GoalType, number> = { bulk: 1.8, cut: 2.2, recomp: 2.0, maintain: 1.6 };
const FAT_PER_KG: Record<GoalType, number> = { bulk: 0.9, cut: 0.8, recomp: 0.85, maintain: 0.9 };

export function computeNutritionTarget(
  profile: UserProfile,
  opts: { weightKg?: number; adjustmentKcal?: number; observedTdee?: number } = {},
): NutritionTarget {
  const w = opts.weightKg ?? profile.weightKg;
  const adj = opts.adjustmentKcal ?? 0;
  const steps: CalcStep[] = [];

  const bmr = bmrMifflin(profile, w);
  steps.push({ label: 'Основной обмен (BMR)', value: `${round(bmr, 10)} ккал`, note: 'Формула Миффлина — Сан Жеора' });

  const nt = nonTrainingFactor(profile);
  const neat = bmr * nt.factor;
  steps.push({ label: 'Бытовая активность', value: `×${nt.factor.toFixed(2)}`, note: nt.note });

  const train = trainingKcalPerDay(profile, w);
  steps.push({ label: 'Тренировки', value: `+${round(train, 10)} ккал/день`, note: `${profile.daysPerWeek}× по ~${profile.sessionMinutes} мин, в среднем на день` });

  let tdee = neat + train;
  let source: NutritionTarget['source'] = 'formula';
  if (opts.observedTdee && opts.observedTdee > 1200) {
    // Смешиваем формулу и фактический расход (по дневнику + тренду веса)
    tdee = tdee * 0.3 + opts.observedTdee * 0.7;
    source = 'adaptive';
    steps.push({ label: 'Фактический расход', value: `${round(opts.observedTdee, 10)} ккал`, note: 'По дневнику питания и тренду веса, вес 70%' });
  }
  steps.push({ label: 'Расход (TDEE)', value: `${round(tdee, 10)} ккал` });

  let goalDelta = 0;
  const kgPerWeek = targetWeeklyChangeKg(profile, w);
  if (profile.goal === 'bulk') {
    goalDelta = clamp((kgPerWeek * 7700) / 7, 150, 500);
    steps.push({ label: 'Профицит', value: `+${round(goalDelta, 10)} ккал`, note: `Цель +${kgPerWeek.toFixed(2)} кг/нед (${profile.ratePctPerWeek}% массы)` });
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

  const pBase = proteinBaseWeight(profile.heightCm, w);
  const protein = round(pBase * PROTEIN_PER_KG[profile.goal], 5);
  const fat = round(Math.max(w * FAT_PER_KG[profile.goal], (kcal * 0.22) / 9), 5);
  const carbs = Math.max(60, round((kcal - protein * 4 - fat * 9) / 4, 5));
  steps.push({ label: 'Белок', value: `${protein} г`, note: `${PROTEIN_PER_KG[profile.goal]} г/кг${pBase !== w ? ' (от референсного веса)' : ''}` });
  steps.push({ label: 'Жиры', value: `${fat} г`, note: `≥${FAT_PER_KG[profile.goal]} г/кг и ≥22% калорий` });
  steps.push({ label: 'Углеводы', value: `${carbs} г`, note: 'Остаток калорий' });

  return {
    kcal,
    protein,
    fat,
    carbs,
    tdee: round(tdee, 10),
    bmr: round(bmr, 10),
    source,
    adjustmentKcal: adj,
    steps,
    computedAt: Date.now(),
  };
}
