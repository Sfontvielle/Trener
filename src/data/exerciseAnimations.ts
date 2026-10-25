// Сгенерировано tools/anim/registry.ts — не редактировать вручную.
import type { MuscleSlug } from '@/types';

/**
 * 3D-анимации техники (зацикленный WebP, офлайн) и постеры для списков. Собственный рендер RYNJI (tools/anim).
 * primary / secondary — мышцы, подсвеченные на рендере (ярко-зелёные / бледные).
 */
export interface ExerciseAnimation {
  loop: number;
  poster: number;
  primary: MuscleSlug[];
  secondary: MuscleSlug[];
  checked: boolean;
}

export const EXERCISE_ANIMATIONS: Record<string, ExerciseAnimation> = {
  bench_press: {
    loop: require('../../assets/anim/bench_press.webp'),
    poster: require('../../assets/anim/posters/bench_press.jpg'),
    primary: ['chest'],
    secondary: ['triceps', 'deltoids'],
    checked: true,
  },
  lat_pulldown: {
    loop: require('../../assets/anim/lat_pulldown.webp'),
    poster: require('../../assets/anim/posters/lat_pulldown.jpg'),
    primary: ['upper-back'],
    secondary: ['biceps', 'forearm'],
    checked: true,
  },
  db_row: {
    loop: require('../../assets/anim/db_row.webp'),
    poster: require('../../assets/anim/posters/db_row.jpg'),
    primary: ['upper-back'],
    secondary: ['biceps', 'deltoids'],
    checked: true,
  },
  db_curl: {
    loop: require('../../assets/anim/db_curl.webp'),
    poster: require('../../assets/anim/posters/db_curl.jpg'),
    primary: ['biceps'],
    secondary: ['forearm'],
    checked: true,
  },
  back_squat: {
    loop: require('../../assets/anim/back_squat.webp'),
    poster: require('../../assets/anim/posters/back_squat.jpg'),
    primary: ['quadriceps', 'gluteal'],
    secondary: ['adductors', 'hamstring', 'lower-back'],
    checked: true,
  },
  romanian_deadlift: {
    loop: require('../../assets/anim/romanian_deadlift.webp'),
    poster: require('../../assets/anim/posters/romanian_deadlift.jpg'),
    primary: ['hamstring', 'gluteal'],
    secondary: ['lower-back', 'forearm'],
    checked: true,
  },
};
