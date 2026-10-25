import { create } from 'zustand';

/** Что запланировать из шторки «+», когда тренировка уже выбрана (свой шаблон или прошлая тренировка) */
export type HubPrefill = { kind: 'template'; id: string } | { kind: 'session'; id: string };

/** Эфемерное UI-состояние (не сохраняется) */
interface UiState {
  hubOpen: boolean;
  /** С какого шага открыть «+»: корень, «Начать», «Запланировать» */
  hubStep: 'root' | 'start' | 'plan';
  hubPrefill: HubPrefill | null;
  openHub: (o?: { step?: UiState['hubStep']; prefill?: HubPrefill }) => void;
  closeHub: () => void;
}

export const useUi = create<UiState>((set) => ({
  hubOpen: false,
  hubStep: 'root',
  hubPrefill: null,
  openHub: (o) => set({ hubOpen: true, hubStep: o?.step ?? (o?.prefill ? 'plan' : 'root'), hubPrefill: o?.prefill ?? null }),
  closeHub: () => set({ hubOpen: false }),
}));
