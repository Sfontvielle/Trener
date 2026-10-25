import type { ActivityLevel, Equipment, ExperienceLevel, GoalType, Sex, TrainingLocation, UserProfile, WorkStyle } from '@/types';
import { EMPTY_HEALTH } from './health';
import { goalPresets, recommendedPreset } from '@/features/coach/decisions/goals';
import { defaultRate } from '@/features/nutrition/targets';

/**
 * Анкета первого запуска — 5 этапов:
 *   1. имя · 2. пол, возраст (18+), рост, текущий вес · 3. цель · 4. опыт, график, длительность, оборудование ·
 *   5. образ жизни, активность за день, сон, ограничения.
 * Личные показатели ничем не заполняются заранее: пока пользователь не ответил, поля пустые и «Далее» недоступно.
 * Целевой вес и срок не спрашиваем. Темп цели — рекомендованный (поменять можно в Профиле).
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
  /** Дни тренировок, 0 = Пн … 6 = Вс (2–6 дней) */
  days: number[];
  sessionMinutes?: number;
  location?: TrainingLocation;
  equipment: Equipment[];
  workStyle?: WorkStyle;
  stepsPerDay?: number;
  /** Обычный сон, часов */
  sleepHours?: number;
  /** «Нет ограничений» или «есть» (тогда нужен текст) */
  limits?: 'none' | 'some';
  limitations: string;
}

export function emptyDraft(name = ''): QDraft {
  return { name, days: [], equipment: [], limitations: '' };
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
  { v: 'beginner', label: 'Новичок', sub: 'меньше года или после долгого перерыва', years: 0.5 },
  { v: 'intermediate', label: 'Средний', sub: '1–3 года регулярно', years: 2 },
  { v: 'advanced', label: 'Продвинутый', sub: 'больше 3 лет, знаю технику и рабочие веса', years: 5 },
];
export const DURATION_OPTIONS = [45, 60, 75, 90];
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
      // Дома можно без оборудования (вес тела); в зале — хотя бы что-то из списка
      return !!d.level && d.days.length >= 2 && d.days.length <= 6 && !!d.sessionMinutes && !!d.location && (d.location === 'home' || d.equipment.length > 0);
    case 4:
      return !!d.workStyle && d.stepsPerDay !== undefined && d.sleepHours !== undefined && (d.limits === 'none' || (d.limits === 'some' && d.limitations.trim().length > 0));
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
  const limitations = d.limits === 'some' ? d.limitations.trim() : '';
  const days = [...d.days].sort((a, b) => a - b);
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
    daysPerWeek: days.length,
    sessionMinutes: d.sessionMinutes!,
    location: d.location!,
    equipment: [...d.equipment],
    limitations,
    health: { ...EMPTY_HEALTH, injuries: limitations },
    avoidExerciseIds: [],
    likedFoods: [],
    dislikedFoods: [],
    dietRestrictions: [],
    activity: activityOf(d.stepsPerDay!),
    stepsPerDay: d.stepsPerDay!,
    workStyle: d.workStyle!,
    sleepHours: d.sleepHours,
    preferredTime: 'any',
    preferredDays: days,
    createdAt: now,
    updatedAt: now,
  };
}
