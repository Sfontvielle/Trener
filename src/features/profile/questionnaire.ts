import type { ActivityLevel, Equipment, ExperienceLevel, GoalType, Sex, TrainingLocation, UserProfile, WorkStyle } from '@/types';
import { EMPTY_HEALTH } from './health';
import { goalPresets, recommendedPreset } from '@/features/coach/decisions/goals';
import { defaultRate } from '@/features/nutrition/targets';

/**
 * Анкета первого запуска — 5 этапов (эталоны onboarding/02–06):
 *   1. имя · 2. пол, возраст (18+), рост, текущий вес · 3. цель · 4. опыт, сколько раз в неделю, длительность, место
 *   (и что есть из оборудования, если не зал) · 5. повседневная активность, сон, ограничения в питании, дополнительно.
 * Личные показатели ничем не заполняются заранее: пока пользователь не ответил, поля пустые и «Продолжить» недоступно.
 * Целевой вес, срок и темп не спрашиваем — темп движок берёт рекомендованный (поле ratePctPerWeek сохраняется).
 * Дни недели не спрашиваем: план расставляет тренировки сам, поменять дни можно в Профиле.
 */
export const Q_STAGES = 5;

export interface QDraft {
  name: string;
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  goal?: GoalType;
  level?: ExperienceLevel;
  /** Тренировок в неделю, 2–6 */
  daysPerWeek?: number;
  /** Старые черновики: дни недели (0 = Пн … 6 = Вс) — переводятся в daysPerWeek */
  days?: number[];
  sessionMinutes?: number;
  location?: TrainingLocation;
  equipment: Equipment[];
  /** Повседневная активность — одним выбором (задаёт работу и шаги для расчёта расхода) */
  activity?: ActivityKey;
  workStyle?: WorkStyle;
  stepsPerDay?: number;
  /** Обычный сон, часов */
  sleepHours?: number;
  /** Ограничения в питании: 'none' или ключ ограничения */
  diet?: string;
  /** «Дополнительно (необязательно)»: аллергии, травмы, особенности — свободный текст */
  limitations: string;
  /** Старые черновики: «есть / нет ограничений» */
  limits?: 'none' | 'some';
}

export function emptyDraft(name = ''): QDraft {
  return { name, equipment: [], limitations: '' };
}

/** Черновик из прошлой версии анкеты → текущий (дни недели → частота, работа + шаги → активность) */
export function migrateDraft(d: QDraft): QDraft {
  const out = { ...d, equipment: d.equipment ?? [], limitations: d.limitations ?? '' };
  if (out.daysPerWeek === undefined && out.days?.length) out.daysPerWeek = Math.min(6, Math.max(2, out.days.length));
  if (!out.activity && out.workStyle && out.stepsPerDay !== undefined) out.activity = activityFromLegacy(out.workStyle, out.stepsPerDay);
  if (out.sessionMinutes === 75) out.sessionMinutes = 60;
  return out;
}

export const RANGE = { age: [18, 90], heightCm: [130, 230], weightKg: [35, 250] } as const;
type NumKey = keyof typeof RANGE;

/** «80,5» → 80.5; пусто или мусор → undefined */
export function parseNumber(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}

export const LEVEL_OPTIONS: { v: ExperienceLevel; label: string; sub: string; years: number }[] = [
  { v: 'beginner', label: 'Новичок', sub: 'Нет опыта или до 6 месяцев', years: 0.3 },
  { v: 'intermediate', label: 'Средний', sub: '6 месяцев – 2 года', years: 1.2 },
  { v: 'advanced', label: 'Опытный', sub: 'Более 2 лет', years: 4 },
];
export const DURATION_OPTIONS = [30, 45, 60, 90];
export const FREQUENCY_RANGE = [2, 6] as const;

