import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DayOverride, ISODate, NutritionTarget, PlanAdjustment, WorkoutPlan, WorkoutTemplate } from '@/types';
import { persistOptions } from '@/storage/persist';
import { localizeWorkoutName } from '@/features/training/names';
import { uid } from '@/utils/id';

interface PlanState {
  plan: WorkoutPlan | null;
  target: NutritionTarget | null;
  overrides: Record<ISODate, DayOverride>;
  adjustments: PlanAdjustment[];
  setPlan: (plan: WorkoutPlan, target: NutritionTarget, summary: string, source: PlanAdjustment['source']) => void;
  setTarget: (target: NutritionTarget) => void;
  setOverride: (o: DayOverride) => void;
  clearOverride: (date: ISODate) => void;
  addAdjustment: (a: Omit<PlanAdjustment, 'id' | 'createdAt'>) => void;
  updateTemplate: (t: WorkoutTemplate) => void;
  reset: () => void;
}

export const usePlan = create<PlanState>()(
  persist(
    (set) => ({
      plan: null,
      target: null,
      overrides: {},
      adjustments: [],
      setPlan: (plan, target, summary, source) =>
        set((s) => ({
          plan,
          target,
          adjustments: [{ id: uid('adj_'), createdAt: Date.now(), kind: 'plan_rebuild' as const, summary, source }, ...s.adjustments].slice(0, 100),
        })),
      setTarget: (target) => set({ target }),
      setOverride: (o) => set((s) => ({ overrides: { ...s.overrides, [o.date]: o } })),
      clearOverride: (date) =>
        set((s) => {
          const next = { ...s.overrides };
          delete next[date];
          return { overrides: next };
        }),
      addAdjustment: (a) => set((s) => ({ adjustments: [{ ...a, id: uid('adj_'), createdAt: Date.now() }, ...s.adjustments].slice(0, 100) })),
      updateTemplate: (t) =>
        set((s) => (s.plan ? { plan: { ...s.plan, templates: s.plan.templates.map((x) => (x.id === t.id ? t : x)) } } : {})),
      reset: () => set({ plan: null, target: null, overrides: {}, adjustments: [] }),
    }),
    {
      ...persistOptions<PlanState>('plan', 1, (s) => ({ plan: s.plan, target: s.target, overrides: s.overrides, adjustments: s.adjustments }) as PlanState),
      // Планы, созданные до русификации, получают русские названия дней
      merge: (persisted, current) => {
        const p = { ...current, ...(persisted as Partial<PlanState>) };
        if (p.plan) p.plan = { ...p.plan, templates: p.plan.templates.map((t) => ({ ...t, name: localizeWorkoutName(t.name) })) };
        return p;
      },
    },
  ),
);
