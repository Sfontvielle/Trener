/**
 * Канонические идентификаторы мышц — общие для 2D-карты приложения и будущих 3D-моделей (мужской и женской).
 *
 * Формат: латинское анатомическое название в snake_case, головка или часть — через подчёркивание
 * (`deltoid_anterior`, `pectoralis_major_clavicular`). Сторона — суффикс Blender: `.L` / `.R`
 * (`deltoid_anterior.L`). Объекты мышц в .blend называются так же (или переводятся через карту соответствия
 * в tools/anatomy3d/asset_map.json), подсветка упражнения задаётся этими id, а не 17 группами приложения.
 *
 * slug — группа приложения (данные упражнений, фильтры, нагрузка), shapes — контуры 2D-фигуры
 * (src/features/exercises/anatomy/geometry.ts). Глубокие мышцы (deep) на поверхности не видны: у них нет
 * 2D-контура, в 3D они подсвечиваются только в «анатомическом» слое под поверхностными.
 */
import type { MuscleSlug } from '@/types';

export type Side = 'L' | 'R';
export type View = 'front' | 'back' | 'both';

export interface MuscleDef {
  /** Подпись в легенде */
  label: string;
  slug: MuscleSlug | null;
  /** С какой стороны фигуры мышца видна на поверхности */
  view: View;
  depth: 'superficial' | 'deep';
  /** Контуры 2D-фигуры (id без стороны) */
  shapes: readonly string[];
}

