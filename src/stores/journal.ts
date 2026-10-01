import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ISODate } from '@/types';
import { persistOptions } from '@/storage/persist';
import { uid } from '@/utils/id';

/** Ручная заметка в дневнике дня (остальные события дневник собирает сам из данных) */
export interface JournalNote {
  id: string;
  date: ISODate;
  at: number;
  text: string;
}

interface JournalState {
  notes: JournalNote[];
  addNote: (date: ISODate, text: string) => void;
  removeNote: (id: string) => void;
  reset: () => void;
}

export const useJournal = create<JournalState>()(
  persist(
    (set) => ({
      notes: [],
      addNote: (date, text) => set((s) => ({ notes: [...s.notes, { id: uid('n_'), date, at: Date.now(), text: text.trim().slice(0, 280) }].slice(-500) })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      reset: () => set({ notes: [] }),
    }),
    persistOptions<JournalState>('journal', 1, (s) => ({ notes: s.notes }) as JournalState),
  ),
);
