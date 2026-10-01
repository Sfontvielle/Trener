import type { Equipment, Exercise, MovementPattern, ReadinessBand, TrainingPreferences, UserProfile, VolumeMuscle, WorkoutSession } from '@/types';
import { historyFor, e1rm } from '../progression';
import { fineTargets } from './muscles';
import { AREA_LABEL, exerciseStress, loadsArea, RESTRICTION_LABEL } from './restrictions';

export type SlotRole = 'main' | 'secondary' | 'accessory';

/** «Место» в тренировке: какую мышцу и каким движением нагружаем */
export interface SlotSpec {
  key: string;
  muscle: VolumeMuscle;
  role: SlotRole;
  patterns: MovementPattern[];
  /** Если для слота нет допустимых упражнений (например, жим над головой запрещён) */
  fallback?: { muscle: VolumeMuscle; patterns: MovementPattern[] };
}

export interface SelectionContext {
  profile: UserProfile;
  prefs: TrainingPreferences;
  sessions: WorkoutSession[];
  /** Упражнение, стоявшее в этом слоте в предыдущей версии плана (преемственность) */
  previousId?: string;
  /** Упражнения, уже поставленные в другие дни этой недели */
  usedThisWeek?: Set<string>;
  /** Упражнения, уже стоящие в этой тренировке */
  usedToday?: Exercise[];
  band?: ReadinessBand;
}

export type Allowed = { ok: true } | { ok: false; reason: string };

export function hasEquipment(ex: Exercise, equipment: Equipment[], location: UserProfile['location']): boolean {
  if (!ex.location.includes(location)) return false;
  const have = new Set<Equipment>([...equipment, 'bodyweight']);
  return ex.equipment.every((e) => have.has(e));
}

/**
 * Жёсткий фильтр: исключённые упражнения, запрещённые движения и ограничения средней/сильной
 * выраженности (а также любые «от врача») не попадают в программу вообще — не просто штраф в score.
 */
export function checkAllowed(ex: Exercise, profile: UserProfile, prefs: TrainingPreferences): Allowed {
  if (!hasEquipment(ex, profile.equipment, profile.location)) return { ok: false, reason: 'нет оборудования' };
  const exc = prefs.excluded.find((e) => e.exerciseId === ex.id);
  if (exc) {
    const why = exc.reason === 'discomfort' ? `дискомфорт${exc.area ? ` (${AREA_LABEL[exc.area].toLowerCase()})` : ''}` : exc.reason === 'doctor' ? 'запрет специалиста' : 'в списке «Не предлагать»';
    return { ok: false, reason: why };
  }
  const stress = exerciseStress(ex);
  const banned = prefs.excludedMovements.find((m) => stress.includes(m));
  if (banned) return { ok: false, reason: `движение исключено: ${RESTRICTION_LABEL[banned].toLowerCase()}` };
  for (const l of prefs.limitations) {
    if (l.severity === 'severe' && loadsArea(ex, l.area)) return { ok: false, reason: `сильная боль: ${AREA_LABEL[l.area].toLowerCase()}` };
    if (l.severity === 'mild' && l.source !== 'doctor') continue;
    const m = l.movements.find((x) => stress.includes(x));
    if (m) return { ok: false, reason: `${AREA_LABEL[l.area]}: ${RESTRICTION_LABEL[m].toLowerCase()}` };
  }
  return { ok: true };
}

/** Состояние прогресса в упражнении по истории */
export function progressStatus(exId: string, sessions: WorkoutSession[]): { status: 'new' | 'progressing' | 'plateau' | 'stable'; sessions: number; from?: number; to?: number } {
  const h = historyFor(exId, sessions, 6);
  if (!h.length) return { status: 'new', sessions: 0 };
  const best = (sets: (typeof h)[number]['sets']) => Math.max(...sets.map((s) => (s.weight > 0 ? e1rm(s.weight, s.reps) : s.reps)));
  const vals = h.map((x) => best(x.sets)).reverse(); // старые → новые
  const topW = (i: number) => Math.max(...h[i].sets.map((s) => s.weight));
  if (vals.length >= 4) {
    const recent = Math.max(...vals.slice(-3));
    const before = Math.max(...vals.slice(0, -3));
    if (recent <= before * 1.005) return { status: 'plateau', sessions: vals.length, from: topW(h.length - 1), to: topW(0) };
  }
  if (vals.length >= 2 && vals[vals.length - 1] > vals[0] * 1.01) return { status: 'progressing', sessions: vals.length, from: topW(h.length - 1), to: topW(0) };
  return { status: 'stable', sessions: vals.length };
}

