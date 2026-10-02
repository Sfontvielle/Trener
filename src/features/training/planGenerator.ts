import type {
  CalcStep,
  Equipment,
  Exercise,
  MuscleGroup,
  PlannedExercise,
  SplitType,
  TrainingPreferences,
  UserProfile,
  VolumeMuscle,
  WorkoutPlan,
  WorkoutSession,
  WorkoutTemplate,
} from '@/types';
import { EXERCISES, GROUP_LABEL, getExercise } from '@/data/exercises';
import { uid } from '@/utils/id';
import { getPrefs } from './engine/prefs';
import { checkAllowed, hasEquipment, pickForSlot, type SelectionContext, type SlotRole, type SlotSpec } from './engine/scoring';
import { chooseSplit, SPLIT_LABEL } from './engine/split';
import { estimateRecovery, type RecoveryEstimate } from './engine/recovery';
import { baseWeeklySets, plannedFineVolume, setLimits, weeklyTargets } from './engine/volume';
import { fineTargets, isSmallMuscle, VM_ACC, VM_LABEL, VOLUME_MUSCLES } from './engine/muscles';
import { orderExercises } from './engine/order';
import { estimateMinutes } from './engine/time';
import { substitutesFor } from './engine/substitute';

export { estimateMinutes };

/**
 * Генератор плана.
 *  1) сплит: выбор пользователя или авто (дни, уровень, цель, время, приоритеты, фактическая частота);
 *  2) дни сплита состоят из слотов «мышца + тип движения + роль»;
 *  3) упражнение для слота — лучший по скорингу среди ДОПУСТИМЫХ (исключения и ограничения фильтруются
 *     полностью), с приоритетом преемственности: упражнение с прогрессом не меняется без причины;
 *  4) подходы распределяются от НЕДЕЛЬНОЙ цели по каждой детальной группе, с учётом стиля (2/3/авто);
 *  5) тренировка подгоняется под время, упражнения сортируются (базовые → изоляция → мелкие);
 *  6) каждое решение сопровождается объяснением («Почему?»).
 */

export const LEVEL_LABEL: Record<UserProfile['level'], string> = {
  beginner: 'новичок',
  intermediate: 'средний',
  advanced: 'продвинутый',
};

const s = (key: string, muscle: VolumeMuscle, role: SlotRole, patterns: SlotSpec['patterns'], fallback?: SlotSpec['fallback']): SlotSpec => ({ key, muscle, role, patterns, fallback });
const OHP_FALLBACK: SlotSpec['fallback'] = { muscle: 'chest', patterns: ['h_push'] };

export interface DayDef {
  name: string;
  focus: string;
  muscles: MuscleGroup[];
  slots: SlotSpec[];
}

