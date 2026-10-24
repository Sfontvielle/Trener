import type { DayOverride, ISODate, WorkoutSession } from '@/types';
import { addDays, formatDayShort, weekdayIndex, WEEKDAYS_SHORT } from '@/utils/date';

/**
 * Меню «+» на вкладке «Тренировки»: запланировать тренировку на день и повторить прошлую.
 * Планирование — это тот же DayOverride, что использует перенос дня тренером: календарь недели,
 * «Сегодня» и напоминания подхватывают его без отдельной логики.
 */

/** Прошлые тренировки для «Повторить»: последние выполненные, по одной на название, новые первыми */
export function recentRepeatable(sessions: WorkoutSession[], limit = 8): WorkoutSession[] {
  const seen = new Set<string>();
  const out: WorkoutSession[] = [];
  for (const s of [...sessions].filter((x) => x.status === 'completed' && x.exercises.length > 0).sort((a, b) => b.startedAt - a.startedAt)) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Дни, на которые можно запланировать: сегодня и ещё n−1 дней вперёд */
export function planningDays(from: ISODate, n = 14): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}

export function planningDayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Сегодня';
  if (date === addDays(today, 1)) return 'Завтра';
  return `${WEEKDAYS_SHORT[weekdayIndex(date)]}, ${formatDayShort(date)}`;
}

/** Запланировать шаблон плана на дату (заменяет то, что было на этот день) */
export function scheduleOverride(date: ISODate, templateId: string, now = Date.now()): DayOverride {
  return { date, templateId, mode: 'normal', reason: 'Запланировано вручную', source: 'user', createdAt: now };
}
