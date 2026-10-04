import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Exercise, ExerciseSet, WorkoutDraft, WorkoutExercise, WorkoutSession } from '@/types';
import { persistOptions } from '@/storage/persist';
import { localizeWorkoutName } from '@/features/training/names';
import { uid } from '@/utils/id';
import { cancelRestEnd, scheduleRestEnd } from '@/services/notifications';
import { useProfile } from './profile';

const notifyRest = (seconds: number, label: string) => {
  if (useProfile.getState().settings.restNotify) void scheduleRestEnd(seconds, label);
};

export interface RestTimer {
  startedAt: number;
  endsAt: number;
  duration: number;
  label: string;
}

interface WorkoutState {
  sessions: WorkoutSession[];
  active: WorkoutSession | null;
  draft: WorkoutDraft | null;
  rest: RestTimer | null;
  customExercises: Exercise[];

  start: (s: WorkoutSession) => void;
  patchActive: (fn: (s: WorkoutSession) => WorkoutSession) => void;
  updateSet: (weId: string, setId: string, patch: Partial<ExerciseSet>) => void;
  addSet: (weId: string) => void;
  /** Вставить разминочные подходы перед рабочими (не считаются рабочим объёмом) */
  addWarmups: (weId: string, sets: { weight: number; reps: number }[]) => void;
  removeSet: (weId: string, setId: string) => void;
  addExercise: (we: WorkoutExercise) => void;
  removeExercise: (weId: string) => void;
  replaceExercise: (weId: string, we: WorkoutExercise) => void;
  moveExercise: (weId: string, dir: -1 | 1) => void;
  /** Открыть упражнение по индексу (focus mode) */
  setCurrent: (index: number) => void;
  finish: (patch: Partial<WorkoutSession>) => WorkoutSession | null;
  discard: () => void;
  deleteSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<WorkoutSession>) => void;
  startRest: (duration: number, label: string) => void;
  adjustRest: (deltaSec: number) => void;
  stopRest: () => void;
  setDraft: (d: WorkoutDraft | null) => void;
  addCustomExercise: (e: Exercise) => void;
  reset: () => void;
}

const mapEx = (s: WorkoutSession, weId: string, fn: (we: WorkoutExercise) => WorkoutExercise): WorkoutSession => ({
  ...s,
  exercises: s.exercises.map((we) => (we.id === weId ? fn(we) : we)),
});

export const useWorkouts = create<WorkoutState>()(
  persist(
    (set, get) => ({
      sessions: [],
      active: null,
      draft: null,
      rest: null,
      customExercises: [],

      start: (s) => set({ active: s, rest: null }),
      patchActive: (fn) => set((st) => (st.active ? { active: fn(st.active) } : {})),
      updateSet: (weId, setId, patch) =>
        get().patchActive((s) => mapEx(s, weId, (we) => ({ ...we, sets: we.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)) }))),
      addSet: (weId) =>
        get().patchActive((s) =>
          mapEx(s, weId, (we) => {
            const last = we.sets[we.sets.length - 1];
            const ns: ExerciseSet = { id: uid('s_'), weight: last?.weight ?? we.recommendation?.weight ?? 0, reps: last?.reps ?? we.repMax, done: false };
            return { ...we, sets: [...we.sets, ns] };
          }),
        ),
      addWarmups: (weId, list) =>
        get().patchActive((s) =>
          mapEx(s, weId, (we) => ({
            ...we,
            sets: [...list.map((w) => ({ id: uid('s_'), weight: w.weight, reps: w.reps, done: false, warmup: true }) as ExerciseSet), ...we.sets.filter((x) => !(x.warmup && !x.done))],
          })),
        ),
      removeSet: (weId, setId) => get().patchActive((s) => mapEx(s, weId, (we) => ({ ...we, sets: we.sets.filter((x) => x.id !== setId) }))),
      addExercise: (we) => get().patchActive((s) => ({ ...s, exercises: [...s.exercises, we] })),
      removeExercise: (weId) =>
        get().patchActive((s) => {
          const exercises = s.exercises.filter((x) => x.id !== weId);
          return { ...s, exercises, currentIndex: clampIndex(s.currentIndex ?? 0, exercises.length) };
        }),
      replaceExercise: (weId, we) => get().patchActive((s) => ({ ...s, exercises: s.exercises.map((x) => (x.id === weId ? we : x)) })),
      moveExercise: (weId, dir) =>
        get().patchActive((s) => {
          const i = s.exercises.findIndex((x) => x.id === weId);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.exercises.length) return s;
          const arr = [...s.exercises];
          [arr[i], arr[j]] = [arr[j], arr[i]];
          return { ...s, exercises: arr };
        }),
      setCurrent: (index) => get().patchActive((s) => ({ ...s, currentIndex: clampIndex(index, s.exercises.length) })),
      finish: (patch) => {
        const a = get().active;
        if (!a) return null;
        // Незавершённые подходы не сохраняем как выполненные; пустые упражнения убираем
        const exercises = a.exercises.map((we) => ({ ...we, sets: we.sets.filter((x) => x.done) })).filter((we) => we.sets.length > 0 || we.plannedSets > 0);
        const done: WorkoutSession = { ...a, ...patch, exercises, finishedAt: Date.now(), status: 'completed' };
        set((st) => ({ sessions: [...st.sessions, done], active: null, rest: null }));
        void cancelRestEnd();
        return done;
      },
      discard: () => {
        set({ active: null, rest: null });
        void cancelRestEnd();
      },
      deleteSession: (id) => set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) })),
      updateSession: (id, patch) => set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
      startRest: (duration, label) => {
        const now = Date.now();
        set({ rest: { startedAt: now, endsAt: now + duration * 1000, duration, label } });
        notifyRest(duration, label);
      },
      adjustRest: (d) => {
        set((st) => (st.rest ? { rest: { ...st.rest, endsAt: Math.max(Date.now(), st.rest.endsAt + d * 1000), duration: Math.max(0, st.rest.duration + d) } } : {}));
        const r = get().rest;
        if (r) notifyRest((r.endsAt - Date.now()) / 1000, r.label);
      },
      stopRest: () => {
        set({ rest: null });
        void cancelRestEnd();
      },
      setDraft: (d) => set({ draft: d }),
      addCustomExercise: (e) => set((st) => ({ customExercises: [...st.customExercises, e] })),
      reset: () => set({ sessions: [], active: null, draft: null, rest: null, customExercises: [] }),
    }),
    {
      ...persistOptions<WorkoutState>('workouts', 1, (s) => ({ sessions: s.sessions, active: s.active, draft: s.draft, rest: s.rest, customExercises: s.customExercises }) as WorkoutState),
      // История до русификации: «Upper A» → «Верх А»
      merge: (persisted, current) => {
        const p = { ...current, ...(persisted as Partial<WorkoutState>) };
        p.sessions = (p.sessions ?? []).map((x) => ({ ...x, name: localizeWorkoutName(x.name) }));
        if (p.active) p.active = { ...p.active, name: localizeWorkoutName(p.active.name) };
        return p;
      },
    },
  ),
);

/** Индекс в пределах списка (пустой список → 0) */
export function clampIndex(i: number, len: number): number {
  return Math.max(0, Math.min(len - 1, Math.round(i)));
}

export function hasProgress(s: WorkoutSession | null): boolean {
  return !!s && s.exercises.some((we) => we.sets.some((x) => x.done));
}
