import { AppState, Platform } from 'react-native';
import { useWorkouts } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { getExercise } from '@/data/exercises';
import { isTimed } from '@/features/training/journal';
import { workoutActivityProps, type WorkoutActivityProps } from '@/features/training/liveActivity';
import { createActivitySync, type ActivityFactory } from '@/features/training/liveActivitySync';

/**
 * Live Activity активной тренировки (ActivityKit через expo-widgets, SDK 58).
 * Источник правды — только useWorkouts: старт, подходы, переходы, суперсеты, отдых, завершение и отмена
 * отражаются автоматически, своей истории здесь нет. Работает офлайн: обновляет само приложение, без push.
 * Если Live Activities выключены пользователем, не поддерживаются устройством или модуля нет (Expo Go, web) —
 * всё молча пропускается, тренировка работает как обычно.
 */

/** Тап по Live Activity открывает активную тренировку (схема из app.json) */
export const ACTIVITY_URL = 'form://workout/active';

type Mod = { factory: ActivityFactory; after: (d: Date) => unknown };
let mod: Mod | null | undefined;
function load(): Mod | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'ios') return (mod = null);
  try {
    // Нативного модуля нет в Expo Go — require бросит, и функция просто выключится
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const w = require('expo-widgets') as { after: (d: Date) => unknown };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const factory = (require('@/widgets/WorkoutActivity') as { default: ActivityFactory }).default;
    mod = { factory, after: w.after };
  } catch {
    mod = null;
  }
  return mod;
}

function currentProps(): WorkoutActivityProps | null {
  const { active, rest, customExercises } = useWorkouts.getState();
  if (!active) return null;
  return workoutActivityProps(active, {
    nameOf: (id) => getExercise(id, customExercises)?.name ?? '',
    isTimed: (id) => isTimed(getExercise(id, customExercises)),
    isBodyweight: (id) => !!getExercise(id, customExercises)?.bodyweight,
    unit: useProfile.getState().settings.weightUnit,
    rest: rest ? { startedAt: rest.startedAt, endsAt: rest.endsAt } : null,
  });
}

let started = false;
/** Запускается один раз после загрузки данных: подписка на тренировку и согласование при каждом возвращении в приложение */
export function startWorkoutActivitySync(): void {
  const m = load();
  if (started || !m) return;
  started = true;
  const core = createActivitySync({
    factory: m.factory,
    after: m.after,
    props: currentProps,
    isFinished: (id) => useWorkouts.getState().sessions.some((x) => x.id === id),
    url: ACTIVITY_URL,
  });
  // Изменения идут по очереди: каждое следующее согласование видит результат предыдущего
  let busy: Promise<void> = Promise.resolve();
  const queue = () => {
    busy = busy.then(core.sync).catch(() => undefined);
  };
  // После перезапуска: активная тренировка — обновить (или запустить) одну активность; нет тренировки — закрыть «висящие»
  queue();
  useWorkouts.subscribe((s, prev) => {
    if (s.active !== prev.active || s.rest !== prev.rest) queue();
  });
  useProfile.subscribe((s, prev) => {
    if (s.settings.weightUnit !== prev.settings.weightUnit) queue();
  });
  AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    core.resume();
    queue();
  });
}
