import type { DayOverride, ISODate, WorkoutSession } from '@/types';
import { addDays, formatDayShort, weekdayIndex, WEEKDAYS_SHORT } from '@/utils/date';

/**
 * Меню «+» на вкладке «Тренировки»: запланировать тренировку на день и повторить прошлую.
 * Запланированное хранится в useSchedule; тренировка программы дополнительно ставится тем же DayOverride, что
 * использует перенос дня тренером: календарь недели, «Сегодня» и напоминания подхватывают её без отдельной логики.
 */

/**
 * Прошлые тренировки для «Повторить» и «Запланировать повтор»: все выполненные, новые первыми. Без обрезки и без
 * склейки одинаковых названий — «Верх А» от 3 и от 10 октября разные тренировки (веса, состав).
 */
export function repeatableSessions(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((x) => x.status === 'completed' && x.exercises.length > 0).sort((a, b) => b.startedAt - a.startedAt);
}

/** Дни, на которые можно запланировать: сегодня и ещё n−1 дней вперёд */
export function planningDays(from: ISODate, n = 28): ISODate[] {
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
