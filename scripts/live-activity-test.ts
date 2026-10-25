import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExerciseSet, WorkoutExercise, WorkoutSession } from '../src/types';
import { activityKey, planActivity, workoutActivityProps, type ActivityDeps } from '../src/features/training/liveActivity';
import { linkWithNext } from '../src/features/training/workoutNav';

let n = 0;
const set = (weight: number, reps: number, done = false, extra: Partial<ExerciseSet> = {}): ExerciseSet => ({ id: `s${n++}`, weight, reps, done, ...extra });
const we = (exerciseId: string, sets: ExerciseSet[], extra: Partial<WorkoutExercise> = {}): WorkoutExercise => ({ id: `we${n++}`, exerciseId, plannedSets: sets.length, repMin: 6, repMax: 10, targetRir: 2, restSec: 90, sets, ...extra });
const session = (exercises: WorkoutExercise[], extra: Partial<WorkoutSession> = {}): WorkoutSession => ({ id: 'w1', date: '2026-10-24', name: 'Верх А', focus: '', source: 'plan', startedAt: 1_000, volumeFactor: 1, status: 'active', exercises, ...extra }) as WorkoutSession;
const NAMES: Record<string, string> = { bench_press: 'Жим лёжа', lat_pulldown: 'Тяга верхнего блока', plank: 'Планка', push_up: 'Отжимания' };
const deps: ActivityDeps = { nameOf: (id) => NAMES[id] ?? id, isTimed: (id) => id === 'plank', isBodyweight: (id) => id === 'push_up', unit: 'kg', rest: null };

test('Live Activity: текущее упражнение, подход N из M, запланированные вес и повторы', () => {
  const s = session([we('bench_press', [set(60, 8, true), set(62.5, 8), set(62.5, 8)]), we('lat_pulldown', [set(50, 10)])]);
  const p = workoutActivityProps(s, deps);
  assert.equal(p.exercise, 'Жим лёжа');
  assert.equal(p.setText, 'Подход 2 из 3');
  assert.deepEqual([p.setNo, p.setTotal], [2, 3]);
  assert.equal(p.target, '62,5 кг × 8');
  assert.equal(p.timed, false);
  assert.deepEqual([p.exerciseNo, p.exerciseTotal], [1, 2]);
  assert.equal(p.progress, 0.25);
  assert.equal(p.startedAt, 1_000);
  assert.equal(p.next, '', 'пока упражнение не закончено — без «далее»');
});

test('Live Activity: разминка не считается рабочим подходом; упражнение выполнено → «далее»', () => {
  const warm = session([we('bench_press', [set(40, 8, false, { warmup: true }), set(60, 8)]), we('lat_pulldown', [set(50, 10)])]);
  const w = workoutActivityProps(warm, deps);
  assert.equal(w.setText, 'Разминка');
  assert.equal(w.setNo, 0);
  assert.equal(w.setTotal, 1);
  const done = session([we('bench_press', [set(60, 8, true), set(60, 8, true)]), we('lat_pulldown', [set(50, 10)])], { currentIndex: 0 });
  const d = workoutActivityProps(done, deps);
  assert.equal(d.setText, 'Готово · 2 из 2');
  assert.equal(d.next, 'Далее: Тяга верхнего блока');
});

test('Live Activity: упражнение на время — секунды, а не килограммы и повторы; свой вес', () => {
  const s = session([we('plank', [set(0, 45, true), set(0, 50)], { repMin: 30, repMax: 60 })]);
  const p = workoutActivityProps(s, deps);
  assert.equal(p.timed, true);
  assert.equal(p.target, '0:50');
  assert.ok(!/кг|повт/.test(p.target));
  const bw = workoutActivityProps(session([we('push_up', [set(0, 12)])]), deps);
  assert.equal(bw.target, 'Свой вес × 12');
});

