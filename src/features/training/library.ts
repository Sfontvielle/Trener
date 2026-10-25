import type { Exercise, ISODate, MuscleGroup, PlannedWorkout, WorkoutSession, WorkoutTemplate } from '@/types';
import { getExercise } from '@/data/exercises';
import { addDays, startOfWeek } from '@/utils/date';
import { weekTitle } from './journal';

/**
 * Вкладка «Тренировки» — один список (эталон 02_other_sections): текущая (идёт сейчас), ближайшие (запланированные)
 * и вся история — без обрезки и без склейки одинаковых названий. Фильтры: даты, группы мышц, статус.
 * Чистые функции: хранилища передают данные, интерфейс только рисует.
 */

export type ItemStatus = 'active' | 'planned' | 'done' | 'skipped' | 'missed';

export interface ListItem {
  key: string;
  /** program — день программы по ротации (без отдельной записи); planned — запланированная вручную */
  kind: 'active' | 'planned' | 'session' | 'program';
  date: ISODate;
  title: string;
  status: ItemStatus;
  /** Основные группы мышц тренировки — для фильтра и подписи */
  groups: MuscleGroup[];
  exercises: number;
  session?: WorkoutSession;
  planned?: PlannedWorkout;
  template?: WorkoutTemplate;
}

export interface Sections {
  current: ListItem[];
  upcoming: ListItem[];
  history: ListItem[];
}

/** Статус запланированной: отмеченное человеком — как есть; просроченная без отметки — «пропущено» (только показ) */
export function plannedStatus(p: PlannedWorkout, today: ISODate): Exclude<ItemStatus, 'active'> {
  if (p.status === 'done') return 'done';
  if (p.status === 'skipped') return 'skipped';
  return p.date < today ? 'missed' : 'planned';
}

