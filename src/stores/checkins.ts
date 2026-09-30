import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyCheckIn, ISODate } from '@/types';
import { persistOptions } from '@/storage/persist';

interface CheckinState {
  byDate: Record<ISODate, DailyCheckIn>;
  save: (c: DailyCheckIn) => void;
  remove: (date: ISODate) => void;
  reset: () => void;
}

export const useCheckins = create<CheckinState>()(
  persist(
    (set) => ({
      byDate: {},
      save: (c) => set((s) => ({ byDate: { ...s.byDate, [c.date]: c } })),
      remove: (date) =>
        set((s) => {
          const next = { ...s.byDate };
          delete next[date];
          return { byDate: next };
        }),
      reset: () => set({ byDate: {} }),
    }),
    persistOptions<CheckinState>('checkins', 1, (s) => ({ byDate: s.byDate }) as CheckinState),
  ),
);
