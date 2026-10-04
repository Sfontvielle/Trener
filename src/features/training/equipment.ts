import type { Exercise, GymSetup } from '@/types';

/**
 * Реальные веса оборудования: RYNJI не рекомендует вес, который нельзя поставить (81,7 кг на штанге,
 * 23 кг на гантелях с шагом 2 кг, 52,5 кг на стеке по 5 кг).
 * Значения по умолчанию — типичный зал; пользователь меняет их в «Оборудование зала».
 */
export const DEFAULT_GYM: GymSetup = { barKg: 20, ezBarKg: 10, plates: [25, 20, 15, 10, 5, 2.5, 1.25], dumbbellStep: 2, machineStep: 5 };

export type LoadKind = 'barbell' | 'ezbar' | 'plates' | 'dumbbell' | 'machine' | 'none';

export function loadKind(ex: Pick<Exercise, 'equipment' | 'bodyweight'>): LoadKind {
  const e = ex.equipment;
  if (e.includes('barbell')) return 'barbell';
  if (e.includes('ezbar')) return 'ezbar';
  if (e.includes('smith')) return 'plates';
  if (e.includes('dumbbell') || e.includes('kettlebell')) return 'dumbbell';
  if (e.includes('machine') || e.includes('cable')) return 'machine';
  return 'none';
}

const Q = 0.25; // считаем в «четвертях кило», чтобы не ловить ошибки float

/** Набор блинов на одну сторону (минимум дисков). null — точно не набирается доступными дисками */
export function platesForSide(side: number, plates: number[]): number[] | null {
  if (side < -1e-9) return null;
  const target = Math.round(side / Q);
  if (Math.abs(target * Q - side) > 1e-6) return null;
  const coins = [...new Set(plates)].filter((p) => p > 0).map((p) => Math.round(p / Q)).sort((a, b) => b - a);
  const best: (number[] | null)[] = Array(target + 1).fill(null);
  best[0] = [];
  for (let v = 1; v <= target; v++) {
    for (const c of coins) {
      const prev = v - c >= 0 ? best[v - c] : null;
      if (prev && (!best[v] || prev.length + 1 < best[v]!.length)) best[v] = [...prev, c];
    }
  }
  return best[target] ? best[target]!.map((c) => c * Q).sort((a, b) => b - a) : null;
}

/** Раскладка штанги: блины на каждую сторону */
export function plateLayout(total: number, ex: Pick<Exercise, 'equipment' | 'bodyweight'>, gym: GymSetup = DEFAULT_GYM): { bar: number; perSide: number[] } | null {
  const k = loadKind(ex);
  if (k !== 'barbell' && k !== 'ezbar' && k !== 'plates') return null;
  const bar = k === 'barbell' ? gym.barKg : k === 'ezbar' ? gym.ezBarKg : 0;
  const per = platesForSide((total - bar) / 2, gym.plates);
  return per ? { bar, perSide: per } : null;
}

/** Минимальный реальный шаг для упражнения */
export function equipmentStep(ex: Pick<Exercise, 'equipment' | 'bodyweight' | 'increment'>, gym: GymSetup = DEFAULT_GYM): number {
  const k = loadKind(ex);
  if (k === 'barbell' || k === 'ezbar' || k === 'plates') return 2 * Math.min(...gym.plates);
  if (k === 'dumbbell') return gym.dumbbellStep;
  if (k === 'machine') return gym.machineStep;
  return ex.increment || 2.5;
}

/** Достижимо ли значение на этом оборудовании */
export function isAchievable(w: number, ex: Pick<Exercise, 'equipment' | 'bodyweight' | 'increment'>, gym: GymSetup = DEFAULT_GYM): boolean {
  if (w <= 0) return true;
  const k = loadKind(ex);
  if (k === 'barbell' || k === 'ezbar' || k === 'plates') return !!plateLayout(w, ex, gym);
  const st = equipmentStep(ex, gym);
  return Math.abs(w / st - Math.round(w / st)) < 1e-6;
}

/**
 * Округление к ближайшему реально выставляемому весу. dir: 'down' — не больше (для снижения),
 * 'up' — не меньше (для повышения), 'nearest' — ближайший.
 */
export function roundToEquipment(w: number, ex: Pick<Exercise, 'equipment' | 'bodyweight' | 'increment'>, gym: GymSetup = DEFAULT_GYM, dir: 'nearest' | 'down' | 'up' = 'nearest'): number {
  if (w <= 0) return 0;
  const k = loadKind(ex);
  const step = equipmentStep(ex, gym);
  const min = k === 'barbell' ? gym.barKg : k === 'ezbar' ? gym.ezBarKg : step;
  if (k === 'none') return Math.round(w / step) * step;
  const fine = Q;
  const ok = (x: number) => x >= min - 1e-9 && isAchievable(x, ex, gym);
  const base = Math.round(w / fine) * fine;
  if (ok(base) && (dir === 'nearest' || (dir === 'down' ? base <= w + 1e-9 : base >= w - 1e-9))) return round2(base);
  for (let i = 1; i <= 400; i++) {
    const lo = base - i * fine;
    const hi = base + i * fine;
    if (dir !== 'up' && ok(lo)) return round2(lo);
    if (dir !== 'down' && ok(hi)) return round2(hi);
  }
  return round2(Math.max(min, Math.round(w / step) * step));
}

const round2 = (x: number) => Math.round(x * 100) / 100;
