import { useEffect, useState } from 'react';
import { useProfile } from './profile';
import { usePlan } from './plan';
import { useCheckins } from './checkins';
import { useBody } from './body';
import { useNutrition } from './nutrition';
import { useWorkouts } from './workouts';
import { useCoach } from './coach';

const STORES = [useProfile, usePlan, useCheckins, useBody, useNutrition, useWorkouts, useCoach];

/** true, когда все сторы восстановлены из локального хранилища */
export function useHydrated(): boolean {
  const [ok, setOk] = useState(() => STORES.every((s) => s.persist.hasHydrated()));
  useEffect(() => {
    if (ok) return;
    const check = () => {
      if (STORES.every((s) => s.persist.hasHydrated())) setOk(true);
    };
    const unsubs = STORES.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => unsubs.forEach((u) => u());
  }, [ok]);
  return ok;
}

export async function resetAllStores(): Promise<void> {
  useProfile.getState().reset();
  usePlan.getState().reset();
  useCheckins.getState().reset();
  useBody.getState().reset();
  useNutrition.getState().reset();
  useWorkouts.getState().reset();
  useCoach.getState().reset();
}
