import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HealthDay } from '@/features/health/model';
import { mergeHealthDays } from '@/features/health/model';
import { persistOptions } from '@/storage/persist';

interface HealthState {
  /** Пользователь включил интеграцию (разрешения мог дать не на всё) */
  enabled: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  days: Record<string, HealthDay>;
  setEnabled: (v: boolean) => void;
  applySync: (days: HealthDay[], at: number) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useHealth = create<HealthState>()(
  persist(
    (set) => ({
      enabled: false,
      lastSyncAt: null,
      lastError: null,
      days: {},
      setEnabled: (v) => set({ enabled: v }),
      applySync: (days, at) => set((s) => ({ days: mergeHealthDays(s.days, days), lastSyncAt: at, lastError: null })),
      setError: (e) => set({ lastError: e }),
      reset: () => set({ enabled: false, lastSyncAt: null, lastError: null, days: {} }),
    }),
    persistOptions<HealthState>('health', 1, (s) => ({ enabled: s.enabled, lastSyncAt: s.lastSyncAt, days: s.days }) as HealthState),
  ),
);
