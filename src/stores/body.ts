import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BodyMetric, ISODate, WeightEntry } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';
import type { PhotoAnalysis } from '@/features/progress/body';

/** Фото прогресса: файл хранится в папке приложения, в сторе — только ссылка и дата */
export interface ProgressPhoto {
  id: string;
  date: ISODate;
  uri: string;
  pose: 'front' | 'side' | 'back';
  createdAt: number;
}

interface BodyState {
  weights: WeightEntry[];
  metrics: BodyMetric[];
  photos: ProgressPhoto[];
  /** Анализы фото прогресса (последние 10) */
  analyses: PhotoAnalysis[];
  addAnalysis: (a: PhotoAnalysis) => void;
  addPhoto: (p: Omit<ProgressPhoto, 'id' | 'createdAt'>) => void;
  removePhoto: (id: string) => void;
  removeMetric: (id: string) => void;
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
      photos: [],
      analyses: [],
      addAnalysis: (a) => set((s) => ({ analyses: [...s.analyses, a].slice(-10) })),
      addPhoto: (p) => set((s) => ({ photos: [...s.photos, { ...p, id: uid('ph_'), createdAt: Date.now() }].sort((a, b) => (a.date < b.date ? -1 : 1)) })),
      removePhoto: (id) => set((s) => ({ photos: s.photos.filter((x) => x.id !== id) })),
      removeMetric: (id) => set((s) => ({ metrics: s.metrics.filter((x) => x.id !== id) })),
      addWeight: (date, kg) =>
        set((s) => ({
          // одно взвешивание в день: повторная запись заменяет
          weights: [...s.weights.filter((w) => w.date !== date), { id: uid('w_'), date, kg, createdAt: Date.now() }].sort((a, b) => (a.date < b.date ? -1 : 1)),
        })),
      removeWeight: (id) => set((s) => ({ weights: s.weights.filter((w) => w.id !== id) })),
      // Один замер одного вида в день: повторная запись заменяет
      addMetric: (m) => set((s) => ({ metrics: [...s.metrics.filter((x) => !(x.date === m.date && x.kind === m.kind)), { ...m, id: uid('m_') }].sort((a, b) => (a.date < b.date ? -1 : 1)) })),
      reset: () => set({ weights: [], metrics: [], photos: [], analyses: [] }),
    }),
    persistOptions<BodyState>('body', 1, (s) => ({ weights: s.weights, metrics: s.metrics, photos: s.photos, analyses: s.analyses }) as BodyState),
  ),
);
