import type {
  CalcStep,
  Equipment,
  Exercise,
  MuscleGroup,
  PlannedExercise,
  SplitType,
  UserProfile,
  WorkoutPlan,
  WorkoutTemplate,
} from '@/types';
import { EXERCISES, GROUP_LABEL, getExercise, secondsPerSet } from '@/data/exercises';
import { uid } from '@/utils/id';

/**
 * Генерация стартового плана: сплит, расписание, упражнения, подходы, диапазоны повторений.
 * Слот — «место» в тренировке с приоритетным списком упражнений; выбирается первое,
 * которое доступно по оборудованию/месту и не в списке исключений пользователя.
 */

type Role = 'main' | 'secondary' | 'accessory';
interface Slot {
  candidates: string[];
  role: Role;
  sets: number;
}

const S = (role: Role, sets: number, ...candidates: string[]): Slot => ({ role, sets, candidates });

// Кандидаты по паттернам движения (от «лучшего» к альтернативам)
const C = {
  hPushMain: ['bench_press', 'db_bench_press', 'smith_bench_press', 'machine_chest_press', 'push_up'],
  hPushSec: ['incline_db_press', 'incline_bench_press', 'machine_chest_press', 'db_bench_press', 'decline_push_up', 'push_up'],
  vPush: ['ohp', 'seated_db_press', 'machine_shoulder_press', 'arnold_press', 'pike_push_up'],
  vPushSec: ['seated_db_press', 'machine_shoulder_press', 'arnold_press', 'pike_push_up'],
  fly: ['cable_crossover', 'pec_deck', 'db_fly', 'incline_db_fly', 'push_up'],
  lateral: ['lateral_raise', 'cable_lateral_raise', 'band_pull_apart'],
  rear: ['face_pull', 'reverse_pec_deck', 'rear_delt_fly', 'band_pull_apart'],
  vPull: ['pull_up', 'lat_pulldown', 'chin_up', 'assisted_pull_up', 'inverted_row'],
  vPullSec: ['lat_pulldown', 'close_grip_pulldown', 'chin_up', 'assisted_pull_up', 'pull_up', 'inverted_row'],
  hPull: ['barbell_row', 'tbar_row', 'seated_cable_row', 'db_row', 'chest_supported_row', 'inverted_row'],
  hPullSec: ['seated_cable_row', 'chest_supported_row', 'db_row', 'machine_row', 'inverted_row'],
  curl: ['ez_curl', 'barbell_curl', 'db_curl', 'cable_curl', 'band_curl'],
  curlSec: ['incline_db_curl', 'hammer_curl', 'cable_curl', 'db_curl', 'band_curl'],
  tri: ['rope_pushdown', 'triceps_pushdown', 'skullcrusher', 'db_overhead_ext', 'bench_dip', 'diamond_push_up'],
  triSec: ['overhead_cable_ext', 'db_overhead_ext', 'skullcrusher', 'db_kickback', 'diamond_push_up'],
  squat: ['back_squat', 'hack_squat', 'leg_press', 'smith_squat', 'goblet_squat', 'bulgarian_split_squat', 'bodyweight_squat'],
  squatSec: ['leg_press', 'hack_squat', 'front_squat', 'goblet_squat', 'bulgarian_split_squat', 'bodyweight_squat'],
  lunge: ['bulgarian_split_squat', 'walking_lunge', 'step_up', 'bodyweight_lunge'],
  hinge: ['romanian_deadlift', 'db_rdl', 'good_morning', 'kb_swing', 'single_leg_bridge'],
  hingeMain: ['deadlift', 'trap_bar_deadlift', 'romanian_deadlift', 'db_rdl', 'kb_swing'],
  legCurl: ['lying_leg_curl', 'seated_leg_curl', 'nordic_curl', 'db_rdl'],
  legExt: ['leg_extension', 'bodyweight_lunge'],
  glute: ['hip_thrust', 'cable_kickback', 'glute_bridge', 'single_leg_bridge'],
  calf: ['standing_calf_raise', 'seated_calf_raise', 'leg_press_calf', 'db_calf_raise'],
  core: ['cable_crunch', 'hanging_leg_raise', 'ab_wheel', 'plank', 'dead_bug', 'crunch'],
  coreSec: ['pallof_press', 'plank', 'side_plank', 'reverse_crunch', 'dead_bug'],
};

