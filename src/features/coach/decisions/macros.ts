import type { NutritionTarget, UserProfile } from '@/types';
import type { MaintenanceEstimate } from '@/features/science/maintenance';
import { FAT_PER_KG, fiberTarget, GOAL_SHORT, PROTEIN_PER_KG } from '@/features/nutrition/targets';
import { maintenanceConfidence } from './confidence';
import { fmtInt, type Rated } from './types';

/**
 * «Почему такие КБЖУ?» — объяснение цели питания по шагам. Числа берутся из уже рассчитанной цели
 * (computeNutritionTarget / shiftTargetKcal), здесь ничего не пересчитывается заново.
 */
export interface NutritionExplanation {
  rows: { label: string; value: string; why: string }[];
  confidence: Rated;
  data: string[];
}

const k = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

export function explainNutrition(profile: UserProfile, target: NutritionTarget, weightKg: number, maintenance: MaintenanceEstimate | null): NutritionExplanation {
  const mc = maintenanceConfidence(target, maintenance);
  const base = target.source === 'adaptive' && target.observedTdee ? `ваш фактический расход ~${fmtInt(target.observedTdee)} ккал (дневник + тренд веса), смешанный с формулой` : `стартовая оценка расхода ${fmtInt(target.tdee)} ккал (формула Миффлина — Сан Жеора × активность)`;
  const goalTxt = profile.goal === 'bulk' ? `профицит под темп +${k((weightKg * profile.ratePctPerWeek) / 100)} кг/нед` : profile.goal === 'cut' ? `дефицит под темп −${k((weightKg * profile.ratePctPerWeek) / 100)} кг/нед` : profile.goal === 'recomp' ? 'лёгкий дефицит для рекомпозиции' : 'баланс для поддержания веса';
  const rows = [
    { label: 'Калории', value: `${fmtInt(target.kcal)} ккал`, why: `${base}; ${goalTxt}${target.adjustmentKcal ? `; корректировки по тренду ${target.adjustmentKcal > 0 ? '+' : ''}${target.adjustmentKcal} ккал` : ''}.` },
    { label: 'Белок', value: `${target.protein} г`, why: `${k(target.protein / weightKg)} г/кг (норма RYNJI для цели «${GOAL_SHORT[profile.goal].toLowerCase()}» — ${k(PROTEIN_PER_KG[profile.goal])} г/кг${Math.abs(target.protein / weightKg - PROTEIN_PER_KG[profile.goal]) > 0.15 ? ' от референсного веса' : ''}). Научный диапазон для роста и сохранения мышц — 1,6–2,2 г/кг (Morton 2018; Nunes 2022), на сушке ближе к верхней границе (Helms 2014).` },
    { label: 'Жиры', value: `${target.fat} г`, why: `${k(target.fat / weightKg)} г/кг — не ниже ${k(FAT_PER_KG[profile.goal])} г/кг и 22% калорий: минимум для гормонального здоровья и усвоения витаминов (диапазон 20–35% энергии, IOM 2005).` },
    { label: 'Углеводы', value: `${target.carbs} г`, why: 'Всё, что осталось после белка и жиров: основное топливо для тренировок.' },
    { label: 'Клетчатка', value: `${target.fiber ?? fiberTarget(target.kcal)} г`, why: '14 г на каждые 1000 ккал (IOM 2005).' },
  ];
  const data: string[] = [];
  if (maintenance) data.push(maintenance.text);
  data.push(`вес в расчёте: ${k(weightKg)} кг (тренд, не одно взвешивание)`);
  data.push('при каждом изменении калорий белок, жиры и углеводы пересчитываются автоматически');
  return { rows, confidence: mc, data };
}
