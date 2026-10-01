import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CoachMemoryItem, CoachMessage, ISODate } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';

export interface DailyInsight {
  date: ISODate;
  key: string; // хэш входных фактов — при изменении данных инсайт обновляется
  text: string;
  source: 'ai' | 'local';
  createdAt: number;
}

interface CoachState {
  messages: CoachMessage[];
  summary: string;
  summarizedUntil: number;
  memory: CoachMemoryItem[];
  insight: DailyInsight | null;
  /** «Больше не предлагать»: ключи отклонённых предложений AI */
  rejected: string[];
  addRejected: (key: string) => void;
  updateMemory: (id: string, text: string) => void;
  addMessage: (m: Omit<CoachMessage, 'id' | 'createdAt'> & { id?: string }) => CoachMessage;
  patchMessage: (id: string, patch: Partial<CoachMessage>) => void;
  setSummary: (summary: string, until: number) => void;
  addMemory: (text: string, category: CoachMemoryItem['category'], source: CoachMemoryItem['source']) => void;
  removeMemory: (id: string) => void;
  setInsight: (i: DailyInsight) => void;
  clearChat: () => void;
  reset: () => void;
}

export const useCoach = create<CoachState>()(
  persist(
    (set, get) => ({
      messages: [],
      summary: '',
      summarizedUntil: 0,
      memory: [],
      insight: null,
      rejected: [],
      addRejected: (key) => set((s) => ({ rejected: s.rejected.includes(key) ? s.rejected : [...s.rejected, key].slice(-200) })),
      updateMemory: (id, text) => set((s) => ({ memory: s.memory.map((m) => (m.id === id ? { ...m, text: text.trim(), source: 'user' } : m)) })),
      addMessage: (m) => {
        const msg: CoachMessage = { ...m, id: m.id ?? uid('msg_'), createdAt: Date.now() };
        set((s) => ({ messages: [...s.messages, msg].slice(-300) }));
        return msg;
      },
      patchMessage: (id, patch) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      setSummary: (summary, until) => set({ summary, summarizedUntil: until }),
      addMemory: (text, category, source) => {
        const norm = text.trim().toLowerCase();
        if (!norm || get().memory.some((m) => m.text.trim().toLowerCase() === norm)) return;
        set((s) => ({ memory: [...s.memory, { id: uid('mem_'), text: text.trim(), category, source, createdAt: Date.now() }].slice(-80) }));
      },
      removeMemory: (id) => set((s) => ({ memory: s.memory.filter((m) => m.id !== id) })),
      setInsight: (i) => set({ insight: i }),
      clearChat: () => set({ messages: [], summary: '', summarizedUntil: 0 }),
      reset: () => set({ messages: [], summary: '', summarizedUntil: 0, memory: [], insight: null, rejected: [] }),
    }),
    persistOptions<CoachState>('coach', 1, (s) => ({ messages: s.messages, summary: s.summary, summarizedUntil: s.summarizedUntil, memory: s.memory, insight: s.insight, rejected: s.rejected }) as CoachState),
  ),
);
