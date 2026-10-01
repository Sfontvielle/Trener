import type { BodyArea } from '@/types';
import { useProfile } from '@/stores/profile';
import { useCoach } from '@/stores/coach';
import { applyProfile } from '@/features/profile/applyProfile';
import { getExercise } from '@/data/exercises';
import { today } from '@/utils/date';
import { excludeExercise, getPrefs, includeExercise, markDiscomfort, toggleDislike, toggleFavorite } from './engine/prefs';
import { AREA_LABEL } from './engine/restrictions';

/**
 * Действия пользователя над упражнением (из карточки, меню ••• в тренировке, конструктора).
 * Меняют структурированные предпочтения → план перестраивается; важное попадает в память тренера.
 */
function profile() {
  return useProfile.getState().profile;
}
const nameOf = (id: string) => getExercise(id, [])?.name ?? id;

export type ExerciseFlag = 'excluded' | 'favorite' | 'disliked' | null;

export function exerciseFlag(id: string): ExerciseFlag {
  const p = profile();
  if (!p) return null;
  const t = getPrefs(p);
  if (t.excluded.some((e) => e.exerciseId === id)) return 'excluded';
  if (t.preferredExercises.includes(id)) return 'favorite';
  if (t.dislikedExercises.includes(id)) return 'disliked';
  return null;
}

export function prefExclude(id: string): string {
  const p = profile();
  if (!p) return '';
  applyProfile(excludeExercise(p, id));
  return `«${nameOf(id)}» больше не предлагается`;
}

export function prefInclude(id: string): string {
  const p = profile();
  if (!p) return '';
  applyProfile(includeExercise(p, id));
  return `«${nameOf(id)}» снова доступно`;
}

export function prefFavorite(id: string): string {
  const p = profile();
  if (!p) return '';
  const was = getPrefs(p).preferredExercises.includes(id);
  applyProfile(toggleFavorite(p, id));
  return was ? 'Убрано из избранного' : 'В избранном — будет выбираться чаще';
}

export function prefDislike(id: string): string {
  const p = profile();
  if (!p) return '';
  const was = getPrefs(p).dislikedExercises.includes(id);
  applyProfile(toggleDislike(p, id));
  return was ? 'Отметка «не нравится» снята' : 'Учтено: будет только если нет замены';
}

/** Дискомфорт: не назначается автоматически, пока пользователь сам не вернёт упражнение */
export function prefDiscomfort(id: string, area?: BodyArea, note?: string): string {
  const p = profile();
  if (!p) return '';
  applyProfile(markDiscomfort(p, id, area, note));
  useCoach.getState().addMemory(`${today()}: дискомфорт${area ? ` (${AREA_LABEL[area].toLowerCase()})` : ''} в упражнении «${nameOf(id)}»${note ? ` — ${note}` : ''}`, 'injury', 'user');
  return 'Упражнение исключено из автоподбора';
}
