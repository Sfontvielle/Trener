import { router } from 'expo-router';
import type { WorkoutDraft, WorkoutTemplate } from '@/types';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { useCheckins } from '@/stores/checkins';
import { useProfile } from '@/stores/profile';
import { readinessFor } from '@/features/recovery/derive';
import { resolveToday } from './today';
import { buildSession } from './session';
import { generateWorkout, type GenFocus } from './generator';
import { confirm } from '@/components/Dialog';
import { today } from '@/utils/date';
import { uid } from '@/utils/id';
import { haptic } from '@/services/haptics';
import { ensurePermission } from '@/services/notifications';

/** Разрешение на уведомления спрашиваем в момент, когда оно понятно зачем — при старте тренировки */
function askRestPermission() {
  if (useProfile.getState().settings.restNotify) void ensurePermission();
}

function ctxBase() {
  const ws = useWorkouts.getState();
  const d = today();
  const readiness = readinessFor(d, useCheckins.getState().byDate, ws.sessions);
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

/** Старт сегодняшней плановой тренировки с учётом readiness / изменений дня */
export function startTodayPlanned(templateOverride?: WorkoutTemplate) {
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
      ctx: { sessions: ws.sessions, customs: ws.customExercises, band: !templateOverride && tw.mode !== 'normal' && (!readiness || readiness.band === 'go') ? 'reduce' : readiness?.band, volumeFactor: templateOverride ? 1 : tw.volumeFactor, rirDelta: templateOverride ? 0 : tw.rirDelta },
      readinessScore: readiness?.score,
    });
    useWorkouts.getState().start(s);
    haptic.success();
    askRestPermission();
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
      ctx: { sessions: ws.sessions, customs: ws.customExercises, band: readiness?.band, volumeFactor: 1, rirDelta: 0 },
      readinessScore: readiness?.score,
    });
    useWorkouts.getState().start(s);
    useWorkouts.getState().setDraft(null);
    haptic.success();
    askRestPermission();
    router.replace('/workout/active');
  });
}

export function openGenerated(minutes: number, focus: GenFocus, quick = false) {
  const profile = useProfile.getState().profile;
  if (!profile) return;
  const { ws, readiness } = ctxBase();
  const plan = usePlan.getState().plan;
  const preferIds = plan?.templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)) ?? [];
  const r = generateWorkout({ profile, sessions: ws.sessions, minutes, focus, readiness, preferIds, quick, plan, customs: ws.customExercises });
  useWorkouts.getState().setDraft({ ...r.draft, name: r.draft.name });
  router.push({ pathname: '/workout/builder', params: { rationale: r.rationale.join('\n') } });
}

export function openCustomBuilder() {
  useWorkouts.getState().setDraft({ id: uid('d_'), name: 'Своя тренировка', focus: '', source: 'custom', exercises: [], createdAt: Date.now() });
  router.push('/workout/builder');
}

export function resumeActive() {
  if (useWorkouts.getState().active) router.push('/workout/active');
}
