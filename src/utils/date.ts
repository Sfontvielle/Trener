import type { ISODate } from '@/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date = new Date()): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);
}

/** 0 = понедельник … 6 = воскресенье */
export function weekdayIndex(s: ISODate): number {
  return (parseISODate(s).getDay() + 6) % 7;
}

export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, -weekdayIndex(s));
}

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatDayLong(s: ISODate): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function formatDayShort(s: ISODate): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function relativeDay(s: ISODate, ref: ISODate = today()): string {
  const diff = daysBetween(s, ref);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  if (diff > 1 && diff < 7) return `${diff} ${plural(diff, 'день', 'дня', 'дней')} назад`;
  return formatDayShort(s);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(r)}`;
  return `${pad(m)}:${pad(r)}`;
}

export function formatHours(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/** «7 ч 43 мин» из минут */
export function formatSleep(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${hh} ч ${mm} мин` : `${hh} ч`;
}
