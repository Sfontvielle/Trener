import type { FoodEntry, WorkoutSession } from '@/types';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useBody } from '@/stores/body';
import { useCheckins } from '@/stores/checkins';
import { useNutrition } from '@/stores/nutrition';
import { getExercise } from '@/data/exercises';
import { LOCAL_FOODS } from '@/data/foods';
import { macrosFor } from '@/features/nutrition/status';
import { addDays, parseISODate, today, weekdayIndex } from '@/utils/date';
import { uid } from '@/utils/id';

/**
 * ДЕМО-ДАННЫЕ для проверки экранов (Прогресс, тренды, прогрессия).
 * Вызываются только вручную из профиля с явным предупреждением. Все значения вымышленные.
 */
export function seedDemoData(days = 28) {
  const profile = useProfile.getState().profile;
  const plan = usePlan.getState().plan;
  if (!profile || !plan) return;
  const d0 = today();
  let rnd = 42;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  // Вес: тренд в сторону цели + шум
  const dir = profile.goal === 'bulk' ? 1 : profile.goal === 'cut' ? -1 : 0;
  const start = profile.weightKg - dir * 0.25 * (days / 7);
  for (let i = days; i >= 1; i--) {
    if (rand() < 0.35) continue;
    const kg = Math.round((start + dir * 0.25 * ((days - i) / 7) + (rand() - 0.5) * 1.1) * 10) / 10;
    useBody.getState().addWeight(addDays(d0, -i), kg);
  }

  // Чек-ины
  for (let i = days; i >= 1; i--) {
    if (rand() < 0.3) continue;
    useCheckins.getState().save({
      date: addDays(d0, -i),
      sleepHours: Math.round((6 + rand() * 2.5) * 4) / 4,
      sleepQuality: (2 + Math.floor(rand() * 3)) as 2 | 3 | 4,
      energy: (2 + Math.floor(rand() * 3)) as 2 | 3 | 4,
      stress: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3,
      soreness: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3,
      pain: false,
      createdAt: Date.now(),
    });
  }

  // Тренировки по расписанию с постепенной прогрессией
  const sessions: WorkoutSession[] = [];
  const baseW: Record<string, number> = {};
  let rot = 0;
  for (let i = days; i >= 1; i--) {
    const date = addDays(d0, -i);
    if (!plan.schedule[weekdayIndex(date)] || rand() < 0.12) continue;
    const t = plan.templates.find((x) => x.id === plan.rotation[rot % plan.rotation.length])!;
    rot++;
    const start = parseISODate(date).getTime() + 18 * 3600000;
    const exercises = t.exercises.map((pe) => {
      const ex = getExercise(pe.exerciseId)!;
      if (baseW[ex.id] === undefined) baseW[ex.id] = ex.bodyweight ? 0 : ex.mechanic === 'compound' ? (ex.tier === 1 ? 60 : 30) : 12;
      const w = ex.bodyweight ? 0 : Math.round((baseW[ex.id] + ex.increment * Math.floor((days - i) / 9)) / (ex.increment || 1)) * (ex.increment || 1);
      return {
        id: uid('we_'),
        exerciseId: ex.id,
        plannedSets: pe.sets,
        repMin: pe.repMin,
        repMax: pe.repMax,
        targetRir: pe.targetRir,
        restSec: pe.restSec,
        sets: Array.from({ length: pe.sets - (rand() < 0.15 ? 1 : 0) }, () => ({
          id: uid('s_'),
          weight: w,
          reps: pe.repMin + Math.floor(rand() * (pe.repMax - pe.repMin + 1)),
          done: true,
          feel: (rand() < 0.2 ? 'hard' : rand() < 0.5 ? 'ok' : 'easy') as 'hard' | 'ok' | 'easy',
          completedAt: start,
        })),
      };
    });
    sessions.push({ id: uid('ws_'), date, name: t.name, focus: t.focus, source: 'plan', templateId: t.id, startedAt: start, finishedAt: start + (t.estMinutes + Math.round(rand() * 10)) * 60000, exercises, volumeFactor: 1, sessionRpe: 7 + Math.floor(rand() * 2), notes: 'Демо-данные', status: 'completed' });
  }
  useWorkouts.setState((s) => ({ sessions: [...s.sessions, ...sessions] }));

  // Питание: ~цель ±12%
  const target = usePlan.getState().target;
  if (target) {
    const menu = ['local:oats_dry', 'local:cottage_5', 'local:chicken_breast', 'local:rice_cooked', 'local:buckwheat_cooked', 'local:egg', 'local:banana', 'local:greek_yogurt', 'local:olive_oil', 'local:veg_mix'];
    const entries: FoodEntry[] = [];
    for (let i = days; i >= 1; i--) {
      if (rand() < 0.2) continue;
      const date = addDays(d0, -i);
      const k = 0.88 + rand() * 0.24;
      const plan: [string, number][] = [['local:oats_dry', 80], ['local:cottage_5', 180], ['local:chicken_breast', 220], ['local:rice_cooked', 250], ['local:egg', 110], ['local:banana', 120], ['local:olive_oil', 15], ['local:veg_mix', 200], ['local:buckwheat_cooked', 200]];
      const base = plan.reduce((a, [id, g]) => a + (LOCAL_FOODS.find((f) => f.id === id)!.per100.kcal * g) / 100, 0);
      const scale = (target.kcal * k) / base;
      plan.forEach(([id, g], j) => {
        const p = LOCAL_FOODS.find((f) => f.id === id)!;
        const grams = Math.round((g * scale) / 5) * 5;
        entries.push({ id: uid('f_'), date, productId: p.id, name: p.name, grams, macros: macrosFor(p.per100, grams), meal: j < 2 ? 'breakfast' : j < 5 ? 'lunch' : 'dinner', createdAt: Date.now() });
      });
      void menu;
    }
    useNutrition.setState((s) => ({ entries: [...s.entries, ...entries], recent: [...new Set([...s.recent, ...menu])] }));
  }
}