test('Live Activity: суперсет — фактически выбранное упражнение и его метка', () => {
  const list = linkWithNext([we('bench_press', [set(60, 8, true), set(60, 8)]), we('lat_pulldown', [set(50, 10), set(50, 10)])], 0);
  const s = session(list, { currentIndex: 1 });
  const p = workoutActivityProps(s, deps);
  assert.equal(p.exercise, 'Тяга верхнего блока');
  assert.equal(p.superset, 'A2');
  assert.equal(p.setText, 'Подход 1 из 2');
});

test('Live Activity: отдых только если запущен вручную; всё выполнено → подсказка завершить', () => {
  const s = session([we('bench_press', [set(60, 8, true)])]);
  const p = workoutActivityProps(s, { ...deps, rest: { startedAt: 5_000, endsAt: 95_000 } });
  assert.deepEqual([p.restFrom, p.restTo], [5_000, 95_000]);
  assert.equal(p.allDone, true);
  assert.match(p.next, /заверши/);
  assert.deepEqual([workoutActivityProps(s, deps).restFrom, workoutActivityProps(s, deps).restTo], [0, 0]);
  assert.notEqual(activityKey(p), activityKey(workoutActivityProps(s, deps)), 'изменение отдыха — новое обновление');
});

test('Live Activity: ровно одна на тренировку — старт, обновление, закрытие лишних, прошлых и при завершении/отмене', () => {
  assert.deepEqual(planActivity({ workoutId: 'w1', instances: [], changed: true }), { start: true, keep: null, endIds: [], update: false });
  assert.deepEqual(planActivity({ workoutId: 'w1', instances: [{ id: 'a', owner: 'w1' }, { id: 'b' }], changed: true }), { start: false, keep: 'a', endIds: ['b'], update: true }, 'лишние закрываются');
  assert.equal(planActivity({ workoutId: 'w1', instances: [{ id: 'a' }], changed: false }).update, false, 'без изменений — без вызова');
  assert.deepEqual(planActivity({ workoutId: 'w1', instances: [{ id: 'a' }], changed: true }).keep, 'a', 'после перезапуска «ничья» активность принимается');
  assert.deepEqual(planActivity({ workoutId: 'w2', instances: [{ id: 'a', owner: 'w1' }], changed: true }), { start: true, keep: null, endIds: ['a'], update: false }, 'новая тренировка не наследует активность прошлой');
  assert.deepEqual(planActivity({ workoutId: null, instances: [{ id: 'a', owner: 'w1' }], changed: false }).endIds, ['a'], 'завершение или отмена — закрыть');
  assert.deepEqual(planActivity({ workoutId: null, instances: [], changed: false }).endIds, [], 'после перезапуска без тренировки и без активностей — ничего');
});

import { createActivitySync, type ActivityFactory, type ActivityInstance } from '../src/features/training/liveActivitySync';
import type { WorkoutActivityProps } from '../src/features/training/liveActivity';

/** Имитация ActivityKit: активности живут «в системе» и переживают перезапуск приложения */
function fakeKit(opts: { denied?: boolean } = {}) {
  const live = new Map<string, { props: WorkoutActivityProps; updates: number }>();
  const ended: { id: string; policy: unknown }[] = [];
  let n = 0;
  let starts = 0;
  const inst = (id: string): ActivityInstance => ({
    getId: () => id,
    update: async (p) => {
      const a = live.get(id);
      if (!a) throw new Error('ended');
      a.props = p;
      a.updates++;
    },
    end: async (policy) => {
      live.delete(id);
      ended.push({ id, policy });
    },
  });
  const factory: ActivityFactory = {
    start: (p) => {
      starts++;
      if (opts.denied) throw new Error('Live Activities disabled');
      const id = `act${n++}`;
      live.set(id, { props: p, updates: 0 });
      return inst(id);
    },
    getInstances: () => [...live.keys()].map(inst),
  };
  return { factory, live, ended, starts: () => starts, dismiss: (id: string) => live.delete(id) };
}

