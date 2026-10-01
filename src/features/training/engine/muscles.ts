import type { Exercise, VolumeMuscle } from '@/types';

/**
 * Детальные мышечные группы для расчёта недельного объёма.
 * Библиотека хранит анатомические «слаги» (для карты мышц); здесь — то, что важно для программирования:
 * широчайшие отдельно от верха спины, три пучка дельт отдельно, бицепс бедра и ягодицы — отдельно.
 */
export const VOLUME_MUSCLES: VolumeMuscle[] = ['chest', 'lats', 'upper_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];

export const VM_LABEL: Record<VolumeMuscle, string> = {
  chest: 'Грудь',
  lats: 'Широчайшие',
  upper_back: 'Верх спины',
  front_delts: 'Передняя дельта',
  side_delts: 'Средняя дельта',
  rear_delts: 'Задняя дельта',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  quads: 'Квадрицепс',
  hamstrings: 'Бицепс бедра',
  glutes: 'Ягодицы',
  calves: 'Икры',
  abs: 'Пресс',
};

/** В род. падеже для фраз «… на грудь» */
export const VM_ACC: Record<VolumeMuscle, string> = {
  chest: 'грудь',
  lats: 'широчайшие',
  upper_back: 'верх спины',
  front_delts: 'переднюю дельту',
  side_delts: 'среднюю дельту',
  rear_delts: 'заднюю дельту',
  biceps: 'бицепс',
  triceps: 'трицепс',
  quads: 'квадрицепс',
  hamstrings: 'бицепс бедра',
  glutes: 'ягодицы',
  calves: 'икры',
  abs: 'пресс',
};

export interface FineTargets {
  primary: VolumeMuscle[];
  secondary: VolumeMuscle[];
}

// Исключения из правил «паттерн → мышцы»
const OVERRIDES: Record<string, FineTargets> = {
  close_grip_bench: { primary: ['triceps'], secondary: ['chest', 'front_delts'] },
  diamond_push_up: { primary: ['triceps'], secondary: ['chest'] },
  triceps_dip: { primary: ['triceps'], secondary: ['chest', 'front_delts'] },
  bench_dip: { primary: ['triceps'], secondary: ['chest'] },
  chest_dip: { primary: ['chest'], secondary: ['triceps', 'front_delts'] },
  front_raise: { primary: ['front_delts'], secondary: [] },
  upright_row: { primary: ['side_delts'], secondary: ['upper_back'] },
  band_pull_apart: { primary: ['rear_delts'], secondary: ['upper_back'] },
  face_pull: { primary: ['rear_delts'], secondary: ['upper_back'] },
  chin_up: { primary: ['lats', 'biceps'], secondary: ['upper_back'] },
  db_pullover: { primary: ['lats'], secondary: ['chest', 'triceps'] },
  straight_arm_pulldown: { primary: ['lats'], secondary: [] },
  deadlift: { primary: ['glutes', 'hamstrings'], secondary: ['upper_back', 'quads'] },
  trap_bar_deadlift: { primary: ['glutes', 'quads'], secondary: ['hamstrings', 'upper_back'] },
  kb_swing: { primary: ['glutes', 'hamstrings'], secondary: [] },
  back_extension: { primary: ['glutes'], secondary: ['hamstrings'] },
  superman: { primary: [], secondary: ['glutes'] },
  hip_thrust: { primary: ['glutes'], secondary: ['hamstrings'] },
  adductor_machine: { primary: [], secondary: ['quads'] },
  abductor_machine: { primary: ['glutes'], secondary: [] },
  reverse_curl: { primary: [], secondary: ['biceps'] },
  hammer_curl: { primary: ['biceps'], secondary: [] },
  thruster_db: { primary: ['quads', 'front_delts'], secondary: ['glutes', 'triceps'] },
  clean_press: { primary: ['front_delts', 'quads', 'glutes'], secondary: ['upper_back', 'hamstrings', 'triceps'] },
  kb_goblet_press: { primary: ['abs'], secondary: ['front_delts', 'glutes'] },
  farmers_walk: { primary: [], secondary: ['upper_back'] },
  mountain_climber: { primary: ['abs'], secondary: [] },
  shrug: { primary: ['upper_back'], secondary: [] },
  db_shrug: { primary: ['upper_back'], secondary: [] },
};

const BY_PATTERN: Partial<Record<Exercise['pattern'], FineTargets>> = {
  h_push: { primary: ['chest'], secondary: ['triceps', 'front_delts'] },
  v_push: { primary: ['front_delts'], secondary: ['side_delts', 'triceps'] },
  fly: { primary: ['chest'], secondary: ['front_delts'] },
  lateral: { primary: ['side_delts'], secondary: [] },
  rear_delt: { primary: ['rear_delts'], secondary: ['upper_back'] },
  v_pull: { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  h_pull: { primary: ['upper_back'], secondary: ['lats', 'biceps', 'rear_delts'] },
  shrug: { primary: ['upper_back'], secondary: [] },
  curl: { primary: ['biceps'], secondary: [] },
  tri_ext: { primary: ['triceps'], secondary: [] },
  squat: { primary: ['quads'], secondary: ['glutes'] },
  lunge: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  hinge: { primary: ['hamstrings'], secondary: ['glutes'] },
  leg_ext: { primary: ['quads'], secondary: [] },
  leg_curl: { primary: ['hamstrings'], secondary: [] },
  glute: { primary: ['glutes'], secondary: ['hamstrings'] },
  calf: { primary: ['calves'], secondary: [] },
  core: { primary: ['abs'], secondary: [] },
};

const cache = new Map<string, FineTargets>();

export function fineTargets(ex: Exercise): FineTargets {
  const hit = cache.get(ex.id);
  if (hit) return hit;
  let t = OVERRIDES[ex.id] ?? BY_PATTERN[ex.pattern] ?? { primary: [], secondary: [] };
  // Пользовательские упражнения: опираемся на группы из библиотеки
  if (!OVERRIDES[ex.id] && !BY_PATTERN[ex.pattern]) t = { primary: [], secondary: [] };
  cache.set(ex.id, t);
  return t;
}

export function isSmallMuscle(m: VolumeMuscle): boolean {
  return m === 'biceps' || m === 'triceps' || m === 'calves' || m === 'abs' || m === 'rear_delts' || m === 'front_delts';
}

/**
 * Базовая доля недельного объёма по группам (прямые рабочие подходы).
 * Широчайшие и верх спины вместе ≈ 1.2× от груди; руки и передняя дельта получают много
 * косвенной нагрузки от жимов/тяг — поэтому прямых подходов им нужно меньше. Бицепс бедра и
 * ягодицы — большие мышцы (не «маленькие», как раньше), но ягодицы сильно грузятся приседом/тягой.
 */
export const MUSCLE_SHARE: Record<VolumeMuscle, number> = {
  chest: 1,
  lats: 0.6,
  upper_back: 0.6,
  front_delts: 0,
  side_delts: 0.75,
  rear_delts: 0.5,
  biceps: 0.6,
  triceps: 0.6,
  quads: 1,
  hamstrings: 0.8,
  glutes: 0.5,
  calves: 0.6,
  abs: 0.5,
};
