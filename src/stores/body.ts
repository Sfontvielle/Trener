import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BodyMetric, ISODate, WeightEntry } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';

interface BodyState {
  weights: WeightEntry[];
  metrics: BodyMetric[];
  addWeight: (date: ISODate, kg: number) => void;
  removeWeight: (id: string) => void;
  addMetric: (m: Omit<BodyMetric, 'id'>) => void;
  reset: () => void;
}

export const useBody = create<BodyState>()(
  persist(
    (set) => ({
      weights: [],
      metrics: [],
      addWeight: (date, kg) =>
        set((s) => ({
          // одно взвешивание в день: повторная запись заменяет
          weights: [...s.weights.filter((w) => w.date !== date), { id: uid('w_'), date, kg, createdAt: Date.now() }].sort((a, b) => (a.date < b.date ? -1 : 1)),
        })),
      removeWeight: (id) => set((s) => ({ weights: s.weights.filter((w) => w.id !== id) })),
      addMetric: (m) => set((s) => ({ metrics: [...s.metrics, { ...m, id: uid('m_') }] })),
      reset: () => set({ weights: [], metrics: [] }),
    }),
    persistOptions<BodyState>('body', 1, (s) => ({ weights: s.weights, metrics: s.metrics }) as BodyState),
  ),
);
