/**
 * FORM domain model.
 * Все числовые показатели считаются программно (features/*), AI получает уже готовые факты.
 * Даты дня хранятся как ISO-строки 'YYYY-MM-DD' (локальная дата), моменты времени — как epoch ms.
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type ID = string;

// ─── Profile & goal ──────────────────────────────────────────────────────────

export type Sex = 'male' | 'female';
export type GoalType = 'bulk' | 'cut' | 'recomp' | 'maintain';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingLocation = 'gym' | 'home';
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'bench'
  | 'pullupbar'
  | 'ezbar'
  | 'smith';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high';
export type WorkStyle = 'desk' | 'mixed' | 'physical';
export type TrainingTime = 'morning' | 'day' | 'evening' | 'any';
export type WeightUnit = 'kg' | 'lb';

export interface UserProfile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number; // стартовый/последний ручной вес; актуальный — из тренда веса
  goal: GoalType;
  /** Желаемый темп, % массы тела в неделю (0.25–1.0). Для maintain/recomp игнорируется. */
  ratePctPerWeek: number;
  level: ExperienceLevel;
  trainingYears: number;
  daysPerWeek: number; // 2–6
  sessionMinutes: number; // 30–120
  location: TrainingLocation;
  equipment: Equipment[];
  limitations: string; // свободный текст: «правое плечо, вертикальный жим»
  /** @deprecated старое поле (v1): читается как excluded c reason='user'. Новые данные — в training */
  avoidExerciseIds: ID[];
  /** Структурированные тренировочные предпочтения и ограничения (v2) */
  training?: TrainingPreferences;
  likedFoods: string[];
  dislikedFoods: string[];
  dietRestrictions: string[]; // 'vegetarian' | 'lactose' | 'gluten' | ...
  activity: ActivityLevel;
  stepsPerDay: number;
  workStyle: WorkStyle;
  preferredTime: TrainingTime;
  /** Предпочтительные дни тренировок, 0 = Пн … 6 = Вс */
  preferredDays: number[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  weightUnit: WeightUnit;
  restTimerAuto: boolean;
  defaultRestSec: number;
  haptics: boolean;
  coachApiUrl: string; // пусто → берётся из EXPO_PUBLIC_COACH_API_URL
  /** Уведомление об окончании отдыха, когда приложение свёрнуто */
  restNotify: boolean;
  /** Утреннее напоминание: чек-ин + взвешивание */
  morningReminder: boolean;
  morningTime: { hour: number; minute: number };
  /** Напоминание в дни тренировок по плану */
  trainingReminder: boolean;
  trainingTime: { hour: number; minute: number };
  lastBackupAt?: number;
  /** Оформление: системная / тёмная / светлая и цвет акцента */
  theme: 'system' | 'dark' | 'light';
  accent: 'lime' | 'blue' | 'orange';
}

// ─── Nutrition target & plan ────────────────────────────────────────────────

export interface CalcStep {
  label: string;
  value: string;
  note?: string;
}

export interface NutritionTarget {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Расчётный TDEE (формула или адаптивный по факту) */
  tdee: number;
  bmr: number;
  source: 'formula' | 'adaptive';
  /** Смещение калорий, накопленное адаптивными корректировками */
  adjustmentKcal: number;
  steps: CalcStep[];
  computedAt: number;
}

export type SplitType = 'fullbody' | 'upper_lower' | 'ppl' | 'ul_ppl' | 'ppl_x2' | 'upper_lower_full' | 'torso_limbs' | 'bro';

/** Выбор пользователя: auto — FORM решает; custom — шаблоны правятся вручную и не перегенерируются */
export type SplitPreference = 'auto' | 'fullbody' | 'upper_lower' | 'ppl' | 'ul_ppl' | 'torso_limbs' | 'bro' | 'custom';

/**
 * Восстановление как тренировочный контекст (НЕ медицинская настройка):
 * standard — стандартное, enhanced — повышенное (в т.ч. фармакологическая поддержка — FORM не даёт по ней советов),
 * auto — FORM определяет только по фактическим данным.
 */
export type RecoveryProfile = 'auto' | 'standard' | 'enhanced';

/** Детальные мышечные группы для расчёта объёма (движок) */
export type VolumeMuscle =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs';

export type BodyArea = 'lower_back' | 'shoulder' | 'knee' | 'elbow' | 'wrist' | 'hip' | 'neck';

