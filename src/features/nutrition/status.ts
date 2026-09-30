import type { FoodEntry, Macros } from '@/types';

export const ZERO: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

export function sumMacros(entries: Pick<FoodEntry, 'macros'>[]): Macros {
  return entries.reduce(
    (a, e) => ({
      kcal: a.kcal + e.macros.kcal,
      protein: a.protein + e.macros.protein,
      fat: a.fat + e.macros.fat,
      carbs: a.carbs + e.macros.carbs,
    }),
    { ...ZERO },
  );
}

export function macrosFor(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  return {
    kcal: Math.round(per100.kcal * k),
    protein: Math.round(per100.protein * k * 10) / 10,
    fat: Math.round(per100.fat * k * 10) / 10,
    carbs: Math.round(per100.carbs * k * 10) / 10,
  };
}

export type MacroState = 'progress' | 'target' | 'attention' | 'off';

/**
 * Цвет состояния:
 *  target    — в целевом диапазоне (зелёный)
 *  progress  — ещё набираем, всё нормально (нейтральный акцент)
 *  attention — нужно обратить внимание (жёлтый): лёгкий перебор или заметный недобор к вечеру
 *  off       — существенный перебор/недобор (красный)
 * Белок: недобор важнее перебора. Жиры/калории: перебор важнее.
 */
export function macroState(key: keyof Macros, eaten: number, target: number, dayProgress: number): MacroState {
  if (target <= 0) return 'progress';
  const r = eaten / target;
  const overTol = key === 'protein' ? 0.3 : key === 'kcal' ? 0.05 : 0.1;
  if (r > 1 + overTol * 2.5) return 'off';
  if (r > 1 + overTol) return 'attention';
  if (r >= 0.9) return 'target';
  // Вечером (dayProgress ~1) заметный недобор белка/калорий — внимание
  if (dayProgress >= 0.85) {
    if (key === 'protein' && r < 0.7) return 'off';
    if ((key === 'protein' || key === 'kcal') && r < 0.85) return 'attention';
  }
  return 'progress';
}

/** Доля «пищевого дня» (7:00–22:00), для оценки недобора к вечеру */
export function dayProgress(d = new Date()): number {
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.min(1, Math.max(0, (h - 7) / 15));
}

export function remaining(target: Macros, eaten: Macros): Macros {
  return {
    kcal: target.kcal - eaten.kcal,
    protein: target.protein - eaten.protein,
    fat: target.fat - eaten.fat,
    carbs: target.carbs - eaten.carbs,
  };
}
