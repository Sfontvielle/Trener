import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, UserProfile } from '@/types';
import { persistOptions } from '@/storage/persist';

interface ProfileState {
  profile: UserProfile | null;
  settings: AppSettings;
  setProfile: (p: UserProfile) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: AppSettings = {
  weightUnit: 'kg',
  restTimerAuto: true,
  defaultRestSec: 120,
  haptics: true,
  coachApiUrl: '',
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      settings: DEFAULT_SETTINGS,
      setProfile: (p) => set({ profile: { ...p, updatedAt: Date.now() } }),
      updateSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
      reset: () => set({ profile: null, settings: DEFAULT_SETTINGS }),
    }),
    persistOptions<ProfileState>('profile', 1, (s) => ({ profile: s.profile, settings: s.settings }) as ProfileState),
  ),
);
