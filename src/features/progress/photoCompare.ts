import type { ISODate } from '@/types';
import { daysBetween } from '@/utils/date';

export interface PhotoLike {
  id: string;
  date: ISODate;
  pose: 'front' | 'side' | 'back';
}

/**
 * Пара для сравнения «месяц назад / сейчас»: последнее фото выбранного ракурса и фото того же ракурса,
 * ближайшее к дате «за 30 дней до него» (не ближе 14 дней; иначе — самое раннее). Ракурс по умолчанию — тот,
 * у которого есть пара с наибольшим разрывом.
 */
export function photoPair<T extends PhotoLike>(photos: T[], pose?: PhotoLike['pose']): { before: T; after: T; days: number; pose: PhotoLike['pose'] } | null {
  const poses: PhotoLike['pose'][] = pose ? [pose] : ['front', 'side', 'back'];
  let best: { before: T; after: T; days: number; pose: PhotoLike['pose'] } | null = null;
  for (const ps of poses) {
    const list = photos.filter((p) => p.pose === ps).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (list.length < 2) continue;
    const after = list[list.length - 1];
    const older = list.filter((p) => daysBetween(p.date, after.date) >= 14);
    const before = older.length ? older.reduce((acc, p) => (Math.abs(daysBetween(p.date, after.date) - 30) < Math.abs(daysBetween(acc.date, after.date) - 30) ? p : acc)) : list[0];
    if (before.id === after.id) continue;
    const days = daysBetween(before.date, after.date);
    if (!best || (!pose && days > best.days)) best = { before, after, days, pose: ps };
  }
  return best;
}
