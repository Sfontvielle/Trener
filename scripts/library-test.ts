import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlannedWorkout, WorkoutSession } from '../src/types';
import { applyFilter, filterActive, groupByWeek, groupsOf, matchPlanned, periodRange, plannedStatus, trainingSections, upcomingWithProgram } from '../src/features/training/library';
import { afterSetTarget, linkWithNext, supersetLabels, supersetMembers } from '../src/features/training/workoutNav';
import { repeatPlanned } from '../src/features/training/journal';
import { useSchedule } from '../src/stores/schedule';

const session = (id: string, date: string, name: string, exerciseIds: string[], extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id,
  date,
  name,
  focus: '',
  source: 'custom',
  startedAt: Date.parse(`${date}T18:00:00`),
  finishedAt: Date.parse(`${date}T19:00:00`),
  exercises: exerciseIds.map((exerciseId, i) => ({ id: `${id}-${i}`, exerciseId, plannedSets: 3, repMin: 8, repMax: 10, targetRir: 2, restSec: 90, sets: [{ id: `${id}-${i}-s`, weight: 50, reps: 10, done: true }] })),
  volumeFactor: 1,
  status: 'completed',
  ...extra,
});
const planned = (id: string, date: string, name: string, extra: Partial<PlannedWorkout> = {}): PlannedWorkout => ({
  id,
  date,
  name,
  source: 'custom',
  exercises: [{ exerciseId: 'squat', sets: 3, repMin: 6, repMax: 8, targetRir: 2, restSec: 120 }],
  status: 'planned',
  createdAt: 1,
  ...extra,
});

test('Тренировки: один список — текущая, ближайшие, вся история без обрезки и без склейки одинаковых названий', () => {
  const sessions = Array.from({ length: 240 }, (_, i) => session(`s${i}`, `2026-0${1 + Math.floor(i / 31) % 9}-${String((i % 28) + 1).padStart(2, '0')}`, i % 2 ? 'Верх А' : 'Низ Б', ['bench_press']));
  const plans = [planned('p1', '2026-10-27', 'Ноги'), planned('p2', '2026-10-20', 'Спина'), planned('p3', '2026-10-26', 'Плечи', { status: 'skipped' })];
  const active = session('a1', '2026-10-25', 'Сейчас', ['bench_press'], { status: 'active' });
  const s = trainingSections({ sessions, planned: plans, active, today: '2026-10-25' });
  assert.equal(s.current.length, 1);
  assert.equal(s.current[0].status, 'active');
  assert.deepEqual(s.upcoming.map((x) => x.planned!.id), ['p1'], 'ближайшие — только будущие запланированные');
  assert.equal(s.history.filter((x) => x.kind === 'session').length, 240, 'все 240 тренировок, одинаковые названия не склеены');
  assert.ok(s.history.some((x) => x.planned?.id === 'p2' && x.status === 'missed'), 'просроченный план — «пропущено»');
  assert.ok(s.history.some((x) => x.planned?.id === 'p3' && x.status === 'skipped'), 'отмеченный пропуск');
  for (let i = 1; i < s.history.length; i++) assert.ok(s.history[i - 1].date >= s.history[i].date, 'новые сверху');
});

test('Тренировки: статусы планов — запланировано / выполнено / пропущено; просрочка не меняет запись', () => {
  const p = planned('p', '2026-10-20', 'Спина');
  assert.equal(plannedStatus(p, '2026-10-19'), 'planned');
  assert.equal(plannedStatus(p, '2026-10-21'), 'missed');
  assert.equal(p.status, 'planned', 'хранимый статус не тронут');
  assert.equal(plannedStatus({ ...p, status: 'done' }, '2026-10-21'), 'done');
  assert.equal(plannedStatus({ ...p, status: 'skipped' }, '2026-10-19'), 'skipped');
});

test('Тренировки: завершённая сессия закрывает план той же даты — по шаблону, иначе по названию', () => {
  const plans = [planned('a', '2026-10-25', 'Верх А', { templateId: 't1' }), planned('b', '2026-10-25', 'Ноги'), planned('c', '2026-10-26', 'Ноги')];
  assert.equal(matchPlanned(plans, session('x', '2026-10-25', 'Что угодно', [], { templateId: 't1' }))?.id, 'a');
  assert.equal(matchPlanned(plans, session('y', '2026-10-25', ' ноги ', []))?.id, 'b');
  assert.equal(matchPlanned(plans, session('z', '2026-10-24', 'Ноги', [])), undefined, 'другая дата — план не трогаем');
  assert.equal(matchPlanned([{ ...plans[1], status: 'done' }], session('w', '2026-10-25', 'Ноги', [])), undefined, 'выполненный повторно не закрывается');
});

