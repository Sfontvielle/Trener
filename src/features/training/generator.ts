import type { Exercise, PlannedExercise, ReadinessResult, UserProfile, VolumeMuscle, WorkoutDraft, WorkoutPlan, WorkoutSession } from '@/types';
import { EXERCISES } from '@/data/exercises';
import { addDays, today } from '@/utils/date';
import { uid } from '@/utils/id';
import { DAYS, repRange, restFor, rirFor, rotationFor } from './planGenerator';
import { getPrefs } from './engine/prefs';
import { checkAllowed, pickForSlot, type SlotRole, type SlotSpec } from './engine/scoring';
import { chooseSplit } from './engine/split';
import { doneFineVolume, setLimits, weeklyTargets } from './engine/volume';
import { fineTargets, isSmallMuscle, VM_ACC, VM_LABEL } from './engine/muscles';
import { orderExercises } from './engine/order';
import { estimateMinutes } from './engine/time';

export type GenFocus = 'auto' | 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full';

export const FOCUS_LABEL: Record<GenFocus, string> = {
  auto: 'Авто',
  push: 'Push',
  pull: 'Pull',
  legs: 'Ноги',
  upper: 'Верх',
  lower: 'Низ',
  full: 'Всё тело',
};

/** Фокус → шаблон дня из библиотеки сплитов */
const FOCUS_DAY: Record<Exclude<GenFocus, 'auto'>, string> = { push: 'push', pull: 'pull', legs: 'legs', upper: 'upA', lower: 'loA', full: 'fbA' };
const DAY_FOCUS: Record<string, Exclude<GenFocus, 'auto'>> = {
  upA: 'upper', upB: 'upper', loA: 'lower', loB: 'lower', push: 'push', pushB: 'push', pull: 'pull', pullB: 'pull', legs: 'legs', legsB: 'legs', fbA: 'full', fbB: 'full', fbC: 'full',
};

export interface GenerateResult {
  draft: WorkoutDraft;
  rationale: string[];
}

/** Сколько прямых подходов на группу за последние 48 ч */
function recentLoad(sessions: WorkoutSession[], customs: Exercise[]): Partial<Record<VolumeMuscle, number>> {
  const d = today();
  return doneFineVolume(sessions, addDays(d, -2), d, customs);
}

/**
 * Генерация тренировки «здесь и сейчас».
 *  • Фокус «Авто» выбирается среди дней ТЕКУЩЕГО сплита (Верх/Низ, PPL…), а не «Всё тело по умолчанию»:
 *    побеждает день, чьи мышцы сильнее недобрали недельный объём (в процентах от цели, чтобы мелкие
 *    группы не проигрывали крупным) и не нагружались последние 48 ч.
 *  • Упражнения — тем же скорингом, что и в плане: исключения/ограничения отфильтрованы полностью,
 *    избранное и упражнения из плана — выше.
 *  • Подходы — от ОСТАТКА недельной цели по группе, с учётом стиля (2/3/авто) и готовности.
 */