/** Где тренируешься: подпись, значок (Ionicons) и стартовое оборудование. Дома и на улице ничего не отмечаем за человека */
export const LOCATION_OPTIONS: { v: TrainingLocation; label: string; icon: string; equipment: Equipment[] }[] = [
  { v: 'gym', label: 'В зале', icon: 'barbell-outline', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar', 'smith', 'kettlebell', 'band'] },
  { v: 'home', label: 'Дома', icon: 'home-outline', equipment: [] },
  { v: 'outdoor', label: 'На улице', icon: 'leaf-outline', equipment: [] },
  { v: 'mixed', label: 'Комбинированно', icon: 'sync-outline', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar', 'smith', 'kettlebell', 'band'] },
];
export const LOCATION_LABEL: Record<TrainingLocation, string> = { gym: 'зал', home: 'дом', outdoor: 'улица', mixed: 'зал и дом' };
/** Что предложить отметить, если тренируешься не в зале */
export const EQUIPMENT_CHOICES: Partial<Record<TrainingLocation, Equipment[]>> = {
  home: ['dumbbell', 'bench', 'pullupbar', 'kettlebell', 'band'],
  outdoor: ['pullupbar', 'band', 'kettlebell'],
};

/**
 * Повседневная активность одним выбором (эталон 06_lifestyle): задаёт тип работы и типичные шаги —
 * два главных множителя бытового расхода (±200–400 ккал). Точные шаги потом подтянутся из Apple Health.
 */
export type ActivityKey = 'low' | 'moderate' | 'high' | 'veryHigh';
export const ACTIVITY_OPTIONS: { v: ActivityKey; label: string; sub: string; workStyle: WorkStyle; steps: number }[] = [
  { v: 'low', label: 'Низкий', sub: 'сидячая работа, мало хожу', workStyle: 'desk', steps: 4000 },
  { v: 'moderate', label: 'Умеренный', sub: 'работа, учёба, небольшая активность', workStyle: 'desk', steps: 7000 },
  { v: 'high', label: 'Высокий', sub: 'много хожу, часто на ногах', workStyle: 'mixed', steps: 10500 },
  { v: 'veryHigh', label: 'Очень высокий', sub: 'физическая работа, весь день в движении', workStyle: 'physical', steps: 13000 },
];
function activityFromLegacy(work: WorkStyle, steps: number): ActivityKey {
  if (work === 'physical') return 'veryHigh';
  if (steps >= 9000 || work === 'mixed') return 'high';
  return steps >= 5000 ? 'moderate' : 'low';
}
/** Ограничения в питании (ключи — как в profile.dietRestrictions) */
export const DIET_OPTIONS: { v: string; label: string }[] = [
  { v: 'none', label: 'Нет' },
  { v: 'vegetarian', label: 'Вегетарианство' },
  { v: 'vegan', label: 'Веганство' },
  { v: 'lactose', label: 'Без лактозы' },
  { v: 'gluten', label: 'Без глютена' },
  { v: 'halal', label: 'Халяль' },
];
export const WORK_OPTIONS: { v: WorkStyle; label: string; sub: string }[] = [
  { v: 'desk', label: 'Сидячая', sub: 'офис, учёба, за рулём' },
  { v: 'mixed', label: 'Смешанная', sub: 'то сижу, то на ногах' },
  { v: 'physical', label: 'Физическая', sub: 'весь день на ногах, тяжёлый труд' },
];
/** Шаги в день — главный множитель бытового расхода (±200–400 ккал). Корзина → типичное значение внутри диапазона */
export const STEP_BUCKETS: { key: string; label: string; steps: number; min: number }[] = [
  { key: 'low', label: 'до 5 тыс', steps: 4000, min: 0 },
  { key: 'mid', label: '5–9 тыс', steps: 7000, min: 5000 },
  { key: 'high', label: '9–12 тыс', steps: 10500, min: 9000 },
  { key: 'top', label: '12 тыс+', steps: 13000, min: 12000 },
];
export const stepBucketOf = (steps: number) => [...STEP_BUCKETS].reverse().find((b) => steps >= b.min)!.key;
export const SLEEP_OPTIONS: { key: string; label: string; hours: number }[] = [
  { key: 'lt6', label: 'меньше 6 ч', hours: 5.5 },
  { key: '6', label: '6–7 ч', hours: 6.5 },
  { key: '7', label: '7–8 ч', hours: 7.5 },
  { key: '8', label: '8 ч+', hours: 8.5 },
];

/** Ошибки введённых значений (пустое — не ошибка, а «ещё не ответил») */
export function draftErrors(d: QDraft): Partial<Record<NumKey, string>> {
  const out: Partial<Record<NumKey, string>> = {};
  const check = (k: NumKey, label: string, unit: string) => {
    const v = d[k];
    if (v === undefined) return;
    const [lo, hi] = RANGE[k];
    if (v < lo || v > hi) out[k] = `${label}: от ${lo} до ${hi} ${unit}`;
  };
  if (d.age !== undefined && d.age < RANGE.age[0]) out.age = 'RYNJI рассчитан на взрослых — с 18 лет.';
  else check('age', 'Возраст', 'лет');
  check('heightCm', 'Рост', 'см');
  check('weightKg', 'Вес', 'кг');
  return out;
}

export function stageComplete(d: QDraft, stage: number): boolean {
  const err = draftErrors(d);
  switch (stage) {
    case 0:
      return d.name.trim().length > 0;
    case 1:
      return !!d.sex && d.age !== undefined && d.heightCm !== undefined && d.weightKg !== undefined && !err.age && !err.heightCm && !err.weightKg;
    case 2:
      return !!d.goal;
    case 3:
      // Дома и на улице можно без оборудования (вес тела); в зале — хотя бы что-то из списка
      return (
        !!d.level &&
        d.daysPerWeek !== undefined &&
        d.daysPerWeek >= FREQUENCY_RANGE[0] &&
        d.daysPerWeek <= FREQUENCY_RANGE[1] &&
        !!d.sessionMinutes &&
        !!d.location &&
        (d.location === 'home' || d.location === 'outdoor' || d.equipment.length > 0)
      );
    case 4:
      // «Дополнительно» — необязательно
      return !!d.activity && d.sleepHours !== undefined && !!d.diet;
    default:
      return false;
  }
}

/** С какого этапа продолжить после перезапуска: сохранённый, но не дальше первого незаполненного */
export function resumeStage(d: QDraft, saved: number): number {
  for (let i = 0; i < Q_STAGES; i++) if (!stageComplete(d, i)) return Math.min(saved, i);
  return Math.min(saved, Q_STAGES);
}

const activityOf = (steps: number): ActivityLevel => (steps < 5000 ? 'sedentary' : steps < 8000 ? 'light' : steps < 11000 ? 'moderate' : 'high');

/** Готовая анкета → профиль. null — если что-то не заполнено (выдумывать недостающее не будем) */
export function draftToProfile(d: QDraft, now: number): UserProfile | null {
  for (let i = 0; i < Q_STAGES; i++) if (!stageComplete(d, i)) return null;
  const sex = d.sex!;
  const level = d.level!;
  const goal = d.goal!;
  const weightKg = d.weightKg!;
  const heightCm = d.heightCm!;
  const rec = goal === 'bulk' || goal === 'cut' ? goalPresets(goal, level, weightKg).find((x) => x.id === recommendedPreset({ goal, level, sex, heightCm, weightKg }).id) : undefined;
  const limitations = d.limitations.trim();
  const act = ACTIVITY_OPTIONS.find((x) => x.v === d.activity)!;
  return {
    name: d.name.trim(),
    sex,
    age: Math.round(d.age!),
    heightCm: Math.round(heightCm),
    weightKg: Math.round(weightKg * 10) / 10,
    goal,
    ratePctPerWeek: rec?.ratePct ?? defaultRate(goal, level),
    level,
    trainingYears: LEVEL_OPTIONS.find((x) => x.v === level)!.years,
    daysPerWeek: d.daysPerWeek!,
    sessionMinutes: d.sessionMinutes!,
    location: d.location!,
    equipment: [...d.equipment],
    limitations,
    health: { ...EMPTY_HEALTH, injuries: limitations },
    avoidExerciseIds: [],
    likedFoods: [],
    dislikedFoods: [],
    dietRestrictions: d.diet && d.diet !== 'none' ? [d.diet] : [],
    activity: activityOf(act.steps),
    stepsPerDay: act.steps,
    workStyle: act.workStyle,
    sleepHours: d.sleepHours,
    preferredTime: 'any',
    // дни расставляет план (DEFAULT_DAYS под частоту); поменять — в Профиле
    preferredDays: [],
    createdAt: now,
    updatedAt: now,
  };
}
