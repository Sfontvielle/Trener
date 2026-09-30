import { create } from 'zustand';

/** Эфемерное UI-состояние (не сохраняется) */
interface UiState {
  hubOpen: boolean;
  openHub: () => void;
  closeHub: () => void;
}

export const useUi = create<UiState>((set) => ({
  hubOpen: false,
  openHub: () => set({ hubOpen: true }),
  closeHub: () => set({ hubOpen: false }),
}));