export function generateWorkout(args: {
  profile: UserProfile;
  sessions: WorkoutSession[];
  minutes: number;
  focus: GenFocus;
  readiness?: ReadinessResult;
  /** Упражнения текущего плана — для преемственности */
  preferIds?: string[];
  quick?: boolean;
  plan?: WorkoutPlan | null;
  customs?: Exercise[];
}): GenerateResult {
  const { profile, sessions, minutes, readiness } = args;
  const customs = args.customs ?? [];
  const prefs = getPrefs(profile);
  const d = today();
  const targets = weeklyTargets(profile, prefs);
  const week = doneFineVolume(sessions, addDays(d, -6), d, customs);
  const recent = recentLoad(sessions, customs);
  const limits = setLimits(prefs.setStyle, profile.level);
  const rationale: string[] = [];

  const fatigued = (m: VolumeMuscle) => (recent[m] ?? 0) >= 5;
  // Недобор недельной цели в долях (0..1): равные шансы мелким и крупным группам
  const deficit = (m: VolumeMuscle) => (targets[m] > 0 ? Math.max(0, targets[m] - (week[m] ?? 0)) / targets[m] : 0);

  // ── 1. Тип дня ───────────────────────────────────────────────────────
  let dayKey: string;
  let focus: Exclude<GenFocus, 'auto'>;
  if (args.focus === 'auto') {
    const split = args.plan?.split ?? chooseSplit(profile, prefs, sessions).split;
    const candidates = [...new Set(rotationFor(split, profile.daysPerWeek))];
    const scored = candidates.map((k) => {
      const ms = DAYS[k].slots.filter((sl) => sl.role !== 'accessory' || !isSmallMuscle(sl.muscle)).map((sl) => sl.muscle);
      const uniq = [...new Set(ms)];
      const score = uniq.reduce((a, m) => a + (fatigued(m) ? -1.2 : deficit(m)), 0) / Math.max(1, uniq.length);
      return { k, score, tired: uniq.filter(fatigued) };
    });
    scored.sort((a, b) => b.score - a.score || candidates.indexOf(a.k) - candidates.indexOf(b.k));
    dayKey = scored[0].k;
    focus = DAY_FOCUS[dayKey] ?? 'full';
    const fresh = [...new Set(DAYS[dayKey].slots.map((s) => s.muscle))].filter((m) => !fatigued(m) && deficit(m) > 0.3).slice(0, 3);
    rationale.push(
      `Фокус: ${FOCUS_LABEL[focus]} — день твоего сплита${fresh.length ? `, где больше всего недобрано за неделю (${fresh.map((m) => VM_LABEL[m].toLowerCase()).join(', ')})` : ''}${scored[0].tired.length ? '' : ' и мышцы отдохнули'}.`,
    );
  } else {
    focus = args.focus;
    dayKey = FOCUS_DAY[focus];
  }
  const def = DAYS[dayKey];

  // Короткая/быстрая тренировка — только основные и вторичные слоты, остальное по времени
  const vf = readiness?.volumeFactor ?? 1;
  const rirDelta = readiness?.rirDelta ?? 0;
  if (readiness && readiness.band !== 'go') rationale.push(`Готовность ${readiness.score}/100 → объём ×${vf}, запас +${rirDelta} повтор(а).`);
  const budget = Math.max(15, Math.round(minutes * Math.max(0.55, vf)));

  // ── 2. Упражнения ────────────────────────────────────────────────────
  const pool = [...EXERCISES, ...customs].filter((e) => checkAllowed(e, profile, prefs).ok);
  const planIds = new Set(args.preferIds ?? []);
  const usedToday: Exercise[] = [];
  const picked: { pe: PlannedExercise; role: SlotRole; muscle: VolumeMuscle }[] = [];
  const tired = new Set<VolumeMuscle>();
  const skipped: string[] = [];

  for (const slot of def.slots) {
    // Уставшая группа: базовое на неё не ставим главным, вспомогательное — пропускаем
    if (fatigued(slot.muscle) && slot.role === 'accessory') {
      tired.add(slot.muscle);
      continue;
    }
    // Быстрая тренировка: предпочтение упражнениям без долгой разминки (тренажёры/гантели вместо тяжёлой штанги)
    const band = readiness && readiness.band !== 'go' ? readiness.band : args.quick ? 'reduce' : readiness?.band;
    const ctx = { profile, prefs, sessions, usedToday, band, previousId: args.quick ? undefined : (undefined as string | undefined) };
    // Преемственность с планом: среди подходящих выбираем то, что уже есть в программе
    const fromPlan = pool.find((e) => planIds.has(e.id) && !usedToday.some((u) => u.id === e.id) && fineTargets(e).primary.includes(slot.muscle) && (slot.patterns.length === 0 || slot.patterns.includes(e.pattern)));
    if (!args.quick) ctx.previousId = fromPlan?.id;
    const trySlot = (sl: SlotSpec) => pickForSlot(pool, sl, ctx) ?? pickForSlot(pool, { ...sl, patterns: [] }, ctx);
    let r = trySlot(slot);
    let muscle = slot.muscle;
    if (!r && slot.fallback) {
      r = trySlot({ ...slot, ...slot.fallback });
      muscle = slot.fallback.muscle;
    }
    if (!r) {
      skipped.push(VM_ACC[slot.muscle]);
      continue;
    }
    const ex = r.ex;
    // Подходы: остаток недельной цели, делённый на оставшиеся тренировки этой группы (~2 в неделю)
    const remaining = Math.max(0, targets[muscle] - (week[muscle] ?? 0));
    const same = def.slots.filter((x) => x.muscle === muscle).length;
    let sets = limits.start(slot.role);
    const perSlot = remaining / 2 / same;
    if (perSlot >= sets + 1) sets = Math.min(limits.max(slot.role), Math.floor(perSlot));
    if (remaining <= 0 && slot.role !== 'main') sets = limits.min;
    if (fatigued(muscle)) {
      sets = Math.max(limits.min, sets - 1);
      tired.add(muscle);
    }
    sets = Math.max(limits.min, Math.round(sets * vf));
    if (vf < 0.75) sets = Math.max(1, Math.round(limits.start(slot.role) * vf));
    const [repMin, repMax] = repRange(ex, slot.role, profile.goal, prefs.repStyle);
    const rest = restFor(ex, slot.role);
    const why = [
      `${VM_LABEL[muscle]}: за 7 дней ${Math.round(week[muscle] ?? 0)}/${targets[muscle]} подх.`,
      remaining <= 0 ? 'недельная цель уже выполнена — поддерживающий объём' : `осталось ~${Math.round(remaining)}`,
      ...(fatigued(muscle) ? ['нагружалась за 48 ч — на подход меньше'] : []),
      ...r.reasons,
    ].join(' · ');
    const pe: PlannedExercise = {
      exerciseId: ex.id,
      sets,
      repMin,
      repMax,
      targetRir: rirFor(slot.role, profile.level) + rirDelta,
      restSec: args.quick ? Math.min(rest, ex.mechanic === 'compound' ? 90 : 60) : rest,
      slot: `gen.${slot.key}`,
      why,
    };
    picked.push({ pe, role: slot.role, muscle });
    usedToday.push(ex);
  }

  // ── 3. Подгонка под время: сначала лишние подходы, потом вспомогательные ──
  const list = () => picked.map((x) => x.pe);
  let guard = 0;
  while (estimateMinutes(list(), customs) > budget + (args.quick ? 5 : 3) && guard++ < 40) {
    const acc = picked.filter((x) => x.role === 'accessory');
    const reducible = [...picked].filter((x) => x.pe.sets > limits.min).sort((a, b) => roleW(b.role) - roleW(a.role) || b.pe.sets - a.pe.sets)[0];
    // Для короткой тренировки важнее покрыть группы, чем дать 4 подхода одному упражнению
    if (reducible && reducible.pe.sets > 3) {
      reducible.pe.sets--;
      continue;
    }
    if (acc.length && picked.length > 3) {
      // Удаляем вспомогательное с наименьшим недобором недели
      const drop = acc.sort((a, b) => deficit(a.muscle) - deficit(b.muscle))[0];
      picked.splice(picked.indexOf(drop), 1);
      continue;
    }
    if (reducible) {
      reducible.pe.sets--;
      continue;
    }
    if (picked.length > 2) {
      picked.pop();
      continue;
    }
    break;
  }

  if (tired.size) rationale.push(`Недавно нагружались: ${[...tired].map((m) => VM_LABEL[m].toLowerCase()).join(', ')} — для них меньше подходов.`);
  if (skipped.length) rationale.push(`Нет допустимых упражнений на ${skipped.join(', ')} (ограничения/оборудование) — пропущено.`);
  if (prefs.setStyle !== 'auto') rationale.push(`Стиль подходов: ${prefs.setStyle} в упражнении.`);
  const ordered = orderExercises(list(), prefs.priorityMuscles, customs);
  rationale.push(`~${estimateMinutes(ordered, customs)} мин, ${ordered.reduce((a, e) => a + e.sets, 0)} рабочих подходов.`);

  const name = args.quick ? `Быстрая · ${FOCUS_LABEL[focus]}` : `${FOCUS_LABEL[focus]} · сгенерирована`;
  return {
    draft: { id: uid('d_'), name, focus: def.focus, source: args.quick ? 'quick' : 'generated', exercises: ordered, createdAt: Date.now() },
    rationale,
  };
}

const roleW = (r: SlotRole) => (r === 'main' ? 0 : r === 'secondary' ? 1 : 2);

/** Для подсказок: подходящая ли группа к выбранному фокусу */
export function focusMuscles(focus: Exclude<GenFocus, 'auto'>): VolumeMuscle[] {
  return [...new Set(DAYS[FOCUS_DAY[focus]].slots.map((s) => s.muscle))];
}