/** Относительная «цена» усталости: тяжёлые базовые с осевой нагрузкой — дороже */
export function fatigueCost(ex: Exercise): number {
  const axial = exerciseStress(ex).includes('heavy_axial');
  if (ex.tier === 1 && axial) return 3;
  if (ex.tier === 1) return 2;
  if (ex.mechanic === 'compound') return 1.5;
  return 1;
}

/**
 * Качество стимула для гипертрофии (0–10): нагружаемость, стабильность, кривая сопротивления,
 * простота прогрессии. Не абсолют — лишь база, поверх которой работают предпочтения и история.
 */
export const QUALITY: Record<string, number> = {
  bench_press: 9, db_bench_press: 9, incline_db_press: 9, incline_bench_press: 8, machine_chest_press: 8, smith_bench_press: 7, decline_bench_press: 5,
  cable_crossover: 8, pec_deck: 8, db_fly: 6, incline_db_fly: 6, chest_dip: 6, push_up: 5, incline_push_up: 3, decline_push_up: 4,
  pull_up: 9, lat_pulldown: 9, chin_up: 8, close_grip_pulldown: 8, assisted_pull_up: 5, inverted_row: 4,
  barbell_row: 8, seated_cable_row: 9, chest_supported_row: 9, db_row: 8, tbar_row: 8, machine_row: 8, straight_arm_pulldown: 6, db_pullover: 4,
  shrug: 4, db_shrug: 4, deadlift: 8, trap_bar_deadlift: 8, back_extension: 6, superman: 2,
  ohp: 8, seated_db_press: 9, machine_shoulder_press: 8, arnold_press: 6, pike_push_up: 4, clean_press: 2,
  lateral_raise: 9, cable_lateral_raise: 9, front_raise: 3, upright_row: 3, rear_delt_fly: 7, reverse_pec_deck: 9, face_pull: 8, band_pull_apart: 4,
  ez_curl: 8, barbell_curl: 8, db_curl: 8, incline_db_curl: 8, hammer_curl: 7, preacher_curl: 7, cable_curl: 8, concentration_curl: 5, band_curl: 3,
  triceps_pushdown: 8, rope_pushdown: 8, overhead_cable_ext: 9, db_overhead_ext: 7, skullcrusher: 7, close_grip_bench: 7, triceps_dip: 6, bench_dip: 4, db_kickback: 3, diamond_push_up: 4,
  back_squat: 9, hack_squat: 9, leg_press: 9, front_squat: 7, smith_squat: 7, goblet_squat: 6, bulgarian_split_squat: 8, walking_lunge: 7, step_up: 6, bodyweight_lunge: 3, bodyweight_squat: 2,
  leg_extension: 8, romanian_deadlift: 9, db_rdl: 8, good_morning: 6, kb_swing: 4, lying_leg_curl: 9, seated_leg_curl: 9, nordic_curl: 6,
  hip_thrust: 9, glute_bridge: 4, single_leg_bridge: 4, cable_kickback: 6, abductor_machine: 5, adductor_machine: 4,
  standing_calf_raise: 9, seated_calf_raise: 8, leg_press_calf: 8, db_calf_raise: 6,
  cable_crunch: 8, hanging_leg_raise: 8, ab_wheel: 7, plank: 5, crunch: 5, reverse_crunch: 6, dead_bug: 5, pallof_press: 6, side_plank: 5, russian_twist: 4, mountain_climber: 3,
  thruster_db: 3, kb_goblet_press: 2, farmers_walk: 3,
};

const TECHNICAL = new Set(['deadlift', 'back_squat', 'front_squat', 'clean_press', 'good_morning', 'kb_goblet_press']);

/**
 * Скоринг кандидата для слота. Возвращает и причины — для «Почему это упражнение?».
 *  score = мышца + паттерн + роль + предпочтения + преемственность/прогресс + опыт
 *          − ограничения(мягкие) − усталость − избыточность
 */
