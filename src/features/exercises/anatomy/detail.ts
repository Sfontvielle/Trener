/**
 * Точная подсветка по пучкам и головкам: в данных упражнения мышцы указаны группами («дельтовидные»),
 * а махи в стороны грузят средний пучок, тяга к лицу — задний, жим на наклонной — верх груди.
 * Здесь — головки фигуры и, для упражнений, где это важно, их роль: p — основная, s — слегка, o — не работает.
 * Остальные упражнения подсвечиваются по группам из данных.
 */
import type { MuscleSlug } from '@/types';

export type Role = 'p' | 's' | 'o';

/** Головки и пучки: подпись, группа приложения, контуры фигуры (спереди и сзади) */
export const HEADS = {
  'delt-ant': { label: 'Передний пучок дельты', slug: 'deltoids', shapes: ['delt-ant'] },
  'delt-lat': { label: 'Средний пучок дельты', slug: 'deltoids', shapes: ['delt-lat', 'delt-lat-b'] },
  'delt-post': { label: 'Задний пучок дельты', slug: 'deltoids', shapes: ['delt-post'] },
  'pec-clav': { label: 'Верх груди (ключичная часть)', slug: 'chest', shapes: ['pec-clav'] },
  'pec-stern': { label: 'Середина и низ груди', slug: 'chest', shapes: ['pec-stern'] },
  serratus: { label: 'Передняя зубчатая', slug: null, shapes: ['serr-1', 'serr-2', 'serr-3'] },
  lat: { label: 'Широчайшие', slug: 'upper-back', shapes: ['lat', 'lat-f'] },
  rhomboid: { label: 'Ромбовидные', slug: 'upper-back', shapes: ['rhomboid'] },
  teres: { label: 'Большая круглая', slug: 'upper-back', shapes: ['teres'] },
  infraspin: { label: 'Подостная', slug: 'upper-back', shapes: ['infraspin'] },
  biceps: { label: 'Бицепс', slug: 'biceps', shapes: ['biceps'] },
  brachialis: { label: 'Плечевая', slug: 'biceps', shapes: ['brachialis'] },
  'tri-long': { label: 'Длинная головка трицепса', slug: 'triceps', shapes: ['tri-long', 'triceps-f'] },
  'tri-lat': { label: 'Латеральная головка трицепса', slug: 'triceps', shapes: ['tri-lat'] },
  brachiorad: { label: 'Плечелучевая', slug: 'forearm', shapes: ['brachiorad'] },
  flexors: { label: 'Сгибатели запястья', slug: 'forearm', shapes: ['flexors', 'flexors-b'] },
  extensors: { label: 'Разгибатели запястья', slug: 'forearm', shapes: ['extensors'] },
  'glute-max': { label: 'Большая ягодичная', slug: 'gluteal', shapes: ['glute-max'] },
  'glute-med': { label: 'Средняя ягодичная', slug: 'gluteal', shapes: ['glute-med'] },
  tfl: { label: 'Напрягатель широкой фасции', slug: null, shapes: ['tfl'] },
  sartorius: { label: 'Портняжная', slug: null, shapes: ['sartorius'] },
  gastro: { label: 'Икроножная', slug: 'calves', shapes: ['gastro-lat', 'gastro-med', 'gastro-med-f'] },
  soleus: { label: 'Камбаловидная', slug: 'calves', shapes: ['soleus-f', 'soleus-l', 'soleus-m'] },
  peroneus: { label: 'Малоберцовые', slug: 'calves', shapes: ['peroneus'] },
} as const satisfies Record<string, { label: string; slug: MuscleSlug | null; shapes: readonly string[] }>;

export type HeadId = keyof typeof HEADS;
type Detail = Partial<Record<HeadId, Role>>;

/** Контур фигуры → его головка (для контуров без головки подсветка — по группе) */
export const HEAD_OF: Record<string, HeadId> = Object.fromEntries(
  (Object.keys(HEADS) as HeadId[]).flatMap((h) => HEADS[h].shapes.map((s) => [s, h])),
);

// Повторяющиеся схемы
const PRESS: Detail = { 'delt-ant': 's', 'delt-lat': 'o', 'delt-post': 'o' };
const INCLINE: Detail = { ...PRESS, 'pec-clav': 'p', 'pec-stern': 's' };
const DECLINE: Detail = { ...PRESS, 'pec-clav': 's', 'pec-stern': 'p' };
const OVERHEAD: Detail = { 'delt-ant': 'p', 'delt-lat': 'p', 'delt-post': 's' };
const SIDE: Detail = { 'delt-lat': 'p', 'delt-ant': 's', 'delt-post': 's' };
const REAR: Detail = { 'delt-post': 'p', 'delt-lat': 's', 'delt-ant': 'o', rhomboid: 's', infraspin: 's', teres: 's', lat: 'o' };
const ROW: Detail = { lat: 'p', rhomboid: 'p', teres: 'p', infraspin: 's', 'delt-post': 's', 'delt-ant': 'o', 'delt-lat': 'o' };
const PULL: Detail = { lat: 'p', teres: 'p', rhomboid: 's', infraspin: 's' };
const CALF_STAND: Detail = { gastro: 'p', soleus: 's' };