interface TemplateDef {
  key: string;
  name: string;
  focus: string;
  muscles: MuscleGroup[];
  slots: Slot[];
}

const T: Record<string, TemplateDef> = {
  fbA: { key: 'fbA', name: 'Full Body A', focus: 'Ноги · грудь · спина', muscles: ['quads', 'chest', 'back', 'shoulders', 'abs'], slots: [S('main', 3, ...C.squat), S('main', 3, ...C.hPushMain), S('secondary', 3, ...C.hPull), S('accessory', 2, ...C.lateral), S('accessory', 2, ...C.curl), S('accessory', 2, ...C.core)] },
  fbB: { key: 'fbB', name: 'Full Body B', focus: 'Тяга · плечи · спина', muscles: ['hamstrings', 'glutes', 'shoulders', 'back', 'triceps'], slots: [S('main', 3, ...C.hingeMain), S('main', 3, ...C.vPush), S('secondary', 3, ...C.vPull), S('accessory', 2, ...C.lunge), S('accessory', 2, ...C.tri), S('accessory', 2, ...C.calf)] },
  fbC: { key: 'fbC', name: 'Full Body C', focus: 'Ноги · грудь · руки', muscles: ['quads', 'chest', 'back', 'biceps', 'triceps'], slots: [S('main', 3, ...C.squatSec), S('secondary', 3, ...C.hPushSec), S('secondary', 3, ...C.hPullSec), S('accessory', 2, ...C.legCurl), S('accessory', 2, ...C.rear), S('accessory', 2, ...C.coreSec)] },
  upA: { key: 'upA', name: 'Upper A', focus: 'Грудь · спина · плечи · руки', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'], slots: [S('main', 4, ...C.hPushMain), S('main', 4, ...C.hPull), S('secondary', 3, ...C.vPushSec), S('secondary', 3, ...C.vPullSec), S('accessory', 3, ...C.lateral), S('accessory', 2, ...C.curl), S('accessory', 2, ...C.tri)] },
  loA: { key: 'loA', name: 'Lower A', focus: 'Квадрицепс · ягодицы · икры', muscles: ['quads', 'glutes', 'hamstrings', 'calves', 'abs'], slots: [S('main', 4, ...C.squat), S('secondary', 3, ...C.hinge), S('secondary', 3, ...C.lunge), S('accessory', 3, ...C.legExt), S('accessory', 3, ...C.calf), S('accessory', 2, ...C.core)] },
  upB: { key: 'upB', name: 'Upper B', focus: 'Спина · плечи · грудь · руки', muscles: ['back', 'shoulders', 'chest', 'biceps', 'triceps'], slots: [S('main', 4, ...C.vPull), S('main', 3, ...C.vPush), S('secondary', 3, ...C.hPushSec), S('secondary', 3, ...C.hPullSec), S('accessory', 3, ...C.rear), S('accessory', 2, ...C.curlSec), S('accessory', 2, ...C.triSec)] },
  loB: { key: 'loB', name: 'Lower B', focus: 'Бицепс бедра · ягодицы · квадрицепс', muscles: ['hamstrings', 'glutes', 'quads', 'calves', 'abs'], slots: [S('main', 4, ...C.hingeMain), S('secondary', 3, ...C.squatSec), S('secondary', 3, ...C.glute), S('accessory', 3, ...C.legCurl), S('accessory', 3, ...C.calf), S('accessory', 2, ...C.coreSec)] },
  push: { key: 'push', name: 'Push', focus: 'Грудь · плечи · трицепс', muscles: ['chest', 'shoulders', 'triceps'], slots: [S('main', 4, ...C.hPushMain), S('secondary', 3, ...C.vPushSec), S('secondary', 3, ...C.hPushSec), S('accessory', 3, ...C.lateral), S('accessory', 3, ...C.tri), S('accessory', 2, ...C.triSec)] },
  pull: { key: 'pull', name: 'Pull', focus: 'Спина · задняя дельта · бицепс', muscles: ['back', 'biceps', 'shoulders'], slots: [S('main', 4, ...C.vPull), S('main', 3, ...C.hPull), S('secondary', 3, ...C.hPullSec), S('accessory', 3, ...C.rear), S('accessory', 3, ...C.curl), S('accessory', 2, ...C.curlSec)] },
  legs: { key: 'legs', name: 'Legs', focus: 'Квадрицепс · бицепс бедра · ягодицы', muscles: ['quads', 'hamstrings', 'glutes', 'calves'], slots: [S('main', 4, ...C.squat), S('secondary', 3, ...C.hinge), S('secondary', 3, ...C.squatSec), S('accessory', 3, ...C.legCurl), S('accessory', 3, ...C.calf), S('accessory', 2, ...C.core)] },
  pushB: { key: 'pushB', name: 'Push B', focus: 'Плечи · грудь · трицепс', muscles: ['shoulders', 'chest', 'triceps'], slots: [S('main', 4, ...C.vPush), S('secondary', 3, ...C.hPushSec), S('accessory', 3, ...C.fly), S('accessory', 3, ...C.lateral), S('accessory', 3, ...C.triSec)] },
  pullB: { key: 'pullB', name: 'Pull B', focus: 'Спина · бицепс · задняя дельта', muscles: ['back', 'biceps', 'shoulders'], slots: [S('main', 4, ...C.hPull), S('secondary', 3, ...C.vPullSec), S('accessory', 3, ...C.rear), S('accessory', 3, ...C.curlSec), S('accessory', 2, ...C.curl)] },
  legsB: { key: 'legsB', name: 'Legs B', focus: 'Задняя поверхность · ягодицы · квадрицепс', muscles: ['hamstrings', 'glutes', 'quads', 'calves'], slots: [S('main', 4, ...C.hingeMain), S('secondary', 3, ...C.lunge), S('secondary', 3, ...C.glute), S('accessory', 3, ...C.legExt), S('accessory', 3, ...C.calf), S('accessory', 2, ...C.coreSec)] },
};

const SPLITS: Record<SplitType, { label: string; rotation: string[] }> = {
  fullbody: { label: 'Full Body', rotation: ['fbA', 'fbB', 'fbC'] },
  upper_lower: { label: 'Верх / Низ', rotation: ['upA', 'loA', 'upB', 'loB'] },
  ppl: { label: 'Push / Pull / Legs', rotation: ['push', 'pull', 'legs'] },
  ul_ppl: { label: 'Верх / Низ + PPL', rotation: ['upA', 'loA', 'push', 'pull', 'legs'] },
  ppl_x2: { label: 'PPL × 2', rotation: ['push', 'pull', 'legs', 'pushB', 'pullB', 'legsB'] },
};

const DEFAULT_DAYS: Record<number, number[]> = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

export function chooseSplit(p: UserProfile): SplitType {
  const d = p.daysPerWeek;
  if (d <= 3) return d === 3 && p.level === 'advanced' ? 'ppl' : 'fullbody';
  if (d === 4) return 'upper_lower';
  if (d === 5) return 'ul_ppl';
  return 'ppl_x2';
}

export function weeklySetsTarget(p: UserProfile): [number, number] {
  let base: [number, number] = p.level === 'beginner' ? [8, 12] : p.level === 'intermediate' ? [12, 16] : [14, 20];
  const k = p.goal === 'cut' ? 0.85 : p.goal === 'maintain' ? 0.7 : 1;
  base = [Math.round(base[0] * k), Math.round(base[1] * k)];
  return base;
}

export function isAvailable(ex: Exercise, equipment: Equipment[], location: UserProfile['location'], avoid: string[] = []): boolean {
  if (avoid.includes(ex.id)) return false;
  if (!ex.location.includes(location)) return false;
  const have = new Set<Equipment>([...equipment, 'bodyweight']);
  return ex.equipment.every((e) => have.has(e));
}

export function repRange(ex: Exercise, role: Role, goal: UserProfile['goal']): [number, number] {
  if (ex.pattern === 'core' || ex.pattern === 'carry') return ex.defaultReps;
  if (ex.bodyweight && ex.mechanic === 'compound' && role === 'main') return [5, 12];
  if (role === 'main' && ex.mechanic === 'compound') {
    if (goal === 'cut') return [5, 8];
    if (goal === 'maintain') return [6, 10];
    return [6, 10];
  }
  if (role === 'secondary') return [8, 12];
  if (ex.pattern === 'lateral' || ex.pattern === 'rear_delt' || ex.pattern === 'calf') return [12, 20];
  return [10, 15];
}

function restFor(ex: Exercise, role: Role): number {
  if (role === 'main' && ex.mechanic === 'compound') return ex.tier === 1 ? 180 : 150;
  if (ex.mechanic === 'compound') return 120;
  return 75;
}

function rirFor(role: Role, level: UserProfile['level']): number {
  if (level === 'beginner') return role === 'accessory' ? 2 : 3;
  return role === 'main' ? 2 : 1;
}

export function estimateMinutes(exs: PlannedExercise[], customs: Exercise[] = []): number {
  let sec = 7 * 60; // разминка
  for (const pe of exs) {
    const ex = getExercise(pe.exerciseId, customs);
    const per = ex ? secondsPerSet(ex) : 45;
    sec += pe.sets * per + Math.max(0, pe.sets - 1) * pe.restSec + 60; // +переход
    if (ex?.tier === 1) sec += 180; // разминочные подходы
  }
  return Math.round(sec / 60);
}

function buildTemplate(def: TemplateDef, p: UserProfile, used: Set<string>): WorkoutTemplate {
  const exercises: PlannedExercise[] = [];
  for (const slot of def.slots) {
    const avail = slot.candidates
      .map((id) => EXERCISES.find((e) => e.id === id))
      .filter((e): e is Exercise => !!e && isAvailable(e, p.equipment, p.location, p.avoidExerciseIds));
    // Предпочитаем упражнение, которого ещё нет в этой тренировке и (по возможности) в других днях
    const inThis = new Set(exercises.map((x) => x.exerciseId));
    const pick = avail.find((e) => !inThis.has(e.id) && !used.has(e.id)) ?? avail.find((e) => !inThis.has(e.id));
    if (!pick) continue;
    used.add(pick.id);
    const [repMin, repMax] = repRange(pick, slot.role, p.goal);
    exercises.push({ exerciseId: pick.id, sets: slot.sets, repMin, repMax, targetRir: rirFor(slot.role, p.level), restSec: restFor(pick, slot.role) });
  }
  return { id: uid('t_'), name: def.name, focus: def.focus, muscles: def.muscles, exercises, estMinutes: estimateMinutes(exercises) };
}

/** Недельные подходы по группам из шаблонов и расписания (основная = 1, вторичная = 0.5) */
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

const MAIN_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps'];

export function generatePlan(p: UserProfile): WorkoutPlan {
  const split = chooseSplit(p);
  const meta = SPLITS[split];
  const used = new Set<string>();
  const defs = meta.rotation.slice(0, Math.min(meta.rotation.length, Math.max(2, p.daysPerWeek))).map((k) => T[k]);
  const templates = defs.map((d) => buildTemplate(d, p, used));

  const days = p.preferredDays.length === p.daysPerWeek ? [...p.preferredDays].sort() : DEFAULT_DAYS[p.daysPerWeek] ?? DEFAULT_DAYS[3];
  const schedule: (string | null)[] = Array(7).fill(null);
  days.forEach((d, i) => (schedule[d] = templates[i % templates.length].id));

  // Балансировка объёма под целевой диапазон
  const target = weeklySetsTarget(p);
  for (let iter = 0; iter < 30; iter++) {
    const vol = plannedWeeklySets(templates, schedule);
    let changed = false;
    for (const g of MAIN_GROUPS) {
      const v = vol[g] ?? 0;
      const small = g === 'biceps' || g === 'triceps' || g === 'hamstrings' || g === 'glutes';
      const lo = small ? Math.round(target[0] * 0.6) : target[0];
      const hi = small ? Math.round(target[1] * 0.8) : target[1];
      if (v < lo) {
        const pe = findExerciseFor(templates, g, 'add');
        if (pe && pe.sets < 5) {
          pe.sets += 1;
          changed = true;
        }
      } else if (v > hi) {
        const pe = findExerciseFor(templates, g, 'remove');
        if (pe) {
          pe.sets -= 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Ограничение по времени тренировки
  for (const t of templates) {
    t.estMinutes = estimateMinutes(t.exercises);
    let guard = 0;
    while (t.estMinutes > p.sessionMinutes + 5 && guard++ < 20) {
      const last = [...t.exercises].reverse().find((e) => e.sets > 2);
      if (last) last.sets -= 1;
      else if (t.exercises.length > 3) t.exercises.pop();
      else break;
      t.estMinutes = estimateMinutes(t.exercises);
    }
  }

  // Если тренировка заметно короче желаемого — добавляем подходы в основные упражнения (до 5)
  for (const t of templates) {
    let guard = 0;
    while (t.estMinutes < p.sessionMinutes - 12 && guard++ < 12) {
      const main = t.exercises.filter((e) => e.sets < (e === t.exercises[0] ? 5 : 4)).sort((a, b) => a.sets - b.sets)[0];
      if (!main) break;
      main.sets += 1;
      t.estMinutes = estimateMinutes(t.exercises);
      if (t.estMinutes > p.sessionMinutes + 3) {
        main.sets -= 1;
        t.estMinutes = estimateMinutes(t.exercises);
        break;
      }
    }
  }
  const minM = Math.min(...templates.map((t) => t.estMinutes));
  const maxM = Math.max(...templates.map((t) => t.estMinutes));
  const vol = plannedWeeklySets(templates, schedule);

  const rationale: CalcStep[] = [
    { label: 'Сплит', value: meta.label, note: `${p.daysPerWeek} ${p.daysPerWeek < 5 ? 'дня' : 'дней'} в неделю, уровень: ${LEVEL_LABEL[p.level]}` },
    { label: 'Объём', value: `${target[0]}–${target[1]} подходов/нед`, note: `на крупную группу${p.goal === 'cut' ? ', снижен на сушке для восстановления' : ''}` },
    { label: 'Интенсивность', value: p.level === 'beginner' ? 'RIR 2–3' : 'RIR 1–2', note: 'запас повторов до отказа в рабочих подходах' },
    { label: 'Прогрессия', value: 'Двойная', note: 'сначала повторы до верха диапазона, потом +вес' },
    { label: 'Фактический объём', value: MAIN_GROUPS.map((g) => `${GROUP_LABEL[g]} ${Math.round(vol[g] ?? 0)}`).join(' · ') },
  ];

  return {
    id: uid('plan_'),
    split,
    splitLabel: meta.label,
    daysPerWeek: p.daysPerWeek,
    sessionMinutes: [minM, maxM],
    weeklySetsTarget: target,
    templates,
    schedule,
    rotation: templates.map((t) => t.id),
    rationale,
    createdAt: Date.now(),
  };
}

function findExerciseFor(templates: WorkoutTemplate[], g: MuscleGroup, mode: 'add' | 'remove'): PlannedExercise | undefined {
  const all: { pe: PlannedExercise; ex: Exercise; idx: number }[] = [];
  for (const t of templates) t.exercises.forEach((pe, idx) => {
    const ex = getExercise(pe.exerciseId);
    if (ex?.groups.primary.includes(g)) all.push({ pe, ex, idx });
  });
  // Приоритет при снижении: изоляция → вспомогательные базовые → основное упражнение (не ниже 3 подходов)
  const weight = (x: { ex: Exercise; idx: number }) => (x.ex.mechanic === 'isolation' ? 0 : x.idx === 0 || x.ex.tier === 1 ? 2 : 1);
  if (mode === 'add') return all.sort((a, b) => a.pe.sets - b.pe.sets || weight(b) - weight(a))[0]?.pe;
  const cand = all.filter((x) => (weight(x) === 2 ? x.pe.sets > 3 : x.pe.sets > 2)).sort((a, b) => weight(a) - weight(b) || b.pe.sets - a.pe.sets);
  return cand[0]?.pe;
}

export const LEVEL_LABEL: Record<UserProfile['level'], string> = {
  beginner: 'новичок',
  intermediate: 'средний',
  advanced: 'продвинутый',
};

export function alternativesFor(exerciseId: string, p: Pick<UserProfile, 'equipment' | 'location' | 'avoidExerciseIds'>, customs: Exercise[] = []): Exercise[] {
  const ex = getExercise(exerciseId, customs);
  if (!ex) return [];
  const pool = [...EXERCISES, ...customs].filter((e) => e.id !== ex.id && isAvailable(e, p.equipment, p.location, p.avoidExerciseIds));
  const score = (e: Exercise) => (e.pattern === ex.pattern ? 0 : 2) + (e.groups.primary[0] === ex.groups.primary[0] ? 0 : 1) + (e.mechanic === ex.mechanic ? 0 : 0.5);
  return pool.filter((e) => e.pattern === ex.pattern || e.groups.primary.some((g) => ex.groups.primary.includes(g))).sort((a, b) => score(a) - score(b)).slice(0, 12);
}