export function scoreExercise(ex: Exercise, slot: SlotSpec, ctx: SelectionContext): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const ft = fineTargets(ex);
  let s = 0;

  // 1. Соответствие мышце и паттерну
  if (ft.primary[0] === slot.muscle) s += 30;
  else if (ft.primary.includes(slot.muscle)) s += 22;
  else if (ft.secondary.includes(slot.muscle)) s += 5;
  const pi = slot.patterns.indexOf(ex.pattern);
  if (pi === 0) s += 10;
  else if (pi > 0) s += 6;

  // 1b. Качество стимула (дома упражнения с резиной/своим весом — норма, в зале — хуже нагружаемых аналогов)
  const q = QUALITY[ex.id] ?? 5;
  s += (q - 5) * 3;
  if (ctx.profile.location === 'home' && (ex.bodyweight || ex.equipment.includes('band'))) s += 4;

  // 2. Соответствие роли в тренировке
  if (slot.role === 'main') s += ex.mechanic === 'compound' ? (ex.tier === 1 ? 14 : ex.tier === 2 ? 9 : 3) : -10;
  else if (slot.role === 'secondary') s += ex.mechanic === 'compound' ? 8 : 3;
  else s += ex.mechanic === 'isolation' ? 8 : ex.tier === 1 ? -6 : 2;

  // 3. Предпочтения пользователя
  if (ctx.prefs.preferredExercises.includes(ex.id)) {
    s += 25;
    reasons.push('в избранном');
  }
  if (ctx.prefs.dislikedExercises.includes(ex.id)) {
    s -= 40;
    reasons.push('не нравится — только если нет замены');
  }

  // 4. Мягкие ограничения (лёгкий дискомфорт): сильный штраф, но не запрет
  const stress = exerciseStress(ex);
  for (const l of ctx.prefs.limitations) {
    if (l.severity !== 'mild' || l.source === 'doctor') continue;
    if (l.movements.some((m) => stress.includes(m))) {
      s -= 30;
      reasons.push(`учтён лёгкий дискомфорт: ${AREA_LABEL[l.area].toLowerCase()}`);
    }
  }

  // 5. Преемственность и история
  const prog = progressStatus(ex.id, ctx.sessions);
  if (ctx.previousId === ex.id) {
    if (prog.status === 'plateau') {
      s += 5;
      reasons.push('плато — допустима замена');
    } else {
      s += 35;
      reasons.push(prog.status === 'progressing' && prog.from !== undefined ? `прогресс ${prog.from}→${prog.to} кг — оставлено` : 'уже в программе — стабильность');
    }
  } else if (prog.status === 'progressing') {
    s += 15;
    reasons.push('по нему есть прогресс');
  } else if (prog.sessions >= 2 && prog.status !== 'plateau') s += 8;

  // 6. Уровень подготовки
  const lvl = ctx.profile.level;
  if (lvl === 'beginner' && TECHNICAL.has(ex.id)) s -= 10;
  if (lvl === 'beginner' && ex.equipment.includes('machine')) s += 4;
  if (lvl === 'advanced' && ex.tier === 1 && slot.role === 'main') s += 3;

  // 7. Усталость: на сушке, при низкой готовности и для вспомогательных ролей дорогие упражнения хуже
  const cost = fatigueCost(ex);
  const tired = ctx.band === 'light' || ctx.band === 'recover' || ctx.band === 'reduce';
  if (slot.role !== 'main' && cost >= 2) s -= cost * 3;
  if (tired) s -= cost * 3;
  if (ctx.profile.goal === 'cut' && cost >= 3) s -= 3;

  // 8. Избыточность: тот же паттерн уже дважды сегодня, то же упражнение в другой день недели
  const today = ctx.usedToday ?? [];
  const samePattern = today.filter((x) => x.pattern === ex.pattern).length;
  if (samePattern >= 2) s -= 15;
  else if (samePattern === 1 && slot.role !== 'main') s -= 10;
  if (ctx.usedThisWeek?.has(ex.id)) s -= 6;

  return { score: Math.round(s * 10) / 10, reasons };
}

/** Лучший допустимый кандидат для слота */
export function pickForSlot(pool: Exercise[], slot: SlotSpec, ctx: SelectionContext): { ex: Exercise; reasons: string[] } | undefined {
  const used = new Set((ctx.usedToday ?? []).map((e) => e.id));
  let best: { ex: Exercise; score: number; reasons: string[] } | undefined;
  for (const ex of pool) {
    if (used.has(ex.id)) continue;
    const ft = fineTargets(ex);
    const fits = ft.primary.includes(slot.muscle) && (slot.patterns.length === 0 || slot.patterns.includes(ex.pattern));
    if (!fits) continue;
    const r = scoreExercise(ex, slot, ctx);
    if (!best || r.score > best.score || (r.score === best.score && ex.id < best.ex.id)) best = { ex, score: r.score, reasons: r.reasons };
  }
  return best ? { ex: best.ex, reasons: best.reasons } : undefined;
}