/** Тип нагрузки/движения, который может быть нежелателен (не диагноз — описание движения) */
export type MovementRestriction =
  | 'heavy_axial'
  | 'hip_hinge'
  | 'bent_over'
  | 'spinal_flexion'
  | 'spinal_rotation'
  | 'overhead_press'
  | 'deep_chest_stretch'
  | 'barbell_bench'
  | 'hanging'
  | 'upright_row'
  | 'deep_knee_flexion'
  | 'lunges'
  | 'knee_extension'
  | 'elbow_extension'
  | 'elbow_flexion'
  | 'wrist_extension'
  | 'hip_flexion'
  | 'neck_load';

export type LimitationSeverity = 'mild' | 'moderate' | 'severe';

export interface TrainingLimitation {
  id: ID;
  area: BodyArea;
  /** Какие движения вызывают дискомфорт */
  movements: MovementRestriction[];
  severity: LimitationSeverity;
  note?: string;
  /** doctor — рекомендация врача/физиотерапевта: всегда жёсткий запрет */
  source: 'user' | 'doctor';
  createdAt: number;
}

export interface ExcludedExercise {
  exerciseId: ID;
  /** user — «не предлагать», discomfort — дискомфорт при выполнении, doctor — запрет специалиста */
  reason: 'user' | 'discomfort' | 'doctor';
  area?: BodyArea;
  note?: string;
  createdAt: number;
}

export type SetStyle = 'auto' | 2 | 3;
export type RepStyle = 'auto' | 'heavy' | 'moderate' | 'light';

