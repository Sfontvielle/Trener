import type { BodyArea, ExcludedExercise, TrainingLimitation, TrainingPreferences, UserProfile } from '@/types';

export const DEFAULT_PREFS: TrainingPreferences = {
  preferredSplit: 'auto',
  preferredExercises: [],
  dislikedExercises: [],
  excluded: [],
  excludedMovements: [],
  limitations: [],
  setStyle: 'auto',
  repStyle: 'auto',
  priorityMuscles: [],
  lowPriorityMuscles: [],
  volumeAdjust: {},
};

/**
 * Нормализует предпочтения профиля (миграция данных v1 → v2 без потерь):
 * старый список avoidExerciseIds превращается в исключения с причиной «user».
 */
export function getPrefs(p: Pick<UserProfile, 'training' | 'avoidExerciseIds'>): TrainingPreferences {
  const t: TrainingPreferences = { ...DEFAULT_PREFS, ...(p.training ?? {}) };
  const excluded: ExcludedExercise[] = [...(t.excluded ?? [])];
  for (const id of p.avoidExerciseIds ?? []) {
    if (!excluded.some((e) => e.exerciseId === id)) excluded.push({ exerciseId: id, reason: 'user', createdAt: 0 });
  }
  return {
    ...t,
    excluded,
    preferredExercises: t.preferredExercises ?? [],
    dislikedExercises: t.dislikedExercises ?? [],
    excludedMovements: t.excludedMovements ?? [],
    limitations: t.limitations ?? [],
    priorityMuscles: t.priorityMuscles ?? [],
    lowPriorityMuscles: t.lowPriorityMuscles ?? [],
    volumeAdjust: t.volumeAdjust ?? {},
  };
}

/** Профиль с обновлёнными предпочтениями; legacy-поле синхронизируется (старые экраны/копии продолжают работать) */
export function withPrefs(p: UserProfile, patch: Partial<TrainingPreferences>): UserProfile {
  const next = { ...getPrefs(p), ...patch };
  return { ...p, training: next, avoidExerciseIds: next.excluded.map((e) => e.exerciseId) };
}

export function excludedIds(t: TrainingPreferences): Set<string> {
  return new Set(t.excluded.map((e) => e.exerciseId));
}

export function severeAreas(t: TrainingPreferences): BodyArea[] {
  return t.limitations.filter((l) => l.severity === 'severe').map((l) => l.area);
}

export function limitationFor(t: TrainingPreferences, area: BodyArea): TrainingLimitation | undefined {
  return t.limitations.find((l) => l.area === area);
}

// ── Действия над предпочтениями (чистые функции: профиль → новый профиль) ──

const without = (list: string[], id: string) => list.filter((x) => x !== id);

/** «Не предлагать больше» / «Дискомфорт при выполнении» / запрет специалиста */
export function excludeExercise(p: UserProfile, exerciseId: string, reason: ExcludedExercise['reason'] = 'user', extra: { area?: BodyArea; note?: string } = {}): UserProfile {
  const t = getPrefs(p);
  const excluded = [...t.excluded.filter((e) => e.exerciseId !== exerciseId), { exerciseId, reason, ...extra, createdAt: Date.now() }];
  return withPrefs(p, { excluded, preferredExercises: without(t.preferredExercises, exerciseId) });
}

/** Вернуть упражнение в программу */
export function includeExercise(p: UserProfile, exerciseId: string): UserProfile {
  const t = getPrefs(p);
  return withPrefs(p, { excluded: t.excluded.filter((e) => e.exerciseId !== exerciseId) });
}

/** Избранное: выше в скоринге. Снимает «не нравится» и исключение */
export function toggleFavorite(p: UserProfile, exerciseId: string): UserProfile {
  const t = getPrefs(p);
  if (t.preferredExercises.includes(exerciseId)) return withPrefs(p, { preferredExercises: without(t.preferredExercises, exerciseId) });
  return withPrefs(p, {
    preferredExercises: [...t.preferredExercises, exerciseId],
    dislikedExercises: without(t.dislikedExercises, exerciseId),
    excluded: t.excluded.filter((e) => e.exerciseId !== exerciseId),
  });
}

/** «Мне не нравится»: сильный штраф, но упражнение может появиться, если замены нет */
export function toggleDislike(p: UserProfile, exerciseId: string): UserProfile {
  const t = getPrefs(p);
  if (t.dislikedExercises.includes(exerciseId)) return withPrefs(p, { dislikedExercises: without(t.dislikedExercises, exerciseId) });
  return withPrefs(p, { dislikedExercises: [...t.dislikedExercises, exerciseId], preferredExercises: without(t.preferredExercises, exerciseId) });
}

/** Дискомфорт при выполнении: упражнение больше не назначается автоматически, пока пользователь не вернёт его */
export function markDiscomfort(p: UserProfile, exerciseId: string, area?: BodyArea, note?: string): UserProfile {
  return excludeExercise(p, exerciseId, 'discomfort', { area, note });
}

export function upsertLimitation(p: UserProfile, l: TrainingLimitation): UserProfile {
  const t = getPrefs(p);
  const rest = t.limitations.filter((x) => x.id !== l.id);
  return withPrefs(p, { limitations: [...rest, l] });
}

export function removeLimitation(p: UserProfile, id: string): UserProfile {
  const t = getPrefs(p);
  return withPrefs(p, { limitations: t.limitations.filter((x) => x.id !== id) });
}