/** Группы мышц по основным мышцам упражнений, по убыванию числа упражнений */
export function groupsOf(exerciseIds: string[], customs: Exercise[] = []): MuscleGroup[] {
  const n = new Map<MuscleGroup, number>();
  for (const id of exerciseIds) for (const g of getExercise(id, customs)?.groups.primary ?? []) n.set(g, (n.get(g) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

/**
 * Какая запланированная тренировка закрыта завершённой сессией: та же дата и тот же шаблон (или то же название).
 * Нет такой — план остаётся как был (сессия просто попадает в историю).
 */
export function matchPlanned(planned: PlannedWorkout[], s: WorkoutSession): PlannedWorkout | undefined {
  const open = planned.filter((p) => p.status === 'planned' && p.date === s.date);
  return open.find((p) => !!p.templateId && p.templateId === s.templateId) ?? open.find((p) => p.name.trim().toLowerCase() === s.name.trim().toLowerCase());
}

export function trainingSections(args: { sessions: WorkoutSession[]; planned: PlannedWorkout[]; active: WorkoutSession | null; today: ISODate; customs?: Exercise[] }): Sections {
  const { sessions, planned, active, today, customs = [] } = args;
  const current: ListItem[] = active
    ? [{ key: `a:${active.id}`, kind: 'active', date: active.date, title: active.name, status: 'active', groups: groupsOf(active.exercises.map((e) => e.exerciseId), customs), exercises: active.exercises.length, session: active }]
    : [];
  const toItem = (p: PlannedWorkout): ListItem => ({
    key: `p:${p.id}`,
    kind: 'planned',
    date: p.date,
    title: p.name,
    status: plannedStatus(p, today),
    groups: groupsOf(p.exercises.map((e) => e.exerciseId), customs),
    exercises: p.exercises.length,
    planned: p,
  });
  const upcoming = planned
    .filter((p) => p.status === 'planned' && p.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map(toItem);
  // История: все завершённые (каждая — отдельной строкой) + просроченные/пропущенные планы; новые сверху
  const done: ListItem[] = sessions
    .filter((s) => s.status === 'completed')
    .map((s) => ({ key: `s:${s.id}`, kind: 'session' as const, date: s.date, title: s.name, status: 'done' as const, groups: groupsOf(s.exercises.map((e) => e.exerciseId), customs), exercises: s.exercises.length, session: s }));
  const missed = planned.filter((p) => p.status === 'skipped' || (p.status === 'planned' && p.date < today)).map(toItem);
  const history = [...done, ...missed].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.session?.startedAt ?? b.planned?.createdAt ?? 0) - (a.session?.startedAt ?? a.planned?.createdAt ?? 0);
  });
  return { current, upcoming, history };
}

export interface ListFilter {
  from?: ISODate;
  to?: ISODate;
  /** Хотя бы одна из групп среди основных */
  groups?: MuscleGroup[];
  status?: 'all' | 'done' | 'missed';
}

export function applyFilter(items: ListItem[], f: ListFilter): ListItem[] {
  return items.filter((it) => {
    if (f.from && it.date < f.from) return false;
    if (f.to && it.date > f.to) return false;
    if (f.groups?.length && !it.groups.some((g) => f.groups!.includes(g))) return false;
    if (f.status === 'done' && it.status !== 'done') return false;
    if (f.status === 'missed' && it.status !== 'missed' && it.status !== 'skipped') return false;
    return true;
  });
}

export const filterActive = (f: ListFilter) => !!(f.from || f.to || f.groups?.length || (f.status && f.status !== 'all'));

/**
 * «Сегодня» и «Ближайшие»: запланированные вручную + дни программы на horizon дней вперёд (ротация плана).
 * Тренировка программы, поставленная на день вручную, уже есть среди запланированных — второй раз не выводится.
 */
export function upcomingWithProgram(args: {
  upcoming: ListItem[];
  agenda: { date: ISODate; status: string; template?: WorkoutTemplate }[];
  today: ISODate;
  horizon?: number;
  customs?: Exercise[];
}): { today: ListItem[]; next: ListItem[] } {
  const { upcoming, agenda, today, horizon = 7, customs = [] } = args;
  const last = addDays(today, horizon - 1);
  const program: ListItem[] = agenda
    .filter((d) => (d.status === 'today' || d.status === 'planned') && d.template && d.date >= today && d.date <= last)
    .filter((d) => !upcoming.some((u) => u.date === d.date && u.planned?.source === 'plan' && u.planned.templateId === d.template!.id))
    .map((d) => ({
      key: `g:${d.date}`,
      kind: 'program' as const,
      date: d.date,
      title: d.template!.name,
      status: 'planned' as const,
      groups: groupsOf(d.template!.exercises.map((e) => e.exerciseId), customs),
      exercises: d.template!.exercises.length,
      template: d.template,
    }));
  const all = [...upcoming, ...program].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? 0 : a.kind === 'program' ? -1 : 1));
  return { today: all.filter((x) => x.date === today), next: all.filter((x) => x.date > today) };
}

/** История по неделям (понедельник — начало), новые недели сверху; порядок внутри недели сохраняется */
export function groupByWeek(items: ListItem[], ref: ISODate): { weekStart: ISODate; title: string; items: ListItem[] }[] {
  const out: { weekStart: ISODate; title: string; items: ListItem[] }[] = [];
  const byWeek = new Map<ISODate, ListItem[]>();
  for (const it of items) {
    const w = startOfWeek(it.date);
    let arr = byWeek.get(w);
    if (!arr) {
      arr = [];
      byWeek.set(w, arr);
      out.push({ weekStart: w, title: weekTitle(w, ref), items: arr });
    }
    arr.push(it);
  }
  return out.sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

/** Период фильтра: последние 7/30/90/365 дней или конкретный месяц «m:2026-09» */
export type Period = 'all' | 'week' | 'month' | 'quarter' | 'year' | `m:${string}`;

export function periodRange(p: Period, today: ISODate): { from?: ISODate; to?: ISODate } {
  if (p === 'all') return {};
  if (p.startsWith('m:')) {
    const ym = p.slice(2);
    const [y, m] = ym.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { from: `${ym}-01`, to: addDays(next, -1) };
  }
  const days = p === 'week' ? 7 : p === 'month' ? 30 : p === 'quarter' ? 90 : 365;
  return { from: addDays(today, -(days - 1)), to: today };
}
