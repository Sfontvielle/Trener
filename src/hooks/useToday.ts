import { useMemo } from 'react';
import { useCheckins } from '@/stores/checkins';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useNutrition } from '@/stores/nutrition';
import { useHealth } from '@/stores/health';
import { readinessFor } from '@/features/recovery/derive';
import { resolveToday } from '@/features/training/today';
import { remaining, sumMacros } from '@/features/nutrition/status';
import { today } from '@/utils/date';
import { useDayKey } from './useDayKey';

export function useReadiness(date?: string) {
  const dayKey = useDayKey();
  const d = date ?? dayKey;
  const checkins = useCheckins((s) => s.byDate);
  const sessions = useWorkouts((s) => s.sessions);
  const health = useHealth((s) => s.days);
  return useMemo(() => readinessFor(d, checkins, sessions, health), [d, checkins, sessions, health]);
}

export function useTodayWorkout() {
  const d = useDayKey();
  const plan = usePlan((s) => s.plan);
  const override = usePlan((s) => s.overrides[d]);
  const sessions = useWorkouts((s) => s.sessions);
  const readiness = useReadiness(d);
  return useMemo(() => resolveToday({ date: d, plan, sessions, override, readiness }), [d, plan, sessions, override, readiness]);
}

export function useDayNutrition(date?: string) {
  const dayKey = useDayKey();
  const d = date ?? dayKey;
  const all = useNutrition((s) => s.entries);
  const target = usePlan((s) => s.target);
  return useMemo(() => {
    const entries = all.filter((e) => e.date === d).sort((a, b) => a.createdAt - b.createdAt);
    const eaten = sumMacros(entries);
    const rem = target ? remaining(target, eaten) : null;
    return { date: d, entries, eaten, target, remaining: rem };
  }, [all, d, target]);
}

export { today };