test('Тренировки: фильтры по датам, группам мышц и статусу', () => {
  const sessions = [session('s1', '2026-10-01', 'Грудь', ['bench_press']), session('s2', '2026-10-10', 'Ноги', ['back_squat']), session('s3', '2026-10-20', 'Спина', ['lat_pulldown'])];
  const { history } = trainingSections({ sessions, planned: [planned('m', '2026-10-15', 'Плечи')], active: null, today: '2026-10-25' });
  assert.deepEqual(applyFilter(history, { from: '2026-10-05', to: '2026-10-18' }).map((x) => x.title), ['Плечи', 'Ноги']);
  assert.deepEqual(applyFilter(history, { groups: ['chest'] }).map((x) => x.title), ['Грудь']);
  assert.deepEqual(applyFilter(history, { groups: ['quads', 'back'] }).map((x) => x.title).sort(), ['Ноги', 'Спина']);
  assert.deepEqual(applyFilter(history, { status: 'missed' }).map((x) => x.title), ['Плечи']);
  assert.equal(applyFilter(history, { status: 'done' }).length, 3);
  assert.equal(filterActive({}), false);
  assert.equal(filterActive({ status: 'all' }), false);
  assert.equal(filterActive({ groups: ['chest'] }), true);
  assert.deepEqual(groupsOf(['bench_press', 'db_curl']).slice(0, 1), ['chest']);
});

test('Тренировки: «Сегодня» и «Ближайшие» — свои планы и дни программы без дублей', () => {
  const tpl = (id: string, name: string) => ({ id, name, focus: '', exercises: [{ exerciseId: 'bench_press', sets: 3, repMin: 8, repMax: 10, targetRir: 2, restSec: 90 }], estMinutes: 50 }) as never;
  const plans = [planned('p1', '2026-10-25', 'Своя'), planned('p2', '2026-10-27', 'Верх А', { source: 'plan', templateId: 'tA' }), planned('p3', '2026-11-20', 'Далёкая')];
  const { upcoming } = trainingSections({ sessions: [], planned: plans, active: null, today: '2026-10-25' });
  const agenda = [
    { date: '2026-10-25', status: 'today', template: tpl('tB', 'Низ Б') },
    { date: '2026-10-27', status: 'planned', template: tpl('tA', 'Верх А') },
    { date: '2026-10-29', status: 'planned', template: tpl('tC', 'Спина') },
    { date: '2026-11-05', status: 'planned', template: tpl('tB', 'Низ Б') },
    { date: '2026-10-24', status: 'missed', template: tpl('tC', 'Спина') },
  ];
  const r = upcomingWithProgram({ upcoming, agenda, today: '2026-10-25' });
  assert.deepEqual(r.today.map((x) => `${x.kind}:${x.title}`), ['program:Низ Б', 'planned:Своя'], 'сегодня — день программы и своя');
  assert.deepEqual(r.next.map((x) => `${x.kind}:${x.title}`), ['planned:Верх А', 'program:Спина', 'planned:Далёкая'], 'Верх А вручную — без дубля; программа на 7 дней; свои — все');
});

