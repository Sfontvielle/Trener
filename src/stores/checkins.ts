import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyCheckIn, ISODate } from '@/types';
import { persistOptions } from '@/storage/persist';

/**
 * v1 → v2: сон хранится в минутах (sleepMinutes) с источником; sleepHours остаётся для совместимости.
 * Чистая функция — покрыта тестом.
 */
export function migrateCheckins(persisted: unknown, fromVersion: number): { byDate: Record<ISODate, DailyCheckIn> } {
  const st = (persisted ?? {}) as { byDate?: Record<ISODate, DailyCheckIn> };
  const byDate: Record<ISODate, DailyCheckIn> = {};
  for (const [k, c] of Object.entries(st.byDate ?? {})) {
    if (!c || typeof c.sleepHours !== 'number') continue;
    byDate[k] = fromVersion < 2 && c.sleepMinutes === undefined ? { ...c, sleepMinutes: Math.round(c.sleepHours * 60), sleepSource: c.sleepSource ?? 'manual' } : c;
  }
  return { byDate };
}

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
    persistOptions<CheckinState>('checkins', 2, (s) => ({ byDate: s.byDate }) as CheckinState, (p, v) => migrateCheckins(p, v) as CheckinState),
  ),
);