export const MUSCLES = {
  // шея
  sternocleidomastoid: { label: 'Грудино-ключично-сосцевидная', slug: 'neck', view: 'front', depth: 'superficial', shapes: ['scm'] },
  splenius_capitis: { label: 'Ременная мышца головы', slug: 'neck', view: 'back', depth: 'superficial', shapes: ['splenius'] },
  // грудь
  pectoralis_major_clavicular: { label: 'Большая грудная: ключичная часть (верх груди)', slug: 'chest', view: 'front', depth: 'superficial', shapes: ['pec-clav'] },
  pectoralis_major_sternal: { label: 'Большая грудная: грудино-рёберная часть (середина)', slug: 'chest', view: 'front', depth: 'superficial', shapes: ['pec-stern'] },
  pectoralis_major_abdominal: { label: 'Большая грудная: брюшная часть (низ груди)', slug: 'chest', view: 'front', depth: 'superficial', shapes: ['pec-stern'] },
  pectoralis_minor: { label: 'Малая грудная', slug: 'chest', view: 'front', depth: 'deep', shapes: [] },
  serratus_anterior: { label: 'Передняя зубчатая', slug: null, view: 'front', depth: 'superficial', shapes: ['serr-1', 'serr-2', 'serr-3'] },
  // плечо
  deltoid_anterior: { label: 'Дельтовидная: передний пучок', slug: 'deltoids', view: 'front', depth: 'superficial', shapes: ['delt-ant'] },
  deltoid_lateral: { label: 'Дельтовидная: средний пучок', slug: 'deltoids', view: 'both', depth: 'superficial', shapes: ['delt-lat', 'delt-lat-b'] },
  deltoid_posterior: { label: 'Дельтовидная: задний пучок', slug: 'deltoids', view: 'back', depth: 'superficial', shapes: ['delt-post'] },
  supraspinatus: { label: 'Надостная', slug: 'upper-back', view: 'back', depth: 'deep', shapes: [] },
  infraspinatus: { label: 'Подостная', slug: 'upper-back', view: 'back', depth: 'superficial', shapes: ['infraspin'] },
  teres_minor: { label: 'Малая круглая', slug: 'upper-back', view: 'back', depth: 'superficial', shapes: [] },
  teres_major: { label: 'Большая круглая', slug: 'upper-back', view: 'back', depth: 'superficial', shapes: ['teres'] },
  // спина
  trapezius_upper: { label: 'Трапециевидная: верхняя часть', slug: 'trapezius', view: 'both', depth: 'superficial', shapes: ['trap-f', 'trap'] },
  trapezius_middle: { label: 'Трапециевидная: средняя часть', slug: 'trapezius', view: 'back', depth: 'superficial', shapes: ['trap'] },
  trapezius_lower: { label: 'Трапециевидная: нижняя часть', slug: 'trapezius', view: 'back', depth: 'superficial', shapes: ['trap'] },
  rhomboid_major: { label: 'Большая ромбовидная', slug: 'upper-back', view: 'back', depth: 'superficial', shapes: ['rhomboid'] },
  rhomboid_minor: { label: 'Малая ромбовидная', slug: 'upper-back', view: 'back', depth: 'deep', shapes: [] },
  latissimus_dorsi: { label: 'Широчайшая мышца спины', slug: 'upper-back', view: 'both', depth: 'superficial', shapes: ['lat', 'lat-f'] },
  erector_spinae: { label: 'Мышца, выпрямляющая позвоночник', slug: 'lower-back', view: 'back', depth: 'superficial', shapes: ['erector'] },
  // руки
  biceps_brachii_long: { label: 'Бицепс плеча: длинная головка', slug: 'biceps', view: 'front', depth: 'superficial', shapes: ['biceps'] },
  biceps_brachii_short: { label: 'Бицепс плеча: короткая головка', slug: 'biceps', view: 'front', depth: 'superficial', shapes: ['biceps'] },
  brachialis: { label: 'Плечевая', slug: 'biceps', view: 'front', depth: 'superficial', shapes: ['brachialis'] },
  triceps_long: { label: 'Трицепс: длинная головка', slug: 'triceps', view: 'back', depth: 'superficial', shapes: ['tri-long', 'triceps-f'] },
  triceps_lateral: { label: 'Трицепс: латеральная головка', slug: 'triceps', view: 'back', depth: 'superficial', shapes: ['tri-lat'] },
  triceps_medial: { label: 'Трицепс: медиальная головка', slug: 'triceps', view: 'back', depth: 'deep', shapes: [] },
  brachioradialis: { label: 'Плечелучевая', slug: 'forearm', view: 'front', depth: 'superficial', shapes: ['brachiorad'] },
  forearm_flexors: { label: 'Сгибатели запястья и пальцев', slug: 'forearm', view: 'both', depth: 'superficial', shapes: ['flexors', 'flexors-b'] },
  forearm_extensors: { label: 'Разгибатели запястья и пальцев', slug: 'forearm', view: 'back', depth: 'superficial', shapes: ['extensors'] },
  // живот
  rectus_abdominis: { label: 'Прямая мышца живота', slug: 'abs', view: 'front', depth: 'superficial', shapes: ['rectus'] },
  external_oblique: { label: 'Наружная косая мышца живота', slug: 'obliques', view: 'both', depth: 'superficial', shapes: ['oblique', 'oblique-b'] },
  internal_oblique: { label: 'Внутренняя косая мышца живота', slug: 'obliques', view: 'front', depth: 'deep', shapes: [] },
  // таз
  gluteus_maximus: { label: 'Большая ягодичная', slug: 'gluteal', view: 'back', depth: 'superficial', shapes: ['glute-max'] },
  gluteus_medius: { label: 'Средняя ягодичная', slug: 'gluteal', view: 'back', depth: 'superficial', shapes: ['glute-med'] },
  tensor_fasciae_latae: { label: 'Напрягатель широкой фасции', slug: null, view: 'front', depth: 'superficial', shapes: ['tfl'] },
  // бедро спереди и изнутри
  rectus_femoris: { label: 'Квадрицепс: прямая мышца бедра', slug: 'quadriceps', view: 'front', depth: 'superficial', shapes: ['rect-fem'] },
  vastus_lateralis: { label: 'Квадрицепс: латеральная широкая', slug: 'quadriceps', view: 'front', depth: 'superficial', shapes: ['vast-lat'] },
  vastus_medialis: { label: 'Квадрицепс: медиальная широкая', slug: 'quadriceps', view: 'front', depth: 'superficial', shapes: ['vast-med'] },
  vastus_intermedius: { label: 'Квадрицепс: промежуточная широкая', slug: 'quadriceps', view: 'front', depth: 'deep', shapes: [] },
  sartorius: { label: 'Портняжная', slug: null, view: 'front', depth: 'superficial', shapes: ['sartorius'] },
  adductor_longus: { label: 'Длинная приводящая', slug: 'adductors', view: 'front', depth: 'superficial', shapes: ['add-long'] },
  adductor_magnus: { label: 'Большая приводящая', slug: 'adductors', view: 'back', depth: 'superficial', shapes: ['add-mag'] },
  gracilis: { label: 'Тонкая мышца', slug: 'adductors', view: 'both', depth: 'superficial', shapes: ['gracilis-f', 'gracilis-b'] },
  // бедро сзади
  biceps_femoris: { label: 'Двуглавая мышца бедра', slug: 'hamstring', view: 'back', depth: 'superficial', shapes: ['bic-fem'] },
  semitendinosus: { label: 'Полусухожильная', slug: 'hamstring', view: 'back', depth: 'superficial', shapes: ['semiten'] },
  semimembranosus: { label: 'Полуперепончатая', slug: 'hamstring', view: 'back', depth: 'superficial', shapes: ['semimem'] },
  // голень
  gastrocnemius_medial: { label: 'Икроножная: медиальная головка', slug: 'calves', view: 'both', depth: 'superficial', shapes: ['gastro-med', 'gastro-med-f'] },
  gastrocnemius_lateral: { label: 'Икроножная: латеральная головка', slug: 'calves', view: 'back', depth: 'superficial', shapes: ['gastro-lat'] },
  soleus: { label: 'Камбаловидная', slug: 'calves', view: 'both', depth: 'superficial', shapes: ['soleus-f', 'soleus-l', 'soleus-m'] },
  fibularis_longus: { label: 'Длинная малоберцовая', slug: 'calves', view: 'front', depth: 'superficial', shapes: ['peroneus'] },
  tibialis_anterior: { label: 'Передняя большеберцовая', slug: 'tibialis', view: 'front', depth: 'superficial', shapes: ['tib-ant'] },
} as const satisfies Record<string, MuscleDef>;

export type MuscleId = keyof typeof MUSCLES;
/** Мышца с указанием стороны: `deltoid_anterior.L` */
export type SidedMuscleId = `${MuscleId}.${Side}`;

export const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];

/** Обе стороны мышцы — для подсветки упражнения, выполняемого двумя руками/ногами */
export function bothSides(id: MuscleId): SidedMuscleId[] {
  return [`${id}.L`, `${id}.R`];
}

/** Канонические мышцы группы приложения (для упражнений без уточнения по головкам) */
export function musclesOfSlug(slug: MuscleSlug): MuscleId[] {
  return MUSCLE_IDS.filter((m) => MUSCLES[m].slug === slug);
}
