import type { BodyArea, Exercise, MovementRestriction } from '@/types';

/**
 * Ограничения описывают ДВИЖЕНИЯ, которые вызывают дискомфорт, — не диагноз.
 * Каждое упражнение помечено типами нагрузки; генератор фильтрует/штрафует по ним ДО обращения к AI.
 */
export const AREA_LABEL: Record<BodyArea, string> = {
  lower_back: 'Поясница',
  shoulder: 'Плечо',
  knee: 'Колено',
  elbow: 'Локоть',
  wrist: 'Запястье',
  hip: 'Тазобедренный',
  neck: 'Шея',
};

export const RESTRICTION_LABEL: Record<MovementRestriction, string> = {
  heavy_axial: 'Тяжёлая осевая нагрузка на позвоночник',
  hip_hinge: 'Наклоны с весом / тяги от пола',
  bent_over: 'Работа в наклоне без опоры',
  spinal_flexion: 'Скручивания',
  spinal_rotation: 'Повороты корпуса',
  overhead_press: 'Жим над головой',
  deep_chest_stretch: 'Глубокое растяжение груди',
  barbell_bench: 'Жим штанги лёжа',
  hanging: 'Вис на перекладине',
  upright_row: 'Тяга к подбородку',
  deep_knee_flexion: 'Глубокий присед',
  lunges: 'Выпады',
  knee_extension: 'Разгибание ног в тренажёре',
  elbow_extension: 'Тяжёлое разгибание локтя (французский жим, брусья)',
  elbow_flexion: 'Тяжёлое сгибание локтя',
  wrist_extension: 'Упор на ладони / нагрузка на запястье',
  hip_flexion: 'Подъём ног / сгибание бедра',
  neck_load: 'Нагрузка на шею',
};

/** Какие движения предлагать для каждой зоны в UI */
export const AREA_MOVEMENTS: Record<BodyArea, MovementRestriction[]> = {
  lower_back: ['heavy_axial', 'hip_hinge', 'bent_over', 'spinal_flexion', 'spinal_rotation'],
  shoulder: ['overhead_press', 'deep_chest_stretch', 'barbell_bench', 'hanging', 'upright_row'],
  knee: ['deep_knee_flexion', 'lunges', 'knee_extension'],
  elbow: ['elbow_extension', 'elbow_flexion'],
  wrist: ['wrist_extension'],
  hip: ['deep_knee_flexion', 'hip_flexion', 'lunges'],
  neck: ['neck_load', 'heavy_axial'],
};

const T: Record<MovementRestriction, string[]> = {
  heavy_axial: ['back_squat', 'front_squat', 'smith_squat', 'good_morning', 'deadlift', 'trap_bar_deadlift', 'ohp', 'clean_press', 'shrug', 'walking_lunge', 'farmers_walk'],
  hip_hinge: ['deadlift', 'trap_bar_deadlift', 'romanian_deadlift', 'db_rdl', 'good_morning', 'kb_swing', 'back_extension', 'clean_press', 'barbell_row', 'tbar_row'],
  bent_over: ['barbell_row', 'tbar_row', 'rear_delt_fly', 'db_kickback', 'good_morning', 'romanian_deadlift', 'db_rdl'],
  spinal_flexion: ['crunch', 'cable_crunch', 'reverse_crunch', 'ab_wheel', 'hanging_leg_raise', 'russian_twist'],
  spinal_rotation: ['russian_twist', 'pallof_press', 'kb_goblet_press'],
  overhead_press: ['ohp', 'seated_db_press', 'arnold_press', 'machine_shoulder_press', 'pike_push_up', 'clean_press', 'thruster_db', 'kb_goblet_press'],
  deep_chest_stretch: ['chest_dip', 'triceps_dip', 'bench_dip', 'db_fly', 'incline_db_fly', 'db_pullover', 'pec_deck', 'decline_push_up'],
  barbell_bench: ['bench_press', 'incline_bench_press', 'decline_bench_press', 'close_grip_bench', 'smith_bench_press'],
  hanging: ['pull_up', 'chin_up', 'assisted_pull_up', 'hanging_leg_raise'],
  upright_row: ['upright_row'],
  deep_knee_flexion: ['back_squat', 'front_squat', 'goblet_squat', 'hack_squat', 'smith_squat', 'bulgarian_split_squat', 'bodyweight_squat', 'leg_press', 'thruster_db', 'nordic_curl'],
  lunges: ['bulgarian_split_squat', 'walking_lunge', 'bodyweight_lunge', 'step_up'],
  knee_extension: ['leg_extension'],
  elbow_extension: ['skullcrusher', 'close_grip_bench', 'triceps_dip', 'bench_dip', 'db_overhead_ext', 'overhead_cable_ext', 'diamond_push_up'],
  elbow_flexion: ['barbell_curl', 'ez_curl', 'preacher_curl', 'reverse_curl', 'chin_up'],
  wrist_extension: ['push_up', 'incline_push_up', 'decline_push_up', 'diamond_push_up', 'pike_push_up', 'front_squat', 'wrist_curl', 'reverse_wrist_curl', 'mountain_climber', 'plank', 'side_plank', 'ab_wheel'],
  hip_flexion: ['hanging_leg_raise', 'reverse_crunch', 'mountain_climber'],
  neck_load: ['shrug', 'db_shrug', 'crunch', 'back_squat'],
};

const BY_EXERCISE = new Map<string, MovementRestriction[]>();
for (const [tag, ids] of Object.entries(T) as [MovementRestriction, string[]][]) {
  for (const id of ids) BY_EXERCISE.set(id, [...(BY_EXERCISE.get(id) ?? []), tag]);
}

export function exerciseStress(ex: Exercise): MovementRestriction[] {
  return BY_EXERCISE.get(ex.id) ?? [];
}

/** Нагружает ли упражнение зону (любое движение из списка зоны) — для «сильной» боли */
export function loadsArea(ex: Exercise, area: BodyArea): boolean {
  const s = exerciseStress(ex);
  return AREA_MOVEMENTS[area].some((m) => s.includes(m));
}