test('Live Activity: полный цикл на имитации — старт, обновления на подходах, одна активность, завершение', async () => {
  const kit = fakeKit();
  let workout: WorkoutActivityProps | null = null;
  const finished = new Set<string>();
  const core = createActivitySync({ factory: kit.factory, after: (d) => ({ after: d }), props: () => workout, isFinished: (id) => finished.has(id), url: 'form://workout/active', now: () => 0 });
  const base = workoutActivityProps(session([we('bench_press', [set(60, 8), set(60, 8)])]), deps);

  await core.sync();
  assert.equal(kit.live.size, 0, 'без тренировки — ничего');
  workout = base;
  await core.sync();
  await core.sync();
  assert.equal(kit.live.size, 1, 'ровно одна активность');
  assert.equal(kit.starts(), 1);
  workout = { ...base, setNo: 2, setText: 'Подход 2 из 2', progress: 0.5 };
  await core.sync();
  const [id] = [...kit.live.keys()];
  assert.equal(kit.live.get(id)!.props.setText, 'Подход 2 из 2', 'подход завершён — данные обновились');
  assert.equal(kit.live.get(id)!.updates, 1);
  await core.sync();
  assert.equal(kit.live.get(id)!.updates, 1, 'без изменений — без лишних обновлений');
  finished.add(base.workoutId);
  workout = null;
  await core.sync();
  assert.equal(kit.live.size, 0, 'завершение — активность закрыта');
  assert.deepEqual(kit.ended[0].policy, { after: new Date(2 * 60 * 1000) }, 'итог остаётся на пару минут');
});

test('Live Activity: отмена — сразу; перезапуск приложения — согласование; смахнули — не навязываем; запрещены — тренировка идёт', async () => {
  const kit = fakeKit();
  let workout: WorkoutActivityProps | null = workoutActivityProps(session([we('bench_press', [set(60, 8)])]), deps);
  const mk = () => createActivitySync({ factory: kit.factory, after: (d) => ({ after: d }), props: () => workout, isFinished: () => false, url: 'u', now: () => 0 });
  await mk().sync();
  // «Перезапуск»: новое ядро, активность уже в системе — принимаем её, вторую не создаём
  const relaunched = mk();
  workout = { ...workout, setText: 'Готово · 1 из 1' };
  await relaunched.sync();
  assert.equal(kit.live.size, 1);
  assert.equal(kit.starts(), 1, 'после перезапуска новая не создаётся');
  assert.equal([...kit.live.values()][0].props.setText, 'Готово · 1 из 1');
  // Смахнули с экрана блокировки — до перезапуска не возвращаем
  kit.dismiss([...kit.live.keys()][0]);
  workout = { ...workout, progress: 1 };
  await relaunched.sync();
  assert.equal(kit.live.size, 0);
  // Отмена тренировки: висящая активность закрывается немедленно
  const again = mk();
  await again.sync();
  assert.equal(kit.live.size, 1, 'после перезапуска с активной тренировкой — снова одна');
  workout = null;
  await again.sync();
  assert.equal(kit.ended.at(-1)!.policy, 'immediate');
  // После перезапуска без тренировки «висящие» активности закрываются
  kit.factory.start(workoutActivityProps(session([we('bench_press', [set(60, 8)])]), deps), 'u');
  await mk().sync();
  assert.equal(kit.live.size, 0);

  const denied = fakeKit({ denied: true });
  const w = workoutActivityProps(session([we('bench_press', [set(60, 8)])]), deps);
  const core = createActivitySync({ factory: denied.factory, after: (d) => d, props: () => w, isFinished: () => false, url: 'u' });
  await core.sync();
  await core.sync();
  assert.equal(denied.starts(), 1, 'запрещены — без повторов на каждое изменение');
  core.resume();
  await core.sync();
  assert.equal(denied.starts(), 2, 'вернулись в приложение — пробуем снова (могли разрешить в Настройках)');
});
