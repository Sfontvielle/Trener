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
  /** Целевой вес (необязательно) — для «прогресса к цели» на главной */
  targetWeightKg?: number;
  /** Желаемый темп, % массы тела в неделю (0.25–1.0). Для maintain/recomp игнорируется. */
  ratePctPerWeek: number;
  level: ExperienceLevel;
  trainingYears: number;
  daysPerWeek: number; // 2–6
  sessionMinutes: number; // 30–120
  location: TrainingLocation;
  equipment: Equipment[];
  limitations: string; // свободный текст: «правое плечо, вертикальный жим» (v1; в v3 — health.injuries)
  /** Здоровье и особенности (v3). Свободный текст разбирается в ограничения движений и пищевые запреты */
  health?: HealthProfile;
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

export interface HealthProfile {
  /** Травмы (текущие и перенесённые) */
  injuries: string;
  /** Хронические ограничения: «протрузия L5», «гипертония» */
  chronic: string;
  /** Движения, вызывающие боль: «жим над головой», «глубокий присед» */
  painfulMovements: string;
  /** Ограничения от врача/физиотерапевта — всегда строгий запрет */
  medical: string;
  allergies: string[];
  intolerances: string[];
  forbiddenFoods: string[];
  other: string;
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
  /** Автокопия в папке приложения (тихо, раз в несколько дней) */
  lastAutoBackupAt?: number;
  /** Еженедельный отчёт по понедельникам */
  weeklyReview?: boolean;
  /** Оформление: системная / тёмная / светлая и цвет акцента */
  theme: 'system' | 'dark' | 'light';
  accent: 'lime' | 'blue' | 'orange';
  /** Оборудование зала: реальные веса, которые можно поставить (нет — значения по умолчанию) */
  gym?: GymSetup;
  /** Короткий онбординг: какие разделы профиля ещё предложить заполнить позже */
  setupPending?: SetupItem[];
}

export type SetupItem = 'health' | 'equipment' | 'life' | 'food';

export interface GymSetup {
  barKg: number;
  ezBarKg: number;
  /** Доступные диски (кг), по паре каждого */
  plates: number[];
  /** Шаг гантелей: 20 → 22 → 24 = 2 */
  dumbbellStep: number;
  /** Шаг стека тренажёра/блока: 50 → 55 → 60 = 5 */
  machineStep: number;
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
  /** Клетчатка, г (14 г на 1000 ккал, IOM). Старые цели без поля — считаются через fiberTarget() */
  fiber?: number;
  /** Расчётный TDEE (формула или адаптивный по факту) */
  tdee: number;
  bmr: number;
  source: 'formula' | 'adaptive';
  /** Смещение калорий, накопленное адаптивными корректировками */
  adjustmentKcal: number;
  /** Персональный расход (дневник + тренд веса), если он участвовал в расчёте; в старых целях отсутствует */
  observedTdee?: number;
  observedConfidence?: 'medium' | 'high';
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
  /** Сон в часах (дробное) — старое поле, остаётся для совместимости и вычисляется из sleepMinutes */
  sleepHours: number;
  /** Сон в минутах — точное значение (например 463 = 7 ч 43 мин). В старых записях отсутствует */
  sleepMinutes?: number;
  /** Откуда значение сна: введено вручную или подставлено из Apple Health */
  sleepSource?: 'manual' | 'health';
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
  /** Категория для интерфейса (балл — внутренний, не показывается как «точный процент») */
  category?: 'high' | 'normal' | 'reduced' | 'low';
  /** Причины простыми словами, в сравнении с личной нормой */
  reasons?: string[];
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

/** Как прошёл подход — понятными словами; внутри переводится в запас повторов (RIR) */
export type SetFeel = 'easy' | 'ok' | 'hard' | 'max';

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
  /** Коротко для интерфейса: «+2,5 кг», «+1 повтор», «Оставить 50 кг» */
  delta?: string;
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
  sessionRpe?: number; // общая тяжесть 1–10 (внутренне; пользователь отвечает «Легко … Очень тяжело»)
  /** Энергозатраты на момент завершения (оценка или измерено часами) */
  energy?: { kcal: number; source: 'health' | 'estimate' };
  notes?: string;
  status: 'active' | 'completed' | 'discarded';
  /** Активная тренировка: какое упражнение открыто (сохраняется — восстанавливается после перезапуска) */
  currentIndex?: number;
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
  /** Клетчатка, г. undefined = неизвестно (не 0!) — у многих продуктов в базах её нет */
  fiber?: number;
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
  | 'suggest_meal'
  | 'start_today' // начать сегодняшнюю тренировку
  | 'start_custom_workout' // собрать и начать тренировку из указанных упражнений
  | 'add_to_plan' // добавить упражнение в тренировку плана
  | 'create_exercise'; // создать своё упражнение

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
  /** start_custom_workout: упражнения по порядку */
  exerciseIds?: ID[];
  name?: string;
  /** create_exercise: описание нового упражнения */
  exercise?: Exercise;
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

/** Источник рекомендации: позиция профессионального общества, обзор, руководство */
export interface KnowledgeSource {
  title: string;
  org: string;
  url: string;
  year?: string;
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
  /** Откуда рекомендация (проверенные первоисточники + свежие обзоры PubMed) */
  sources?: KnowledgeSource[];
}

export interface CoachMemoryItem {
  id: ID;
  text: string;
  category: 'food' | 'training' | 'injury' | 'health' | 'schedule' | 'preference' | 'other';
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

// ─── Анализы (Biomarkers) ───────────────────────────────────────────────────

/** Один показатель анализа. Исходные значения хранятся всегда; normalized — только при однозначном пересчёте */
export interface LabResult {
  id: ID;
  /** Канонический показатель из каталога (если распознан) */
  markerId?: string;
  /** Название, как в бланке лаборатории */
  name: string;
  value: number;
  /** Исходная запись значения («<0,1», «12,5») */
  valueText?: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  /** Референс, как в бланке («< 41», «132 - 173») */
  refText?: string;
  /** Отметка лаборатории: H/L, ↑/↓ */
  flag?: 'H' | 'L';
  /** Пересчёт в каноническую единицу для графиков (исходное не меняется) */
  normalized?: { value: number; unit: string; refLow?: number; refHigh?: number };
}

export interface LabReport {
  id: ID;
  /** Дата исследования (взятия биоматериала) */
  date: ISODate;
  lab?: string;
  source: { kind: 'pdf' | 'image' | 'text' | 'manual'; files?: string[]; pages?: number };
  results: LabResult[];
  note?: string;
  /** Пользователь проверил распознанные данные перед сохранением */
  confirmed: true;
  createdAt: number;
}

// ─── Enhanced / AAS: контекст для мониторинга здоровья (не рекомендации по препаратам) ───

/** Пользовательская историческая запись. RYNJI её только хранит и показывает на шкале времени */
export interface AasEntry {
  id: ID;
  substance: string;
  startDate: ISODate;
  endDate?: ISODate;
  /** Доза — как её записал сам пользователь (свободный текст), RYNJI её не анализирует и не советует */
  doseNote?: string;
  note?: string;
  createdAt: number;
}

export interface BloodPressureEntry {
  id: ID;
  date: ISODate;
  systolic: number;
  diastolic: number;
  pulse?: number;
  createdAt: number;
}
