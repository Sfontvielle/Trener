import type { WorkoutColor } from '@/types';

/**
 * Цвета своих тренировок (выбор при создании). Яркие, различимые на тёмной и светлой теме; лайм — фирменный.
 * Хранится ключ, а не HEX: палитру можно поменять, не трогая сохранённые тренировки.
 */
export const WORKOUT_COLORS: Record<WorkoutColor, string> = {
  lime: '#C8F53C',
  blue: '#4DA3FF',
  orange: '#FF9F43',
  violet: '#A78BFA',
  pink: '#FF6FAE',
  cyan: '#3DDBD9',
};

export const WORKOUT_COLOR_LABEL: Record<WorkoutColor, string> = {
  lime: 'Лайм',
  blue: 'Синий',
  orange: 'Оранжевый',
  violet: 'Фиолетовый',
  pink: 'Розовый',
  cyan: 'Бирюзовый',
};

export const WORKOUT_COLOR_KEYS = Object.keys(WORKOUT_COLORS) as WorkoutColor[];

export const isWorkoutColor = (x: unknown): x is WorkoutColor => typeof x === 'string' && x in WORKOUT_COLORS;
