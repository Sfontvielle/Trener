/** Календарь: чистые функции для поля выбора даты */
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** «4 октября 2026» */
export function formatDateRu(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  return `${Number(v.slice(8, 10))} ${MONTHS_GEN[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`;
}

/** Сетка месяца: 6 недель, понедельник первым; null — пустая клетка */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

