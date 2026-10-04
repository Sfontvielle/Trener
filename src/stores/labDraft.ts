import { create } from 'zustand';
import type { LabDraft } from '@/features/labs/report';

/** Черновик анализа между экраном загрузки и экраном проверки (не сохраняется на диск) */
export const useLabDraft = create<{ draft: LabDraft | null; set: (d: LabDraft | null) => void }>((set) => ({
  draft: null,
  set: (draft) => set({ draft }),
}));
