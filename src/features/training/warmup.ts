import type { Exercise, ExperienceLevel, GymSetup } from '@/types';
import { DEFAULT_GYM, loadKind, platesForSide, roundToEquipment } from './equipment';

export const BAR_KG = 20;

/**
 * Генератор разминки (ЭВРИСТИКА RYNJI по общепринятой силовой практике: «лесенка» к рабочему весу с
 * убывающими повторами, чтобы разогреть движение и не утомить мышцы до рабочих подходов).
 * Разминочные подходы помечаются warmup и НЕ считаются рабочим объёмом.
 *
 * Учитывается:
 *  • рабочий вес и упражнение — только базовые многосуставные; лёгкий вес (< ~40 кг или ≤ гриф+10) — без разминки;
 *  • опыт: новичку хватает 2 шагов, продвинутому с большим весом — до 4 (последний — 1–2 повтора);
 *  • число рабочих подходов: при 1 рабочем подходе разминка полнее (нет «разгонного» первого подхода);
 *  • уже разогрет похожим движением в этой тренировке → один «пристрелочный» подход ~70%;
 *  • привычка пользователя: если в прошлый раз он сделал k разминочных, предлагаем столько же (не больше плана).
 * Веса округляются к реально доступным на оборудовании (вниз).
 */
export interface WarmupInput {
  ex: Exercise;
  workWeight: number;
  workSets?: number;
  level?: ExperienceLevel;
  gym?: GymSetup;
  /** В этой тренировке уже сделаны рабочие подходы на те же мышцы/паттерн */
  warmedSimilar?: boolean;
  /** Сколько разминочных подходов человек сделал в прошлый раз в этом упражнении */
  previousCount?: number;
}

export function warmupPlan(i: WarmupInput): { weight: number; reps: number }[] {
  const { ex, workWeight: W } = i;
  const gym = i.gym ?? DEFAULT_GYM;
  const k = loadKind(ex);
  const bar = k === 'barbell' ? gym.barKg : k === 'ezbar' ? gym.ezBarKg : 0;
  if (ex.mechanic !== 'compound' || k === 'none' || W < 40 || W <= bar + 10) return [];
  const down = (x: number) => roundToEquipment(x, ex, gym, 'down');
  if (i.warmedSimilar) {
    const w = down(W * 0.7);
    return w < W ? [{ weight: w, reps: 3 }] : [];
  }
  const level = i.level ?? 'intermediate';
  // Лестница по % рабочего веса
  let ladder: [number, number][] = W >= 80 || level === 'advanced' ? [[0.5, 5], [0.7, 3], [0.85, 1]] : [[0.5, 5], [0.75, 3]];
  if (level === 'beginner') ladder = ladder.slice(0, 2);
  if ((i.workSets ?? 2) <= 1 && W >= 60) ladder = [[0.5, 5], [0.7, 3], [0.85, 2]];
  const out: { weight: number; reps: number }[] = [];
  // Пустой гриф — только для штанги и только если рабочий заметно тяжелее
  if (bar && W >= bar + 20) out.push({ weight: bar, reps: 10 });
  else if (!bar) out.push({ weight: down(W * 0.4), reps: 8 });
  for (const [pct, reps] of ladder) {
    const w = down(W * pct);
    const lastW = out.length ? out[out.length - 1].weight : 0;
    if (w > lastW && w < W) out.push({ weight: w, reps });
  }
  // Привычка: столько же подходов, сколько человек делал в прошлый раз (оставляем самые тяжёлые)
  if (i.previousCount !== undefined && i.previousCount > 0 && i.previousCount < out.length) return out.slice(out.length - i.previousCount);
  return out;
}

/** Совместимость: прежний вызов (тяжёлое базовое упражнение, обычный зал) */
export function warmupSets(ex: Exercise, workWeight: number): { weight: number; reps: number }[] {
  if (ex.tier !== 1) return [];
  return warmupPlan({ ex, workWeight, level: 'advanced' });
}

/** Блины на одну сторону грифа. null — вес не набирается доступными блинами */
export function platesPerSide(total: number, bar = BAR_KG, plates = DEFAULT_GYM.plates): number[] | null {
  return platesForSide((total - bar) / 2, plates);
}

export function usesBarbell(ex: Exercise): boolean {
  return ex.equipment.includes('barbell');
}
