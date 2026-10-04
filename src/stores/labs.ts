import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LabReport } from '@/types';
import { persistOptions } from '@/storage/persist';

/** Анализы: только подтверждённые пользователем отчёты (после экрана «Проверьте распознанные данные») */
interface LabsState {
  reports: LabReport[];
  add: (r: LabReport) => void;
  update: (r: LabReport) => void;
  remove: (id: string) => void;
  reset: () => void;
}

export const useLabs = create<LabsState>()(
  persist(
    (set) => ({
      reports: [],
      add: (r) => set((s) => ({ reports: [...s.reports, r].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt)) })),
      update: (r) => set((s) => ({ reports: s.reports.map((x) => (x.id === r.id ? r : x)) })),
      remove: (id) => set((s) => ({ reports: s.reports.filter((x) => x.id !== id) })),
      reset: () => set({ reports: [] }),
    }),
    persistOptions<LabsState>('labs', 1, (s) => ({ reports: s.reports }) as LabsState),
  ),
);
