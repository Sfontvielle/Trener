import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AasEntry, BloodPressureEntry } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';

/**
 * Режим Enhanced / AAS — КОНТЕКСТ для более внимательного мониторинга здоровья.
 * Хранит пользовательскую историю (вещество, даты, доза как записал сам пользователь, заметки) и давление.
 * RYNJI не анализирует дозы, не составляет схем и не советует изменения — только показывает историю на шкале
 * времени и следит за показателями здоровья (давление, пульс покоя, анализы, вес, талия).
 */
interface EnhancedState {
  enabled: boolean;
  aas: AasEntry[];
  bp: BloodPressureEntry[];
  setEnabled: (v: boolean) => void;
  addAas: (e: Omit<AasEntry, 'id' | 'createdAt'>) => void;
  updateAas: (e: AasEntry) => void;
  removeAas: (id: string) => void;
  addBp: (e: Omit<BloodPressureEntry, 'id' | 'createdAt'>) => void;
  removeBp: (id: string) => void;
  reset: () => void;
}

const byDate = <T extends { date?: string; startDate?: string; createdAt: number }>(a: T, b: T) => ((a.date ?? a.startDate ?? '') < (b.date ?? b.startDate ?? '') ? -1 : (a.date ?? a.startDate ?? '') > (b.date ?? b.startDate ?? '') ? 1 : a.createdAt - b.createdAt);

export const useEnhanced = create<EnhancedState>()(
  persist(
    (set) => ({
      enabled: false,
      aas: [],
      bp: [],
      setEnabled: (v) => set({ enabled: v }),
      addAas: (e) => set((s) => ({ aas: [...s.aas, { ...e, id: uid('aas_'), createdAt: Date.now() }].sort(byDate) })),
      updateAas: (e) => set((s) => ({ aas: s.aas.map((x) => (x.id === e.id ? e : x)).sort(byDate) })),
      removeAas: (id) => set((s) => ({ aas: s.aas.filter((x) => x.id !== id) })),
      addBp: (e) => set((s) => ({ bp: [...s.bp, { ...e, id: uid('bp_'), createdAt: Date.now() }].sort(byDate) })),
      removeBp: (id) => set((s) => ({ bp: s.bp.filter((x) => x.id !== id) })),
      reset: () => set({ enabled: false, aas: [], bp: [] }),
    }),
    persistOptions<EnhancedState>('enhanced', 1, (s) => ({ enabled: s.enabled, aas: s.aas, bp: s.bp }) as EnhancedState),
  ),
);