export const DETAIL: Record<string, Detail> = {
  bench_press: PRESS,
  db_bench_press: PRESS,
  machine_chest_press: PRESS,
  smith_bench_press: PRESS,
  db_fly: PRESS,
  cable_crossover: DECLINE,
  pec_deck: PRESS,
  push_up: { ...PRESS, serratus: 's' },
  incline_bench_press: INCLINE,
  incline_db_press: INCLINE,
  incline_db_fly: INCLINE,
  // ноги на возвышении — нагрузка смещается к верху груди, руки на возвышении — к низу
  decline_push_up: INCLINE,
  incline_push_up: DECLINE,
  decline_bench_press: DECLINE,
  chest_dip: DECLINE,
  close_grip_bench: { ...PRESS, 'pec-stern': 's', 'pec-clav': 's' },
  db_pullover: { lat: 'p', 'pec-stern': 'p', 'pec-clav': 's', serratus: 's', teres: 's' },
  ohp: OVERHEAD,
  seated_db_press: OVERHEAD,
  arnold_press: OVERHEAD,
  machine_shoulder_press: OVERHEAD,
  pike_push_up: OVERHEAD,
  lateral_raise: SIDE,
  cable_lateral_raise: SIDE,
  upright_row: SIDE,
  front_raise: { 'delt-ant': 'p', 'delt-lat': 's', 'delt-post': 'o', 'pec-clav': 's' },
  rear_delt_fly: REAR,
  reverse_pec_deck: REAR,
  band_pull_apart: REAR,
  face_pull: { ...REAR, infraspin: 'p' },
  pull_up: PULL,
  chin_up: PULL,
  assisted_pull_up: PULL,
  lat_pulldown: PULL,
  close_grip_pulldown: PULL,
  straight_arm_pulldown: { lat: 'p', teres: 'p', rhomboid: 'o', infraspin: 'o', 'tri-long': 's', 'tri-lat': 'o' },
  barbell_row: ROW,
  db_row: ROW,
  seated_cable_row: ROW,
  tbar_row: ROW,
  chest_supported_row: ROW,
  machine_row: ROW,
  inverted_row: ROW,
  hammer_curl: { brachiorad: 'p', brachialis: 'p', biceps: 's', flexors: 'o', extensors: 'o' },
  reverse_curl: { brachiorad: 'p', extensors: 'p', flexors: 'o', brachialis: 's', biceps: 's' },
  wrist_curl: { flexors: 'p', brachiorad: 'o', extensors: 'o' },
  reverse_wrist_curl: { extensors: 'p', brachiorad: 's', flexors: 'o' },
  barbell_curl: { flexors: 's', brachiorad: 'o', extensors: 'o' },
  ez_curl: { flexors: 's', brachiorad: 's', extensors: 'o' },
  db_curl: { flexors: 's', brachiorad: 'o', extensors: 'o' },
  cable_curl: { flexors: 's', brachiorad: 'o', extensors: 'o' },
  overhead_cable_ext: { 'tri-long': 'p', 'tri-lat': 's' },
  db_overhead_ext: { 'tri-long': 'p', 'tri-lat': 's' },
  skullcrusher: { 'tri-long': 'p', 'tri-lat': 'p' },
  triceps_pushdown: { 'tri-lat': 'p', 'tri-long': 's' },
  rope_pushdown: { 'tri-lat': 'p', 'tri-long': 's' },
  triceps_dip: { ...DECLINE, 'pec-stern': 's' },
  bench_dip: { ...DECLINE, 'pec-stern': 's' },
  standing_calf_raise: CALF_STAND,
  db_calf_raise: CALF_STAND,
  leg_press_calf: CALF_STAND,
  // колено согнуто — икроножная выключается, работает камбаловидная
  seated_calf_raise: { soleus: 'p', gastro: 's' },
  abductor_machine: { 'glute-med': 'p', tfl: 'p', 'glute-max': 's' },
  cable_kickback: { 'glute-max': 'p', 'glute-med': 's' },
  hip_thrust: { 'glute-max': 'p', 'glute-med': 's' },
  glute_bridge: { 'glute-max': 'p', 'glute-med': 's' },
  single_leg_bridge: { 'glute-max': 'p', 'glute-med': 'p' },
  bulgarian_split_squat: { 'glute-med': 's' },
  step_up: { 'glute-med': 's' },
  hanging_leg_raise: { sartorius: 's', tfl: 's' },
  mountain_climber: { sartorius: 's' },
  ab_wheel: { lat: 's', serratus: 's', teres: 'o', rhomboid: 'o', infraspin: 'o' },
  plank: { serratus: 's' },
};

/** Роль контура фигуры для упражнения: уточнение по головке, иначе — по группе из данных */
export function roleOf(shapeBase: string, slug: MuscleSlug | undefined, primary: Set<string>, secondary: Set<string>, detail?: Detail): Role {
  const head = HEAD_OF[shapeBase];
  const d = head && detail ? detail[head] : undefined;
  if (d) return d;
  if (!slug) return 'o';
  return primary.has(slug) ? 'p' : secondary.has(slug) ? 's' : 'o';
}

/**
 * Подписи для легенды: группы из данных, а где есть уточнение — головки
 * («Средний пучок дельты» вместо «Дельтовидные»).
 */
export function legendNames(primary: MuscleSlug[], secondary: MuscleSlug[], label: Record<MuscleSlug, string>, detail?: Detail): { p: string[]; s: string[] } {
  const p: string[] = [];
  const s: string[] = [];
  const refined = new Set<string>();
  if (detail) {
    for (const h of Object.keys(detail) as HeadId[]) {
      const role = detail[h];
      const slug = HEADS[h].slug;
      if (slug) refined.add(slug);
      if (role === 'p') p.push(HEADS[h].label);
      else if (role === 's') s.push(HEADS[h].label);
    }
  }
  for (const m of primary) if (!refined.has(m) && !p.includes(label[m])) p.push(label[m]);
  for (const m of secondary) if (!primary.includes(m) && !refined.has(m) && !s.includes(label[m])) s.push(label[m]);
  // уточнение по головке группы, указанной в данных, не должно терять её саму из легенды
  return { p, s: s.filter((x) => !p.includes(x)) };
}