export const DAYS: Record<string, DayDef> = {
  upA: { name: 'Верх А', focus: 'Грудь · спина · плечи · руки', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'], slots: [s('press', 'chest', 'main', ['h_push']), s('row', 'upper_back', 'main', ['h_pull']), s('vpull', 'lats', 'secondary', ['v_pull']), s('press2', 'chest', 'secondary', ['h_push', 'fly']), s('lat', 'side_delts', 'accessory', ['lateral']), s('tri', 'triceps', 'accessory', ['tri_ext']), s('bi', 'biceps', 'accessory', ['curl'])] },
  upB: { name: 'Верх Б', focus: 'Спина · плечи · грудь · руки', muscles: ['back', 'shoulders', 'chest', 'biceps', 'triceps'], slots: [s('vpull', 'lats', 'main', ['v_pull']), s('ohp', 'front_delts', 'main', ['v_push'], OHP_FALLBACK), s('press', 'chest', 'secondary', ['h_push']), s('row', 'upper_back', 'secondary', ['h_pull']), s('rear', 'rear_delts', 'accessory', ['rear_delt']), s('lat', 'side_delts', 'accessory', ['lateral']), s('bi', 'biceps', 'accessory', ['curl']), s('tri', 'triceps', 'accessory', ['tri_ext'])] },
  loA: { name: 'Низ А', focus: 'Квадрицепс · ягодицы · икры', muscles: ['quads', 'glutes', 'hamstrings', 'calves', 'abs'], slots: [s('squat', 'quads', 'main', ['squat']), s('hinge', 'hamstrings', 'secondary', ['hinge']), s('lunge', 'quads', 'secondary', ['lunge', 'squat']), s('curl', 'hamstrings', 'accessory', ['leg_curl']), s('glute', 'glutes', 'accessory', ['glute']), s('calf', 'calves', 'accessory', ['calf']), s('abs', 'abs', 'accessory', ['core'])] },
  loB: { name: 'Низ Б', focus: 'Бицепс бедра · ягодицы · квадрицепс', muscles: ['hamstrings', 'glutes', 'quads', 'calves', 'abs'], slots: [s('hinge', 'hamstrings', 'main', ['hinge']), s('squat', 'quads', 'secondary', ['squat']), s('glute', 'glutes', 'secondary', ['glute', 'lunge']), s('ext', 'quads', 'accessory', ['leg_ext']), s('curl', 'hamstrings', 'accessory', ['leg_curl']), s('calf', 'calves', 'accessory', ['calf']), s('abs', 'abs', 'accessory', ['core'])] },
  push: { name: 'Жимовая', focus: 'Грудь · плечи · трицепс', muscles: ['chest', 'shoulders', 'triceps'], slots: [s('press', 'chest', 'main', ['h_push']), s('ohp', 'front_delts', 'secondary', ['v_push'], OHP_FALLBACK), s('press2', 'chest', 'secondary', ['h_push']), s('fly', 'chest', 'accessory', ['fly']), s('lat', 'side_delts', 'accessory', ['lateral']), s('tri', 'triceps', 'accessory', ['tri_ext'])] },
  pull: { name: 'Тяговая', focus: 'Спина · задняя дельта · бицепс', muscles: ['back', 'biceps', 'shoulders'], slots: [s('vpull', 'lats', 'main', ['v_pull']), s('row', 'upper_back', 'main', ['h_pull']), s('vpull2', 'lats', 'secondary', ['v_pull', 'h_pull']), s('rear', 'rear_delts', 'accessory', ['rear_delt']), s('bi', 'biceps', 'accessory', ['curl']), s('bi2', 'biceps', 'accessory', ['curl'])] },
  legs: { name: 'Ноги', focus: 'Квадрицепс · бицепс бедра · ягодицы', muscles: ['quads', 'hamstrings', 'glutes', 'calves'], slots: [s('squat', 'quads', 'main', ['squat']), s('hinge', 'hamstrings', 'secondary', ['hinge']), s('squat2', 'quads', 'secondary', ['squat', 'lunge']), s('curl', 'hamstrings', 'accessory', ['leg_curl']), s('glute', 'glutes', 'accessory', ['glute']), s('calf', 'calves', 'accessory', ['calf']), s('abs', 'abs', 'accessory', ['core'])] },
  pushB: { name: 'Жимовая Б', focus: 'Плечи · грудь · трицепс', muscles: ['shoulders', 'chest', 'triceps'], slots: [s('ohp', 'front_delts', 'main', ['v_push'], OHP_FALLBACK), s('press', 'chest', 'secondary', ['h_push']), s('fly', 'chest', 'accessory', ['fly']), s('lat', 'side_delts', 'accessory', ['lateral']), s('tri', 'triceps', 'accessory', ['tri_ext'])] },
  pullB: { name: 'Тяговая Б', focus: 'Спина · бицепс · задняя дельта', muscles: ['back', 'biceps', 'shoulders'], slots: [s('row', 'upper_back', 'main', ['h_pull']), s('vpull', 'lats', 'secondary', ['v_pull']), s('rear', 'rear_delts', 'accessory', ['rear_delt']), s('bi', 'biceps', 'accessory', ['curl'])] },
  legsB: { name: 'Ноги Б', focus: 'Задняя поверхность · ягодицы · квадрицепс', muscles: ['hamstrings', 'glutes', 'quads', 'calves'], slots: [s('hinge', 'hamstrings', 'main', ['hinge']), s('lunge', 'quads', 'secondary', ['lunge', 'squat']), s('glute', 'glutes', 'secondary', ['glute']), s('ext', 'quads', 'accessory', ['leg_ext']), s('calf', 'calves', 'accessory', ['calf']), s('abs', 'abs', 'accessory', ['core'])] },
  fbA: { name: 'Всё тело А', focus: 'Ноги · грудь · спина', muscles: ['quads', 'chest', 'back', 'shoulders', 'abs'], slots: [s('squat', 'quads', 'main', ['squat']), s('press', 'chest', 'main', ['h_push']), s('row', 'upper_back', 'secondary', ['h_pull']), s('lat', 'side_delts', 'accessory', ['lateral']), s('bi', 'biceps', 'accessory', ['curl']), s('abs', 'abs', 'accessory', ['core'])] },
  fbB: { name: 'Всё тело Б', focus: 'Тяга · спина · плечи', muscles: ['hamstrings', 'glutes', 'back', 'shoulders', 'triceps'], slots: [s('hinge', 'hamstrings', 'main', ['hinge']), s('vpull', 'lats', 'main', ['v_pull']), s('ohp', 'front_delts', 'secondary', ['v_push'], OHP_FALLBACK), s('lunge', 'quads', 'accessory', ['lunge', 'leg_ext']), s('tri', 'triceps', 'accessory', ['tri_ext']), s('calf', 'calves', 'accessory', ['calf'])] },
  torsoA: { name: 'Торс А', focus: 'Грудь · спина · плечи', muscles: ['chest', 'back', 'shoulders'], slots: [s('press', 'chest', 'main', ['h_push']), s('row', 'upper_back', 'main', ['h_pull']), s('vpull', 'lats', 'secondary', ['v_pull']), s('ohp', 'front_delts', 'secondary', ['v_push'], OHP_FALLBACK), s('fly', 'chest', 'accessory', ['fly']), s('lat', 'side_delts', 'accessory', ['lateral']), s('rear', 'rear_delts', 'accessory', ['rear_delt'])] },
  limbsA: { name: 'Конечности А', focus: 'Ноги · руки', muscles: ['quads', 'hamstrings', 'glutes', 'biceps', 'triceps'], slots: [s('squat', 'quads', 'main', ['squat']), s('hinge', 'hamstrings', 'secondary', ['hinge']), s('curl', 'hamstrings', 'accessory', ['leg_curl']), s('calf', 'calves', 'accessory', ['calf']), s('bi', 'biceps', 'accessory', ['curl']), s('tri', 'triceps', 'accessory', ['tri_ext']), s('abs', 'abs', 'accessory', ['core'])] },
  torsoB: { name: 'Торс Б', focus: 'Спина · плечи · грудь', muscles: ['back', 'shoulders', 'chest'], slots: [s('vpull', 'lats', 'main', ['v_pull']), s('press', 'chest', 'main', ['h_push']), s('row', 'upper_back', 'secondary', ['h_pull']), s('press2', 'chest', 'secondary', ['h_push', 'fly']), s('lat', 'side_delts', 'accessory', ['lateral']), s('rear', 'rear_delts', 'accessory', ['rear_delt'])] },
  limbsB: { name: 'Конечности Б', focus: 'Ноги · руки', muscles: ['hamstrings', 'glutes', 'quads', 'biceps', 'triceps'], slots: [s('hinge', 'hamstrings', 'main', ['hinge']), s('squat', 'quads', 'secondary', ['squat', 'lunge']), s('glute', 'glutes', 'accessory', ['glute']), s('ext', 'quads', 'accessory', ['leg_ext']), s('calf', 'calves', 'accessory', ['calf']), s('bi', 'biceps', 'accessory', ['curl']), s('tri', 'triceps', 'accessory', ['tri_ext'])] },
  broChest: { name: 'Грудь', focus: 'Грудь · трицепс', muscles: ['chest', 'triceps'], slots: [s('press', 'chest', 'main', ['h_push']), s('press2', 'chest', 'secondary', ['h_push']), s('press3', 'chest', 'secondary', ['h_push', 'fly']), s('fly', 'chest', 'accessory', ['fly']), s('tri', 'triceps', 'accessory', ['tri_ext'])] },
  broBack: { name: 'Спина', focus: 'Широчайшие · верх спины', muscles: ['back'], slots: [s('vpull', 'lats', 'main', ['v_pull']), s('row', 'upper_back', 'main', ['h_pull']), s('vpull2', 'lats', 'secondary', ['v_pull', 'h_pull']), s('row2', 'upper_back', 'secondary', ['h_pull']), s('rear', 'rear_delts', 'accessory', ['rear_delt'])] },
  broLegs: { name: 'Ноги', focus: 'Квадрицепс · бицепс бедра · ягодицы', muscles: ['quads', 'hamstrings', 'glutes', 'calves'], slots: [s('squat', 'quads', 'main', ['squat']), s('hinge', 'hamstrings', 'secondary', ['hinge']), s('lunge', 'quads', 'secondary', ['lunge', 'squat']), s('curl', 'hamstrings', 'accessory', ['leg_curl']), s('ext', 'quads', 'accessory', ['leg_ext']), s('calf', 'calves', 'accessory', ['calf'])] },
  broShoulders: { name: 'Плечи', focus: 'Дельты · пресс', muscles: ['shoulders', 'abs'], slots: [s('ohp', 'front_delts', 'main', ['v_push'], OHP_FALLBACK), s('lat', 'side_delts', 'accessory', ['lateral']), s('rear', 'rear_delts', 'accessory', ['rear_delt']), s('lat2', 'side_delts', 'accessory', ['lateral']), s('abs', 'abs', 'accessory', ['core'])] },
  broArms: { name: 'Руки', focus: 'Бицепс · трицепс', muscles: ['biceps', 'triceps'], slots: [s('bi', 'biceps', 'accessory', ['curl']), s('tri', 'triceps', 'accessory', ['tri_ext']), s('bi2', 'biceps', 'accessory', ['curl']), s('tri2', 'triceps', 'accessory', ['tri_ext']), s('calf', 'calves', 'accessory', ['calf'])] },
  fbC: { name: 'Всё тело В', focus: 'Ноги · грудь · руки', muscles: ['quads', 'chest', 'back', 'biceps', 'triceps'], slots: [s('squat', 'quads', 'secondary', ['squat']), s('press', 'chest', 'secondary', ['h_push']), s('row', 'upper_back', 'secondary', ['h_pull', 'v_pull']), s('curl', 'hamstrings', 'accessory', ['leg_curl']), s('rear', 'rear_delts', 'accessory', ['rear_delt']), s('glute', 'glutes', 'accessory', ['glute'])] },
};

export function rotationFor(split: SplitType, days: number): string[] {
  switch (split) {
    case 'fullbody':
      return days <= 2 ? ['fbA', 'fbB'] : ['fbA', 'fbB', 'fbC'];
    case 'upper_lower':
      return days <= 2 ? ['upA', 'loA'] : ['upA', 'loA', 'upB', 'loB'];
    case 'upper_lower_full':
      return ['upA', 'loA', 'fbA'];
    case 'ppl':
      return ['push', 'pull', 'legs'];
    case 'ul_ppl':
      return ['upA', 'loA', 'push', 'pull', 'legs'];
    case 'ppl_x2':
      return ['push', 'pull', 'legs', 'pushB', 'pullB', 'legsB'];
    case 'torso_limbs':
      return days <= 2 ? ['torsoA', 'limbsA'] : ['torsoA', 'limbsA', 'torsoB', 'limbsB'];
    case 'bro':
      return ['broChest', 'broBack', 'broLegs', 'broShoulders', 'broArms'];
  }
}

const DEFAULT_DAYS: Record<number, number[]> = { 1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

/** Диапазон для отображения «цель на крупную группу» */
export function weeklySetsTarget(p: UserProfile): [number, number] {
  const b = baseWeeklySets(p);
  return [Math.round(b * 0.85), Math.round(b * 1.15)];
}

/** Совместимость: проверка оборудования/места (+ старый список исключений) */
export function isAvailable(ex: Exercise, equipment: Equipment[], location: UserProfile['location'], avoid: string[] = []): boolean {
  return !avoid.includes(ex.id) && hasEquipment(ex, equipment, location);
}

export function repRange(ex: Exercise, role: SlotRole, goal: UserProfile['goal'], style: TrainingPreferences['repStyle'] = 'auto'): [number, number] {
  if (ex.pattern === 'core' || ex.pattern === 'carry') return ex.defaultReps;
  if (ex.bodyweight && ex.mechanic === 'compound' && role === 'main') return [5, 12];
  const high = ex.pattern === 'lateral' || ex.pattern === 'rear_delt' || ex.pattern === 'calf';
  const st = style === 'auto' ? (goal === 'cut' ? 'heavy_main' : 'moderate') : style;
  if (st === 'heavy') return role === 'main' && ex.mechanic === 'compound' ? [4, 6] : ex.mechanic === 'compound' ? [6, 8] : high ? [10, 15] : [8, 12];
  if (st === 'light') return role === 'main' && ex.mechanic === 'compound' ? [8, 12] : ex.mechanic === 'compound' ? [10, 15] : high ? [15, 20] : [12, 20];
  if (role === 'main' && ex.mechanic === 'compound') return st === 'heavy_main' ? [5, 8] : [6, 10];
  if (role === 'secondary' && ex.mechanic === 'compound') return [8, 12];
  return high ? [12, 20] : [10, 15];
}

export function restFor(ex: Exercise, role: SlotRole): number {
  if (role === 'main' && ex.mechanic === 'compound') return ex.tier === 1 ? 180 : 150;
  if (ex.mechanic === 'compound') return 120;
  return 75;
}

export function rirFor(role: SlotRole, level: UserProfile['level']): number {
  if (level === 'beginner') return role === 'accessory' ? 2 : 3;
  return role === 'main' ? 2 : 1;
}

/** Совместимость: недельные подходы по крупным группам (основная = 1, вторичная = 0.5) */
export function plannedWeeklySets(templates: WorkoutTemplate[], schedule: (string | null)[], customs: Exercise[] = []): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>;
  for (const tid of schedule) {
    if (!tid) continue;
    const t = templates.find((x) => x.id === tid);
    if (!t) continue;
    for (const pe of t.exercises) {
      const ex = getExercise(pe.exerciseId, customs);
      if (!ex) continue;
      for (const g of ex.groups.primary) out[g] = (out[g] ?? 0) + pe.sets;
      for (const g of ex.groups.secondary) out[g] = (out[g] ?? 0) + pe.sets * 0.5;
    }
  }
  return out;
}

export interface GeneratePlanOptions {
  previous?: WorkoutPlan | null;
  sessions?: WorkoutSession[];
  customs?: Exercise[];
  /** Оценка восстановления (чек-ины, Apple Health, прогресс, профиль). Без неё — только по истории тренировок */
  recovery?: RecoveryEstimate;
}

interface Meta {
  t: WorkoutTemplate;
  pe: PlannedExercise;
  role: SlotRole;
  muscle: VolumeMuscle;
  reasons: string[];
}

const fmtOcc = (o: number) => (Math.abs(o - Math.round(o)) < 0.05 ? `${Math.round(o)}` : o.toFixed(1).replace('.', ','));

export function generatePlan(p: UserProfile, opts: GeneratePlanOptions = {}): WorkoutPlan {
  const prefs = getPrefs(p);
  const sessions = opts.sessions ?? [];
  const customs = opts.customs ?? [];
  const previous = opts.previous ?? null;

  if (prefs.preferredSplit === 'custom' && previous) return keepCustom(previous, p, prefs, customs);

  const recovery = opts.recovery ?? estimateRecovery({ profile: prefs.recoveryProfile, sessions });
  const pool = [...EXERCISES, ...customs].filter((e) => checkAllowed(e, p, prefs).ok);
  const legsRestricted = pool.filter((e) => e.mechanic === 'compound' && (e.pattern === 'squat' || e.pattern === 'hinge' || e.pattern === 'lunge')).length < 4;
  const choice = chooseSplit(p, prefs, sessions, recovery, { legsRestricted });
  const keys = rotationFor(choice.split, p.daysPerWeek);
  const days = p.preferredDays.length === p.daysPerWeek ? [...p.preferredDays].sort() : DEFAULT_DAYS[p.daysPerWeek] ?? DEFAULT_DAYS[3];
  const nTemplates = keys.length;
  const occPerTemplate = days.length / nTemplates;
  const notes: string[] = [];
  const limits = setLimits(prefs.setStyle, p.level);
  const targets = weeklyTargets(p, prefs, recovery.factor);

  const usedThisWeek = new Set<string>();
  const meta: Meta[] = [];
  const templates: WorkoutTemplate[] = [];

  const ctxFor = (t: WorkoutTemplate, previousId?: string): SelectionContext => ({
    profile: p,
    prefs,
    sessions,
    previousId,
    usedThisWeek,
    usedToday: t.exercises.map((x) => getExercise(x.exerciseId, customs)).filter((x): x is Exercise => !!x),
  });

  const addSlot = (t: WorkoutTemplate, key: string, slot: SlotSpec, previousId?: string, silent = false): Meta | undefined => {
    const ctx = ctxFor(t, previousId);
    let picked = pickForSlot(pool, slot, ctx) ?? pickForSlot(pool, { ...slot, patterns: [] }, ctx);
    let muscle = slot.muscle;
    if (!picked && slot.fallback) {
      const fb: SlotSpec = { ...slot, muscle: slot.fallback.muscle, patterns: slot.fallback.patterns };
      picked = pickForSlot(pool, fb, ctx) ?? pickForSlot(pool, { ...fb, patterns: [] }, ctx);
      muscle = slot.fallback.muscle;
      if (picked) notes.push(`${t.name}: вместо упражнения на ${VM_ACC[slot.muscle]} — «${picked.ex.name}» (подходящие движения недоступны или ограничены)`);
    }
    if (!picked) {
      if (!silent) notes.push(`${t.name}: нет допустимых упражнений на ${VM_ACC[slot.muscle]} — пропущено (ограничения/оборудование)`);
      return undefined;
    }
    const ex = picked.ex;
    const [repMin, repMax] = repRange(ex, slot.role, p.goal, prefs.repStyle);
    const pe: PlannedExercise = { exerciseId: ex.id, sets: limits.start(slot.role), repMin, repMax, targetRir: rirFor(slot.role, p.level), restSec: restFor(ex, slot.role), slot: `${t.key}.${key}` };
    t.exercises.push(pe);
    usedThisWeek.add(ex.id);
    const m: Meta = { t, pe, role: slot.role, muscle, reasons: picked.reasons };
    meta.push(m);
    return m;
  };

  for (const key of keys.slice(0, nTemplates)) {
    const def = DAYS[key];
    const prevT = previous?.templates.find((x) => x.key === key) ?? previous?.templates.find((x) => x.name === def.name);
    const t: WorkoutTemplate = { id: prevT?.id ?? uid('t_'), key, name: def.name, focus: def.focus, muscles: def.muscles, exercises: [], estMinutes: 0 };
    for (const slot of def.slots) {
      const prevId = prevT?.exercises.find((x) => x.slot === `${key}.${slot.key}`)?.exerciseId;
      addSlot(t, slot.key, slot, prevId);
    }
    templates.push(t);
  }

  // ── Распределение подходов от недельной цели ───────────────────────────
  const occ = (_t: WorkoutTemplate) => occPerTemplate;
  // Объём группы = все упражнения, где она основная (выпады дают и квадрицепс, и ягодицы)
  const total = (m: VolumeMuscle) => meta.reduce((a, x) => {
    const ex = getExercise(x.pe.exerciseId, customs);
    return ex && fineTargets(ex).primary.includes(m) ? a + x.pe.sets * occ(x.t) : a;
  }, 0);
  // Упражнения по 2 подхода короче — их помещается больше; главный ограничитель — время сессии
  const maxPerSession = Math.max(5, Math.min(prefs.setStyle === 2 ? 10 : 9, Math.floor(p.sessionMinutes / (prefs.setStyle === 2 ? 6.5 : 8))));
  const extraNotes = new Map<PlannedExercise, { m: VolumeMuscle; name: string }>();
  const softMainNames = new Set<string>();
  const shortMuscles: string[] = [];
  const extraCount: Partial<Record<VolumeMuscle, number>> = {};

  for (const m of VOLUME_MUSCLES) {
    const target = targets[m];
    let entries = meta.filter((x) => x.muscle === m);
    if (!entries.length) continue;
    // Мелким группам (руки, икры, пресс, дельты) достаточно ~80% цели — остальное даёт косвенная работа
    const enough = isSmallMuscle(m) ? target * 0.8 : target - 0.6;
    let guard = 0;
    while (total(m) < enough && guard++ < 40) {
      const cand = entries.filter((x) => x.pe.sets < limits.max(x.role)).sort((a, b) => a.pe.sets - b.pe.sets || roleW(a.role) - roleW(b.role))[0];
      if (cand) {
        cand.pe.sets++;
        continue;
      }
      // Стиль «2/3 подхода»: сначала +1 подход в основном упражнении, затем — ещё одно упражнение
      const softMain = entries.filter((x) => x.role === 'main' && x.pe.sets < limits.softMax(x.role))[0];
      if (softMain) {
        softMain.pe.sets++;
        if (prefs.setStyle !== 'auto') softMainNames.add(getExercise(softMain.pe.exerciseId, customs)?.name ?? '');
        continue;
      }
      if ((extraCount[m] ?? 0) < (prefs.setStyle === 2 ? 2 : 1)) {
        extraCount[m] = (extraCount[m] ?? 0) + 1;
        const host = entries
          .map((x) => x.t)
          .filter((t, i, a) => a.indexOf(t) === i && t.exercises.length < maxPerSession && estimateMinutes(t.exercises, customs) + 5 <= p.sessionMinutes)
          .sort((a, b) => estimateMinutes(a.exercises, customs) - estimateMinutes(b.exercises, customs))[0];
        const added = host ? addSlot(host, `x_${m}`, { key: `x_${m}`, muscle: m, role: 'accessory', patterns: [] }, undefined, true) : undefined;
        if (added) {
          added.pe.sets = limits.start('accessory');
          entries = meta.filter((x) => x.muscle === m);
          extraNotes.set(added.pe, { m, name: getExercise(added.pe.exerciseId, customs)?.name ?? '' });
          continue;
        }
      }
      const soft = entries.filter((x) => x.pe.sets < limits.softMax(x.role)).sort((a, b) => roleW(a.role) - roleW(b.role))[0];
      if (soft) {
        soft.pe.sets++;
        continue;
      }
      if (total(m) < target * 0.75) shortMuscles.push(`${VM_LABEL[m].toLowerCase()} ${Math.round(total(m))}/${target}`);
      break;
    }
    guard = 0;
    while (total(m) > target + 1.6 && guard++ < 40) {
      const cand = entries.filter((x) => x.pe.sets > limits.min).sort((a, b) => roleW(b.role) - roleW(a.role) || b.pe.sets - a.pe.sets)[0];
      if (cand) {
        cand.pe.sets--;
        continue;
      }
      const acc = entries.filter((x) => x.role === 'accessory');
      if (acc.length && entries.length > 1) {
        const drop = acc[acc.length - 1];
        removeMeta(meta, drop);
        entries = meta.filter((x) => x.muscle === m);
        continue;
      }
      break;
    }
  }

  // ── Подгонка под время тренировки ──────────────────────────────────────
  for (const t of templates) {
    let guard = 0;
    while (estimateMinutes(t.exercises, customs) > p.sessionMinutes + 5 && guard++ < 30) {
      const tm = meta.filter((x) => x.t === t);
      const longRest = tm.find((x) => x.role === 'accessory' && x.pe.restSec > 60);
      if (longRest) {
        tm.filter((x) => x.role === 'accessory').forEach((x) => (x.pe.restSec = Math.min(x.pe.restSec, 60)));
        continue;
      }
      const over = (x: Meta) => total(x.muscle) - targets[x.muscle] + (prefs.lowPriorityMuscles.includes(x.muscle) ? 5 : 0) - (prefs.priorityMuscles.includes(x.muscle) ? 5 : 0);
      const reducible = tm.filter((x) => x.pe.sets > limits.min && x.role !== 'main').sort((a, b) => over(b) - over(a) || roleW(b.role) - roleW(a.role))[0];
      if (reducible) {
        reducible.pe.sets--;
        continue;
      }
      const removable = tm.filter((x) => x.role === 'accessory').sort((a, b) => over(b) - over(a))[0];
      if (removable && t.exercises.length > 3) {
        if (extraNotes.has(removable.pe)) extraNotes.delete(removable.pe);
        else notes.push(`${t.name}: убрано «${getExercise(removable.pe.exerciseId, customs)?.name}», чтобы уложиться в ${p.sessionMinutes} мин`);
        removeMeta(meta, removable);
        continue;
      }
      const main = tm.filter((x) => x.pe.sets > 2).sort((a, b) => b.pe.sets - a.pe.sets)[0];
      if (main) {
        main.pe.sets--;
        continue;
      }
      break;
    }
  }

  if (extraNotes.size) {
    const list = [...extraNotes.values()].map((x) => `${VM_LABEL[x.m].toLowerCase()} — «${x.name}»`).join(', ');
    notes.push(prefs.setStyle === 2 ? `Чтобы сохранить недельный объём при 2 подходах, добавлены упражнения: ${list}` : `Для недельной цели добавлены упражнения: ${list}`);
  }
  if (softMainNames.size) notes.push(`В основных упражнениях (${[...softMainNames].join(', ')}) на 1 подход больше твоего обычного — так недельный объём добирается без лишних упражнений`);
  if (shortMuscles.length) notes.push(`Ниже недельной цели: ${shortMuscles.join(', ')} — больше не помещается в ${p.daysPerWeek} дн. × ${p.sessionMinutes} мин без раздувания тренировок. Косвенно эти группы работают в базовых упражнениях`);

  // ── Порядок, объяснения ─────────────────────────────────────────────────
  for (const t of templates) {
    t.exercises = orderExercises(t.exercises, prefs.priorityMuscles, customs);
    t.estMinutes = estimateMinutes(t.exercises, customs);
  }
  for (const m of meta) {
    const same = meta.filter((x) => x.muscle === m.muscle);
    const tgt = targets[m.muscle];
    const parts = [`${VM_LABEL[m.muscle]}: цель ${tgt} подх./нед, ${same.length} упр. × ${fmtOcc(occPerTemplate)} р/нед → здесь ${m.pe.sets}`];
    if (prefs.setStyle !== 'auto') parts.push(`стиль: ${prefs.setStyle} подхода`);
    if (prefs.priorityMuscles.includes(m.muscle)) parts.push('приоритетная группа');
    if (m.reasons.length) parts.push(m.reasons.join(', '));
    m.pe.why = parts.join(' · ');
  }

  const schedule: (string | null)[] = Array(7).fill(null);
  days.forEach((d, i) => (schedule[d] = templates[i % templates.length].id));

  const occMap = Object.fromEntries(templates.map((t) => [t.id, occPerTemplate]));
  const planned = plannedFineVolume(templates, occMap, customs);
  const volume = VOLUME_MUSCLES.filter((m) => targets[m] > 0 || planned[m] > 0).map((m) => ({ muscle: m, target: targets[m], planned: Math.round(planned[m]) }));

  // Что отфильтровано правилами (для прозрачности)
  const KEY_LIFTS = ['bench_press', 'back_squat', 'deadlift', 'ohp', 'barbell_row', 'pull_up', 'romanian_deadlift', 'leg_press', 'db_bench_press'];
  const filtered = KEY_LIFTS.map((id) => getExercise(id)!).filter((ex) => hasEquipment(ex, p.equipment, p.location)).map((ex) => ({ ex, r: checkAllowed(ex, p, prefs) })).filter((x) => !x.r.ok);
  if (filtered.length) notes.unshift(`Не используются: ${filtered.map((x) => `${x.ex.name} (${x.r.ok ? '' : x.r.reason})`).join('; ')}`);

  const minM = Math.min(...templates.map((t) => t.estMinutes));
  const maxM = Math.max(...templates.map((t) => t.estMinutes));
  const range = weeklySetsTarget(p);
  const rationale: CalcStep[] = [
    { label: 'Сплит', value: SPLIT_LABEL[choice.split], note: choice.reasons.join('; ') },
    { label: 'Объём', value: `~${targets.chest} подх./нед на грудь, ~${targets.quads} на квадрицепс`, note: `цели по каждой группе — от уровня (${LEVEL_LABEL[p.level]}) и цели${prefs.priorityMuscles.length ? '; приоритетные группы +30%' : ''}` },
    { label: 'Восстановление', value: recovery.factor === 1 ? 'стандартный объём' : `объём ×${String(recovery.factor).replace('.', ',')}`, note: recovery.reasons.join('; ') || 'по фактическим данным' },
    { label: 'Подходы', value: prefs.setStyle === 'auto' ? 'FORM решает' : `обычно ${prefs.setStyle}`, note: 'недельная цель группы ÷ число упражнений на неё в неделю' },
    { label: 'Интенсивность', value: p.level === 'beginner' ? 'запас 2–3 повт.' : 'запас 1–2 повт.', note: 'запас повторов до отказа в рабочих подходах' },
    { label: 'Прогрессия', value: 'Двойная', note: 'сначала повторы до верха диапазона, потом +вес' },
    { label: 'Объём по группам', value: volume.filter((v) => v.target > 0).map((v) => `${VM_LABEL[v.muscle]} ${v.planned}/${v.target}`).join(' · ') },
  ];

  return {
    id: uid('plan_'),
    split: choice.split,
    splitLabel: SPLIT_LABEL[choice.split],
    daysPerWeek: p.daysPerWeek,
    sessionMinutes: [minM, maxM],
    weeklySetsTarget: range,
    templates,
    schedule,
    rotation: templates.map((t) => t.id),
    rationale,
    createdAt: Date.now(),
    splitChoice: { preference: prefs.preferredSplit, reasons: choice.reasons, candidates: choice.candidates },
    recovery: { factor: recovery.factor, level: recovery.level, reasons: recovery.reasons },
    volume,
    notes: dedupe(notes),
  };
}

const roleW = (r: SlotRole) => (r === 'main' ? 0 : r === 'secondary' ? 1 : 2);

function removeMeta(meta: Meta[], m: Meta) {
  m.t.exercises = m.t.exercises.filter((x) => x !== m.pe);
  meta.splice(meta.indexOf(m), 1);
}

function dedupe(a: string[]): string[] {
  return [...new Set(a)];
}

/** «Свой» сплит: шаблоны не перегенерируются, только недопустимые упражнения заменяются аналогами */
function keepCustom(previous: WorkoutPlan, p: UserProfile, prefs: TrainingPreferences, customs: Exercise[]): WorkoutPlan {
  const notes: string[] = [];
  const templates = previous.templates.map((t) => ({
    ...t,
    exercises: t.exercises
      .map((pe) => {
        const ex = getExercise(pe.exerciseId, customs);
        if (!ex || checkAllowed(ex, p, prefs).ok) return pe;
        const sub = substitutesFor(ex.id, p, prefs, customs, 1)[0];
        notes.push(sub ? `${t.name}: «${ex.name}» → «${sub.name}» (ограничения)` : `${t.name}: «${ex.name}» убрано (ограничения)`);
        return sub ? { ...pe, exerciseId: sub.id } : null;
      })
      .filter((x): x is PlannedExercise => !!x),
  }));
  templates.forEach((t) => (t.estMinutes = estimateMinutes(t.exercises, customs)));
  return { ...previous, templates, splitChoice: { preference: 'custom', reasons: ['Свой формат: шаблоны изменяются только вручную'] }, notes, createdAt: Date.now() };
}

/** Аналоги для замены (с учётом ограничений и предпочтений) */
export function alternativesFor(exerciseId: string, p: UserProfile, customs: Exercise[] = []): Exercise[] {
  return substitutesFor(exerciseId, p, getPrefs(p), customs, 12);
}

/** Объём по группам из текущего плана (для экранов и AI) */
export function planVolume(plan: WorkoutPlan, customs: Exercise[] = []): Record<VolumeMuscle, number> {
  const occ = plan.schedule.filter(Boolean).length / Math.max(1, plan.templates.length);
  return plannedFineVolume(plan.templates, Object.fromEntries(plan.templates.map((t) => [t.id, occ])), customs);
}

export { fineTargets, GROUP_LABEL };
