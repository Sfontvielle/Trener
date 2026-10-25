import { router } from 'expo-router';
import type { WorkoutDraft, WorkoutSession, WorkoutTemplate } from '@/types';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { useCheckins } from '@/stores/checkins';
import { useProfile } from '@/stores/profile';
import { useHealth } from '@/stores/health';
import { readinessFor } from '@/features/recovery/derive';
import { resolveToday } from './today';
import { buildSession, DEFAULT_SETS } from './session';
import { generateWorkout, type GenFocus } from './generator';
import { confirm } from '@/components/Dialog';
import { today } from '@/utils/date';
import { uid } from '@/utils/id';
import { getExercise } from '@/data/exercises';
import { haptic } from '@/services/haptics';
import { healthTraining } from '@/features/profile/health';
import { noIncreaseReason } from '@/features/health/current';
import { repeatPlanned } from './journal';

function ctxBase() {
  const ws = useWorkouts.getState();
  const d = today();
  const readiness = readinessFor(d, useCheckins.getState().byDate, ws.sessions, useHealth.getState().days);
  return { ws, readiness, d };
}

function guardActive(start: () => void) {
  const active = useWorkouts.getState().active;
  if (!active) return start();
  confirm('Есть незавершённая тренировка', `«${active.name}» ещё не закончена. Начать новую и удалить незавершённую?`, 'Начать новую', () => {
    useWorkouts.getState().discard();
    start();
  }, true);
}

/** Старт сегодняшней плановой тренировки с учётом readiness / изменений дня; plannedId — из «Запланированных» */
export function startTodayPlanned(templateOverride?: WorkoutTemplate, plannedId?: string) {
  guardActive(() => {
    const { ws, readiness, d } = ctxBase();
    const ps = usePlan.getState();
    const tw = resolveToday({ date: d, plan: ps.plan, sessions: ws.sessions, override: ps.overrides[d], readiness });
    const tpl = templateOverride ?? tw.template;
    if (!tpl) return;
    const s = buildSession({
      name: tpl.name,
      focus: tpl.focus,
      source: 'plan',
      templateId: tpl.id,
      planned: tpl.exercises,
      ctx: { sessions: ws.sessions, customs: ws.customExercises, band: !templateOverride && tw.mode !== 'normal' && (!readiness || readiness.band === 'go') ? 'reduce' : readiness?.band, volumeFactor: templateOverride ? 1 : tw.volumeFactor, rirDelta: templateOverride ? 0 : tw.rirDelta, gym: useProfile.getState().settings.gym, noIncrease: noIncreaseReason() },
      readinessScore: readiness?.score,
    });
    useWorkouts.getState().start(plannedId ? { ...s, plannedId } : s);
    haptic.success();
    router.push('/workout/active');
  });
}

export function startDraft(draft: WorkoutDraft) {
  if (!draft.exercises.length) return;
  guardActive(() => {
    const { ws, readiness } = ctxBase();
    const s = buildSession({
      name: draft.name,
      focus: draft.focus,
      source: draft.source,
      templateId: draft.templateId,
      planned: draft.exercises,
      // Сгенерированная тренировка уже учла готовность (объём/RIR) — не применяем повторно
      ctx: { sessions: ws.sessions, customs: ws.customExercises, band: readiness?.band, volumeFactor: 1, rirDelta: 0, gym: useProfile.getState().settings.gym, noIncrease: noIncreaseReason() },
      readinessScore: readiness?.score,
    });
    useWorkouts.getState().start({ ...s, ...(draft.color ? { color: draft.color } : null), ...(draft.plannedId ? { plannedId: draft.plannedId } : null) });
    useWorkouts.getState().setDraft(null);
    haptic.success();
    router.replace('/workout/active');
  });
}

/**
 * «Повторить» прошлую тренировку: те же упражнения, подходы, диапазоны и суперсеты.
 * Веса — по прогрессии тренера от этой же тренировки (не копия, а следующий шаг).
 */
export function repeatSession(s: WorkoutSession) {
  const planned = repeatPlanned(s);
  if (!planned.length) return;
  startDraft({ id: uid('d_'), name: s.name, focus: s.focus, source: 'custom', exercises: planned, createdAt: Date.now(), color: s.color });
}

/** Тренировка из выбранных упражнений (от тренера или «Тренировать сейчас» на карточке упражнения) */
export function startExercises(exerciseIds: string[], o: { name?: string; sets?: number; repMin?: number; repMax?: number } = {}) {
  const customs = useWorkouts.getState().customExercises;
  const profile = useProfile.getState().profile;
  const minRir = profile ? healthTraining(profile).minRir : 0;
  const planned = exerciseIds
    .map((id) => getExercise(id, customs))
    .filter((ex): ex is NonNullable<typeof ex> => !!ex)
    .map((ex) => ({
      exerciseId: ex.id,
      sets: o.sets ?? DEFAULT_SETS,
      repMin: o.repMin ?? ex.defaultReps[0],
      repMax: o.repMax ?? ex.defaultReps[1],
      targetRir: Math.max(minRir, ex.mechanic === 'compound' ? 2 : 1),
      restSec: ex.mechanic === 'compound' ? 120 : 75,
    }));
  if (!planned.length) return;
  startDraft({ id: uid('d_'), name: o.name ?? (planned.length === 1 ? getExercise(planned[0].exerciseId, customs)!.name : 'Тренировка от тренера'), focus: '', source: 'custom', exercises: planned, createdAt: Date.now() });
}

export function openGenerated(minutes: number, focus: GenFocus, quick = false) {
  const profile = useProfile.getState().profile;
  if (!profile) return;
  const { ws, readiness } = ctxBase();
  const plan = usePlan.getState().plan;
  const preferIds = plan?.templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)) ?? [];
  const r = generateWorkout({ profile, sessions: ws.sessions, minutes, focus, readiness, preferIds, quick, plan, customs: ws.customExercises });
  useWorkouts.getState().setDraft({ ...r.draft, name: r.draft.name });
  // Объяснение выбора дня не показываем: экран — только упражнения и «Начать»
  router.push('/workout/builder');
}

/** Новая тренировка в конструкторе; planDate — собрать и запланировать на этот день, а не начать сейчас */
export function openCustomBuilder(planDate?: string) {
  useWorkouts.getState().setDraft({ id: uid('d_'), name: 'Своя тренировка', focus: '', source: 'custom', exercises: [], createdAt: Date.now(), color: 'lime' });
  router.push(planDate ? { pathname: '/workout/builder', params: { planDate } } : '/workout/builder');
}

export function resumeActive() {
  if (useWorkouts.getState().active) router.push('/workout/active');
}