test('Тренировки: история по неделям и период фильтра', () => {
  const sessions = [session('a', '2026-10-21', 'Ср', ['bench_press']), session('b', '2026-10-19', 'Пн', ['bench_press']), session('c', '2026-10-12', 'Прошлая', ['bench_press']), session('d', '2025-12-30', 'Год назад', ['bench_press'])];
  const { history } = trainingSections({ sessions, planned: [], active: null, today: '2026-10-25' });
  const weeks = groupByWeek(history, '2026-10-25');
  assert.deepEqual(weeks.slice(0, 2).map((w) => w.title), ['Эта неделя', 'Прошлая неделя']);
  assert.equal(weeks[2].items[0].title, 'Год назад', 'неделя на стыке лет — одной группой');
  assert.deepEqual(weeks[0].items.map((x) => x.title), ['Ср', 'Пн']);
  assert.equal(weeks.length, 3);
  assert.deepEqual(periodRange('week', '2026-10-25'), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(periodRange('m:2026-09', '2026-10-25'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(periodRange('m:2025-12', '2026-10-25'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(periodRange('all', '2026-10-25'), {});
  assert.deepEqual(applyFilter(history, periodRange('m:2025-12', '2026-10-25')).map((x) => x.title), ['Год назад']);
});

test('Трисет и круг: 3–4 упражнения по кругу A1 → A2 → A3 → отдых → A1; повтор сохраняет круг', () => {
  const ex = (id: string) => ({ exerciseId: id, sets: 2, repMin: 8, repMax: 12, targetRir: 2, restSec: 60 });
  let list = [ex('bench_press'), ex('barbell_row'), ex('lateral_raise'), ex('plank')];
  list = linkWithNext(linkWithNext(list, 0), 1);
  assert.deepEqual(supersetLabels(list), ['A1', 'A2', 'A3', undefined], 'трисет');
  assert.deepEqual(supersetMembers(list, 1), [0, 1, 2]);
  const circuit = linkWithNext(list, 2);
  assert.deepEqual(supersetLabels(circuit), ['A1', 'A2', 'A3', 'A4'], 'круг из четырёх');
  // Активная тренировка: после подхода в A3 — отдых и снова A1
  const s = session('t', '2026-10-25', 'Трисет', ['bench_press', 'barbell_row', 'lateral_raise', 'plank'], { status: 'active' });
  s.exercises = s.exercises.map((we, i) => ({ ...we, superset: i < 3 ? 'ss0' : undefined, sets: [{ id: `${i}a`, weight: 20, reps: 10, done: false }, { id: `${i}b`, weight: 20, reps: 10, done: false }] }));
  const mark = (i: number) => (s.exercises[i].sets.find((x) => !x.done)!.done = true);
  mark(0);
  assert.deepEqual(afterSetTarget(s, 0), { index: 1, rest: false });
  mark(1);
  assert.deepEqual(afterSetTarget(s, 1), { index: 2, rest: false });
  mark(2);
  assert.deepEqual(afterSetTarget(s, 2), { index: 0, rest: true }, 'после круга — отдых и к первому');
  s.status = 'completed';
  mark(3);
  const again = repeatPlanned(s);
  assert.deepEqual(supersetLabels(again), ['A1', 'A2', 'A3', undefined], 'повтор сохраняет трисет');
});

test('Запланированные: выполнение закрывает план, перенос/пропуск/возврат, свои шаблоны', () => {
  const st = useSchedule.getState();
  st.reset();
  const ex = [{ exerciseId: 'squat', sets: 3, repMin: 6, repMax: 8, targetRir: 2, restSec: 120 }];
  const a = st.plan({ date: '2026-10-25', name: 'Ноги', source: 'custom', exercises: ex });
  const b = st.plan({ date: '2026-10-26', name: 'Верх А', source: 'plan', templateId: 'tA', exercises: ex });
  ex[0].sets = 9;
  assert.equal(useSchedule.getState().planned[0].exercises[0].sets, 3, 'состав — снимок, не ссылка');
  useSchedule.getState().completeWith(session('x', '2026-10-25', 'ноги', ['squat']));
  assert.equal(useSchedule.getState().planned.find((p) => p.id === a.id)!.status, 'done', 'по дате и названию');
  assert.equal(useSchedule.getState().planned.find((p) => p.id === a.id)!.doneSessionId, 'x');
  useSchedule.getState().move(b.id, '2026-10-28');
  assert.equal(useSchedule.getState().planned.find((p) => p.id === b.id)!.date, '2026-10-28');
  useSchedule.getState().skip(b.id);
  assert.equal(useSchedule.getState().planned.find((p) => p.id === b.id)!.status, 'skipped');
  useSchedule.getState().restore(b.id);
  assert.equal(useSchedule.getState().planned.find((p) => p.id === b.id)!.status, 'planned');
  // Выполнено в другой день по кнопке «Начать» у плана — закрывается по id
  useSchedule.getState().completeWith(session('y', '2026-10-30', 'Что-то другое', ['squat']), b.id);
  assert.equal(useSchedule.getState().planned.find((p) => p.id === b.id)!.status, 'done');
  const t = useSchedule.getState().saveTemplate({ name: '  ', exercises: ex, color: 'blue' });
  assert.equal(t.name, 'Мой шаблон');
  useSchedule.getState().updateTemplate(t.id, { name: 'Верх (любимый)', exercises: [...ex, { ...ex[0], exerciseId: 'bench_press' }] });
  const u = useSchedule.getState().templates[0];
  assert.equal(u.name, 'Верх (любимый)');
  assert.equal(u.exercises.length, 2);
  assert.equal(u.color, 'blue');
  useSchedule.getState().removeTemplate(t.id);
  assert.equal(useSchedule.getState().templates.length, 0);
  useSchedule.getState().reset();
});