export interface TrainingPreferences {
  preferredSplit: SplitPreference;
  preferredExercises: ID[];
  dislikedExercises: ID[];
  excluded: ExcludedExercise[];
  /** Движения, которые не предлагать вообще (без привязки к зоне) */
  excludedMovements: MovementRestriction[];
  limitations: TrainingLimitation[];
  setStyle: SetStyle;
  repStyle: RepStyle;
  priorityMuscles: VolumeMuscle[];
  lowPriorityMuscles: VolumeMuscle[];
  /** Ручная поправка недельного объёма, подходов (расширенная настройка / AI) */
  volumeAdjust: Partial<Record<VolumeMuscle, number>>;
  /** Восстановление (контекст для объёма/частоты; по умолчанию — по фактическим данным) */
  recoveryProfile?: RecoveryProfile;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'forearms';

export interface PlannedExercise {
  exerciseId: ID;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  note?: string;
  /** Слот программы (для преемственности упражнений при перестройке плана) */
  slot?: string;
  /** Почему столько подходов / почему это упражнение — для UX «Почему?» */
  why?: string;
  /** Целевой вес, заданный тренером/пользователем (иначе — из прогрессии) */
  targetWeight?: number;
}

export interface WorkoutTemplate {
  id: ID;
  /** Короткое имя: Push, Pull, Legs, Upper A … */
  name: string;
  /** Подзаголовок: «Грудь · плечи · трицепс» */
  focus: string;
  muscles: MuscleGroup[];
  exercises: PlannedExercise[];
  estMinutes: number;
  /** Тип дня в сплите (upA, loB, push…) — стабилен между перестройками плана */
  key?: string;
}

export interface WorkoutPlan {
  id: ID;
  split: SplitType;
  splitLabel: string;
  daysPerWeek: number;
  sessionMinutes: [number, number];
  /** Целевые рабочие подходы в неделю на мышечную группу */
  weeklySetsTarget: [number, number];
  templates: WorkoutTemplate[];
  /** Расписание недели: индекс дня (0=Пн) → id шаблона или null (отдых) */
  schedule: (ID | null)[];
  /** Порядок ротации шаблонов (если тренировка пропущена — следующая по очереди) */
  rotation: ID[];
  rationale: CalcStep[];
  createdAt: number;
  /** Как выбран сплит: auto/выбор пользователя + причины */
  splitChoice?: {
    preference: SplitPreference;
    reasons: string[];
    /** Сравнение вариантов (оценка — внутренняя, пользователю показываются плюсы/минусы) */
    candidates?: { split: SplitType; score: number; pros: string[]; cons: string[]; estMinutes: number; freq: number }[];
  };
  /** Оценка восстановления на момент генерации */
  recovery?: { factor: number; level: 'low' | 'normal' | 'high'; reasons: string[] };
  /** Недельный объём по детальным группам: цель и запланировано */
  volume?: { muscle: VolumeMuscle; target: number; planned: number }[];
  /** Решения генератора, которые стоит показать пользователю */
  notes?: string[];
}

/** Корректировка конкретного дня (readiness, AI Coach, ручная) */
export interface DayOverride {
  date: ISODate;
  /** Какой шаблон делать сегодня (перенос/замена), null = день отдыха */
  templateId?: ID | null;
  /** Множитель объёма: 0.85 = −15% подходов */
  volumeFactor?: number;
  /** Добавка к целевому RIR */
  rirDelta?: number;
  mode?: 'normal' | 'reduced' | 'light' | 'recovery' | 'rest' | 'deload';
  /** Изменённый состав тренировки только на этот день (замена/перестановка/подходы от тренера) */
  exercises?: PlannedExercise[];
  reason: string;
  source: 'readiness' | 'coach' | 'user';
  createdAt: number;
}

export interface PlanAdjustment {
  id: ID;
  createdAt: number;
  kind: 'calories' | 'volume' | 'plan_rebuild' | 'day_override' | 'deload';
  summary: string;
  deltaKcal?: number;
  source: 'adaptive' | 'coach' | 'user' | 'goal_change';
}

// ─── Body ───────────────────────────────────────────────────────────────────

export interface WeightEntry {
  id: ID;
  date: ISODate;
  kg: number;
  createdAt: number;
}

export interface BodyMetric {
  id: ID;
  date: ISODate;
  kind: 'waist' | 'chest' | 'hips' | 'arm' | 'thigh' | 'bodyfat';
  value: number;
}

// ─── Recovery ───────────────────────────────────────────────────────────────

export interface DailyCheckIn {
  date: ISODate;
  sleepHours: number;
  sleepQuality: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  stress: 1 | 2 | 3 | 4 | 5; // 5 = очень высокий
  soreness: 1 | 2 | 3 | 4 | 5; // 5 = сильная крепатура
  pain: boolean; // боль (не крепатура)
  painNote?: string;
  /** Данные из Apple Health, если доступны */
  hrvMs?: number;
  restingHr?: number;
  createdAt: number;
}

export type ReadinessBand = 'go' | 'reduce' | 'light' | 'recover';

export interface ReadinessResult {
  score: number;
  band: ReadinessBand;
  headline: string;
  volumeFactor: number;
  rirDelta: number;
  factors: { label: string; impact: number; detail: string }[];
  /** health — без чек-ина, по данным Apple Health */
  source?: 'checkin' | 'health';
}

// ─── Exercises ──────────────────────────────────────────────────────────────

/** Слаги мышц для анатомической карты (совпадают с react-native-body-highlighter) */
export type MuscleSlug =
  | 'chest'
  | 'deltoids'
  | 'biceps'
  | 'triceps'
  | 'forearm'
  | 'abs'
  | 'obliques'
  | 'quadriceps'
  | 'adductors'
  | 'tibialis'
  | 'calves'
  | 'trapezius'
  | 'upper-back'
  | 'lower-back'
  | 'gluteal'
  | 'hamstring'
  | 'neck';

export type ExerciseCategory =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'abs'
  | 'forearms'
  | 'calves'
  | 'fullbody';

export type MovementPattern =
  | 'h_push'
  | 'v_push'
  | 'h_pull'
  | 'v_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'fly'
  | 'lateral'
  | 'rear_delt'
  | 'curl'
  | 'tri_ext'
  | 'leg_ext'
  | 'leg_curl'
  | 'calf'
  | 'core'
  | 'carry'
  | 'shrug'
  | 'glute'
  | 'grip';

export interface Exercise {
  id: ID;
  name: string;
  nameEn: string;
  category: ExerciseCategory;
  pattern: MovementPattern;
  primary: MuscleSlug[];
  secondary: MuscleSlug[];
  /** Для подсчёта недельного объёма по группам */
  groups: { primary: MuscleGroup[]; secondary: MuscleGroup[] };
  equipment: Equipment[];
  mechanic: 'compound' | 'isolation';
  location: TrainingLocation[];
  /** Работа с весом тела (повторения без внешнего веса по умолчанию) */
  bodyweight: boolean;
  /** Шаг прогрессии в кг */
  increment: number;
  defaultReps: [number, number];
  /** Ориентировочная сложность стабилизации — влияет на порядок в тренировке */
  tier: 1 | 2 | 3;
  cues: string[];
  mistakes: string[];
  /** Папка в free-exercise-db (фото фаз движения) */
  media?: string;
  custom?: boolean;
}

// ─── Workouts ───────────────────────────────────────────────────────────────

export type SetFeel = 'easy' | 'ok' | 'hard';

export interface ExerciseSet {
  id: ID;
  weight: number; // кг; для собственного веса — дополнительный вес
  reps: number;
  rir?: number;
  feel?: SetFeel;
  done: boolean;
  warmup?: boolean;
  completedAt?: number;
  restSec?: number; // фактический отдых перед подходом
}

export interface Recommendation {
  weight: number;
  repMin: number;
  repMax: number;
  sets: number;
  targetRir: number;
  action: 'increase' | 'hold' | 'reps' | 'decrease' | 'deload' | 'new';
  rationale: string;
}

export interface WorkoutExercise {
  id: ID;
  exerciseId: ID;
  plannedSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  sets: ExerciseSet[];
  recommendation?: Recommendation;
  note?: string;
  why?: string;
}

export type WorkoutSource = 'plan' | 'generated' | 'custom' | 'quick';

export interface WorkoutSession {
  id: ID;
  date: ISODate;
  name: string;
  focus: string;
  source: WorkoutSource;
  templateId?: ID;
  startedAt: number;
  finishedAt?: number;
  exercises: WorkoutExercise[];
  /** Фактор объёма из readiness на момент старта */
  volumeFactor: number;
  readinessScore?: number;
  sessionRpe?: number; // общая тяжесть 1–10
  notes?: string;
  status: 'active' | 'completed' | 'discarded';
}

/** Сгенерированная/собранная, но ещё не начатая тренировка */
export interface WorkoutDraft {
  id: ID;
  name: string;
  focus: string;
  source: WorkoutSource;
  templateId?: ID;
  exercises: PlannedExercise[];
  createdAt: number;
}

// ─── Nutrition ──────────────────────────────────────────────────────────────

export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface FoodProduct {
  id: ID; // 'off:<barcode>' | 'local:<slug>' | 'custom:<uuid>'
  name: string;
  brand?: string;
  barcode?: string;
  per100: Macros;
  /** Стандартная порция, если известна */
  serving?: { label: string; grams: number };
  source: 'openfoodfacts' | 'local' | 'custom';
  /** Тэги для подбора «что добрать» */
  tags?: FoodTag[];
  imageUrl?: string;
  fetchedAt?: number;
}

export type FoodTag =
  | 'protein'
  | 'carb'
  | 'fat'
  | 'veg'
  | 'fruit'
  | 'dairy'
  | 'fish'
  | 'meat'
  | 'breakfast'
  | 'snack'
  | 'lean';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodEntry {
  id: ID;
  date: ISODate;
  productId: ID;
  name: string;
  grams: number;
  macros: Macros; // посчитано на момент добавления
  meal: MealSlot;
  createdAt: number;
}

// ─── Coach ──────────────────────────────────────────────────────────────────

export type CoachActionType =
  | 'set_day_mode' // снизить объём / лёгкая / восстановительная / отдых сегодня
  | 'swap_today' // заменить сегодняшний шаблон другим
  | 'adjust_calories' // изменить калорийность
  | 'replace_exercise'
  | 'exclude_exercise'
  | 'favorite_exercise'
  | 'change_sets'
  | 'change_rep_range'
  | 'change_target_weight'
  | 'change_rest_time'
  | 'reorder_exercises'
  | 'reduce_today_volume'
  | 'increase_today_volume'
  | 'change_split'
  | 'reschedule_workout'
  | 'generate_workout'
  | 'apply_deload'
  | 'adjust_weekly_volume'
  | 'suggest_meal';

export interface CoachActionParams {
  mode?: DayOverride['mode'];
  volumeFactor?: number;
  rirDelta?: number;
  templateId?: ID | null;
  deltaKcal?: number;
  reason?: string;
  exerciseId?: ID;
  toExerciseId?: ID;
  /** today — только сегодня, plan — в шаблоне плана */
  scope?: 'today' | 'plan';
  sets?: number;
  repMin?: number;
  repMax?: number;
  weightKg?: number;
  restSec?: number;
  order?: ID[];
  muscle?: VolumeMuscle;
  deltaSets?: number;
  split?: SplitPreference;
  minutes?: number;
}

export interface CoachAction {
  id: ID;
  type: CoachActionType;
  label: string;
  params: CoachActionParams;
  applied?: boolean;
  /** Пользователь отказался */
  declined?: boolean;
  /** Приложение отклонило действие при валидации (причина) */
  invalid?: string;
}

export interface CoachMessage {
  id: ID;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  actions?: CoachAction[];
  /** Ответ сформирован офлайн-логикой, а не моделью */
  offline?: boolean;
  safety?: boolean;
  error?: boolean;
}

export interface CoachMemoryItem {
  id: ID;
  text: string;
  category: 'food' | 'training' | 'injury' | 'schedule' | 'preference' | 'other';
  createdAt: number;
  source: 'coach' | 'user';
}

export interface CoachConversation {
  messages: CoachMessage[];
  /** Сжатое резюме старых сообщений (long-term) */
  summary: string;
  summarizedUntil: number;
}

// ─── Progress ───────────────────────────────────────────────────────────────

export interface ProgressSummary {
  workoutsThisMonth: number;
  adherencePct: number | null;
  volumeChange: { group: MuscleGroup; pct: number; sets: number }[];
  prs: { exerciseId: ID; from: string; to: string; e1rmFrom: number; e1rmTo: number }[];
}
