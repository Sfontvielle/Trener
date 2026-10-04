import type { DailyCheckIn, NutritionTarget, ReadinessResult } from '@/types';
import type { HealthContext } from '@/features/health/model';
import type { MaintenanceEstimate } from '@/features/science/maintenance';
import type { CalorieReview } from '@/features/nutrition/adaptive';
import type { ExerciseHistoryEntry } from '@/features/training/progression';
import type { StepGoal } from '@/features/science/steps';
import type { Rated } from './types';

/**
 * Уровни уверенности — ЭВРИСТИКА RYNJI: сколько и каких данных стоит за решением.
 * Цель — честность: при малом количестве данных тренер прямо говорит, что опирается на формулу/общие правила.
 */

/** Расход (maintenance): формула → средняя (2–3 нед. данных) → высокая (3+ нед., 10+ взвешиваний) */
export function maintenanceConfidence(target: NutritionTarget | null, m: MaintenanceEstimate | null): Rated {
  if (m) {
    const weeks = Math.max(2, Math.round(m.days / 7));
    return { level: m.confidence, note: `персональный расход по ${m.loggedDays} дням дневника и ${m.weighIns} взвешиваниям за ${weeks} нед.` };
  }
  if (target?.source === 'adaptive' && target.observedTdee) return { level: target.observedConfidence ?? 'medium', note: 'цель откалибрована по вашему фактическому расходу' };
  return { level: 'low', note: 'недостаточно истории, пока исходная формула (Миффлин — Сан Жеор, точность ±10%)' };
}

/** Адаптация калорий: тренд веса + полнота дневника */
export function adaptationConfidence(r: CalorieReview | null, weighIns: number): Rated {
  if (!r || r.status === 'insufficient_data') return { level: 'low', note: 'мало взвешиваний — по одному весу решения не принимаются' };
  const cov = Math.round(r.loggingCoverage * 100);
  if (r.loggingCoverage < 0.5) return { level: 'low', note: `дневник питания заполнен ${cov}% дней — точность низкая` };
  if (r.loggingCoverage < 0.7 || weighIns < 8) return { level: 'medium', note: `тренд по ${weighIns} взвешиваниям, дневник ${cov}% дней` };
  return { level: 'high', note: `тренд по ${weighIns} взвешиваниям за 3 нед., дневник ${cov}% дней` };
}

/** Готовность: чек-ин + объективные данные с личной базовой линией */
export function readinessConfidence(r: ReadinessResult | undefined, checkin: DailyCheckIn | undefined, h: HealthContext | undefined): Rated {
  if (!r) return { level: 'low', note: 'нет чек-ина и данных сна — работаем по плану' };
  const objective = [h?.hrvBaseline !== undefined && h?.hrvMs !== undefined, h?.rhrBaseline !== undefined && h?.restingHr !== undefined].filter(Boolean).length;
  if (checkin && objective >= 1) return { level: 'high', note: 'самочувствие + сон + HRV/пульс покоя относительно вашей нормы' };
  if (checkin) return { level: 'medium', note: 'по чек-ину и сну, без HRV/пульса' };
  return { level: 'medium', note: 'только по данным Apple Health, без самочувствия' };
}

/** Прогрессия: сколько тренировок в истории и записан ли RIR */
export function progressionConfidence(history: ExerciseHistoryEntry[]): Rated {
  if (!history.length) return { level: 'low', note: 'нет истории в этом упражнении' };
  const withRir = history.slice(0, 3).filter((h) => h.sets.some((s) => s.rir !== undefined)).length;
  if (history.length === 1) return { level: 'low', note: 'всего одна тренировка в истории' };
  if (history.length >= 3 && withRir >= 2) return { level: 'high', note: `${Math.min(history.length, 6)} тренировок в истории, записан запас повторов (RIR)` };
  return { level: 'medium', note: withRir ? `${history.length} тренировки в истории` : `${history.length} тренировки, без отметок RIR` };
}

export function stepsConfidence(s: StepGoal | null): Rated {
  if (!s || s.source === 'profile') return { level: 'low', note: 'по данным профиля — с Apple Health цель станет точнее' };
  if (s.daysOfData >= 14) return { level: 'high', note: `медиана шагов за ${s.daysOfData} дн. из Apple Health` };
  return { level: 'medium', note: `${s.daysOfData} дн. данных Apple Health` };
}
