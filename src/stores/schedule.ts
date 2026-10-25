import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ISODate, PlannedExercise, PlannedWorkout, UserTemplate, WorkoutColor, WorkoutSession } from '@/types';
import { persistOptions } from '@/storage/persist';
import { matchPlanned } from '@/features/training/library';
import { uid } from '@/utils/id';

/**
 * Запланированные тренировки (любые, на любую дату) и свои шаблоны. Отдельное хранилище: история тренировок
 * (useWorkouts.sessions) и план программы (usePlan) не меняются. Выполнение закрывает план по совпадению даты
 * и шаблона/названия (matchPlanned); пропуск отмечает только человек.
 */
interface ScheduleState {
  planned: PlannedWorkout[];
  templates: UserTemplate[];
  plan: (p: { date: ISODate; name: string; source: PlannedWorkout['source']; exercises: PlannedExercise[]; templateId?: string; fromSessionId?: string; color?: WorkoutColor }) => PlannedWorkout;
  move: (id: string, date: ISODate) => void;
  skip: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  /** Завершённая тренировка закрывает подходящий план; выполненный вручную — по id */
  completeWith: (s: WorkoutSession, plannedId?: string) => void;
  saveTemplate: (t: { name: string; exercises: PlannedExercise[]; color?: WorkoutColor }) => UserTemplate;
  updateTemplate: (id: string, patch: Partial<Pick<UserTemplate, 'name' | 'exercises' | 'color'>>) => void;
  renameTemplate: (id: string, name: string) => void;
  removeTemplate: (id: string) => void;
  reset: () => void;
}

export const useSchedule = create<ScheduleState>()(
  persist(
    (set, get) => ({
      planned: [],
      templates: [],
      plan: (p) => {
        const item: PlannedWorkout = { id: uid('pl_'), status: 'planned', createdAt: Date.now(), ...p, exercises: p.exercises.map((e) => ({ ...e })) };
        set((s) => ({ planned: [...s.planned, item] }));
        return item;
      },
      move: (id, date) => set((s) => ({ planned: s.planned.map((p) => (p.id === id ? { ...p, date, status: 'planned' } : p)) })),
      skip: (id) => set((s) => ({ planned: s.planned.map((p) => (p.id === id && p.status === 'planned' ? { ...p, status: 'skipped' } : p)) })),
      restore: (id) => set((s) => ({ planned: s.planned.map((p) => (p.id === id && p.status === 'skipped' ? { ...p, status: 'planned' } : p)) })),
      remove: (id) => set((s) => ({ planned: s.planned.filter((p) => p.id !== id) })),
      completeWith: (session, plannedId) => {
        const target = plannedId ? get().planned.find((p) => p.id === plannedId && p.status !== 'done') : matchPlanned(get().planned, session);
        if (!target) return;
        set((s) => ({ planned: s.planned.map((p) => (p.id === target.id ? { ...p, status: 'done', doneSessionId: session.id } : p)) }));
      },
      saveTemplate: (t) => {
        const now = Date.now();
        const tpl: UserTemplate = { id: uid('ut_'), name: t.name.trim() || 'Мой шаблон', exercises: t.exercises.map((e) => ({ ...e })), color: t.color, createdAt: now, updatedAt: now };
        set((s) => ({ templates: [...s.templates, tpl] }));
        return tpl;
      },
      updateTemplate: (id, patch) =>
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, ...patch, name: patch.name !== undefined ? patch.name.trim() || t.name : t.name, exercises: patch.exercises ? patch.exercises.map((e) => ({ ...e })) : t.exercises, updatedAt: Date.now() } : t,
          ),
        })),
      renameTemplate: (id, name) => set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name, updatedAt: Date.now() } : t)) })),
      removeTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
      reset: () => set({ planned: [], templates: [] }),
    }),
    persistOptions<ScheduleState>('schedule', 1, (s) => ({ planned: s.planned, templates: s.templates }) as ScheduleState),
  ),
);
