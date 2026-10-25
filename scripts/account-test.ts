import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryRoute, nameFromApple } from '../src/features/account/route';

const base = { hasProfile: false, welcomeSeen: false, linked: false, authSkipped: false };

test('Запуск: существующий профиль никогда не блокируется приветствием и входом', () => {
  assert.equal(entryRoute({ ...base, hasProfile: true }), 'app', 'старый пользователь без привязки — сразу в приложение');
  assert.equal(entryRoute({ ...base, hasProfile: true, welcomeSeen: true, linked: true }), 'app');
});

test('Запуск: новый пользователь — приветствие один раз → вход → анкета', () => {
  assert.equal(entryRoute(base), 'welcome');
  assert.equal(entryRoute({ ...base, welcomeSeen: true }), 'auth', 'после «Начать» — вход через Apple');
  assert.equal(entryRoute({ ...base, welcomeSeen: true, linked: true }), 'onboarding', 'вошёл — анкета');
  assert.equal(entryRoute({ ...base, welcomeSeen: true, authSkipped: true }), 'onboarding', '«Продолжить без входа» — анкета');
});

test('Вход через Apple: имя только то, что дал пользователь', () => {
  assert.equal(nameFromApple('Алекс', 'Иванов'), 'Алекс');
  assert.equal(nameFromApple(null, 'Иванов'), 'Иванов');
  assert.equal(nameFromApple('  ', undefined), '', 'пусто — ничего не выдумываем');
  assert.equal(nameFromApple(), '');
});

import { draftErrors, draftToProfile, emptyDraft, migrateDraft, parseNumber, resumeStage, stageComplete, type QDraft } from '../src/features/profile/questionnaire';
import { hasEquipment, placesFor } from '../src/features/training/engine/scoring';
import { getExercise } from '../src/data/exercises';

const full: QDraft = {
  ...emptyDraft('Алекс'),
  sex: 'male',
  age: 26,
  heightCm: 180,
  weightKg: 78.5,
  goal: 'bulk',
  level: 'intermediate',
  daysPerWeek: 3,
  sessionMinutes: 60,
  location: 'gym',
  equipment: ['barbell', 'dumbbell'],
  activity: 'moderate',
  sleepHours: 7.5,
  diet: 'none',
};

test('Анкета: пустой черновик — никаких выдуманных показателей', () => {
  const d = emptyDraft();
  for (const k of ['sex', 'age', 'heightCm', 'weightKg', 'goal', 'level', 'daysPerWeek', 'sessionMinutes', 'location', 'activity', 'sleepHours', 'diet'] as const) assert.equal(d[k], undefined, k);
  for (let i = 0; i < 5; i++) assert.equal(stageComplete(d, i), false, `этап ${i + 1} не пройден без ответов`);
  assert.equal(draftToProfile(d, 1), null, 'недостающее не подставляется');
});

test('Анкета: возраст от 18, рост и вес в разумных пределах', () => {
  assert.match(draftErrors({ ...full, age: 17 }).age!, /с 18 лет/);
  assert.equal(stageComplete({ ...full, age: 17 }, 1), false);
  assert.equal(stageComplete({ ...full, age: 18 }, 1), true);
  assert.ok(draftErrors({ ...full, heightCm: 90 }).heightCm);
  assert.ok(draftErrors({ ...full, weightKg: 400 }).weightKg);
  assert.deepEqual(draftErrors({ ...emptyDraft(), age: undefined }), {}, 'пустое поле — не ошибка, а «ещё не ответил»');
  assert.equal(parseNumber('78,5'), 78.5);
  assert.equal(parseNumber(''), undefined);
  assert.equal(parseNumber('abc'), undefined);
});

test('Анкета: этапы 4 и 5 — опыт, раз в неделю, длительность, место; активность, сон, питание, дополнительно', () => {
  assert.equal(stageComplete({ ...full, daysPerWeek: 1 }, 3), false, 'минимум 2 раза');
  assert.equal(stageComplete({ ...full, daysPerWeek: 7 }, 3), false, 'максимум 6');
  assert.equal(stageComplete({ ...full, daysPerWeek: undefined }, 3), false);
  assert.equal(stageComplete({ ...full, sessionMinutes: undefined }, 3), false);
  assert.equal(stageComplete({ ...full, location: 'gym', equipment: [] }, 3), false, 'в зале нужно хоть что-то');
  assert.equal(stageComplete({ ...full, location: 'home', equipment: [] }, 3), true, 'дома можно с весом тела');
  assert.equal(stageComplete({ ...full, location: 'outdoor', equipment: [] }, 3), true, 'на улице — тоже');
  assert.equal(stageComplete({ ...full, location: 'mixed', equipment: [] }, 3), false, 'комбинированно — с оборудованием зала');
  assert.equal(stageComplete({ ...full, sleepHours: undefined }, 4), false, 'сон обязателен');
  assert.equal(stageComplete({ ...full, activity: undefined }, 4), false, 'активность обязательна');
  assert.equal(stageComplete({ ...full, diet: undefined }, 4), false, 'про питание надо ответить');
  assert.equal(stageComplete({ ...full, limitations: '' }, 4), true, '«Дополнительно» — необязательно');
});

test('Анкета: черновик прошлой версии продолжается без потери ответов', () => {
  const old = { ...emptyDraft('Алекс'), days: [0, 2, 4], workStyle: 'desk', stepsPerDay: 7000, sessionMinutes: 75 } as QDraft;
  const m = migrateDraft(old);
  assert.equal(m.daysPerWeek, 3, 'дни недели → частота');
  assert.equal(m.activity, 'moderate', 'работа + шаги → активность');
  assert.equal(m.sessionMinutes, 60, '75 мин больше не предлагаем — ближайшее');
  assert.equal(migrateDraft({ ...old, workStyle: 'physical' }).activity, 'veryHigh');
});

test('Место тренировок: на улице — как дома, комбинированно — зал и дом', () => {
  assert.deepEqual(placesFor('gym'), ['gym']);
  assert.deepEqual(placesFor('outdoor'), ['home']);
  assert.deepEqual(placesFor('mixed'), ['gym', 'home']);
  const pullup = getExercise('pull_up')!;
  const bench = getExercise('bench_press')!;
  assert.equal(hasEquipment(pullup, ['pullupbar'], 'outdoor'), true, 'турник на площадке');
  assert.equal(hasEquipment(bench, ['barbell', 'bench'], 'outdoor'), false, 'жима штанги на улице нет');
  assert.equal(hasEquipment(bench, ['barbell', 'bench'], 'mixed'), true);
});

test('Анкета: продолжение после перезапуска и сборка профиля', () => {
  assert.equal(resumeStage({ ...full, goal: undefined }, 4), 2, 'не дальше первого незаполненного этапа');
  assert.equal(resumeStage(full, 3), 3);
  assert.equal(resumeStage(full, 5), 5, 'все этапы пройдены — итог');
  const p = draftToProfile({ ...full, limitations: 'правое плечо', diet: 'lactose' }, 42)!;
  assert.equal(p.weightKg, 78.5);
  assert.deepEqual(p.preferredDays, [], 'дни расставляет план');
  assert.equal(p.daysPerWeek, 3);
  assert.equal(p.stepsPerDay, 7000, 'активность → шаги');
  assert.equal(p.workStyle, 'desk');
  assert.deepEqual(p.dietRestrictions, ['lactose']);
  assert.equal(p.sleepHours, 7.5);
  assert.equal(p.health!.injuries, 'правое плечо');
  assert.equal(p.limitations, 'правое плечо');
  assert.equal(p.targetWeightKg, undefined, 'целевой вес не спрашиваем');
  assert.ok(p.ratePctPerWeek > 0 && p.ratePctPerWeek <= 0.5, 'темп — рекомендованный');
  assert.equal(draftToProfile(full, 1)!.limitations, '', 'без дополнительного — без ограничений');
  assert.deepEqual(draftToProfile(full, 1)!.dietRestrictions, [], '«Нет» в питании');
});

import { sleepBaseline } from '../src/features/science/recovery';

test('Сон из анкеты — норма, пока не набралось 5 ночей', () => {
  const c = (date: string, h: number) => ({ date, sleepHours: h, sleepQuality: 3 as const, energy: 3 as const, stress: 3 as const, soreness: 3 as const, pain: false, createdAt: 0 });
  assert.equal(sleepBaseline('2026-10-20', {}, undefined, 7.5), 7.5);
  assert.equal(sleepBaseline('2026-10-20', {}), undefined);
  const five = Object.fromEntries(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'].map((d) => [d, c(d, 6)]));
  assert.equal(sleepBaseline('2026-10-20', five, undefined, 7.5), 6, 'свои данные важнее анкеты');
});

import { deltaText, greeting, sleepCard, stepsAverage, stepsWeek, weightCard, weightOnTrack } from '../src/features/home/today';

test('Главная: вес и динамика — только из записей', () => {
  assert.equal(weightCard([], '2026-10-24'), null, 'нет взвешиваний — пустое состояние, без примерных цифр');
  const w = (date: string, kg: number) => ({ id: date, date, kg, createdAt: 0 });
  const one = weightCard([w('2026-10-24', 80)], '2026-10-24')!;
  assert.equal(one.kg, 80);
  assert.equal(one.week, null, 'динамика — когда есть неделя данных');
  const many = weightCard([w('2026-10-10', 80), w('2026-10-14', 80.2), w('2026-10-17', 80.4), w('2026-10-24', 80.8)], '2026-10-24')!;
  assert.ok(many.week! > 0);
  assert.equal(many.stale, false);
  assert.equal(weightCard([w('2026-10-01', 80)], '2026-10-24')!.stale, true, 'давно не взвешивался');
  assert.equal(deltaText(-0.3), '−0,3 кг');
  assert.equal(deltaText(0.2), '+0,2 кг');
  assert.equal(deltaText(0.01), '±0 кг');
  assert.equal(weightOnTrack('bulk', 0.2), true);
  assert.equal(weightOnTrack('cut', 0.2), false);
  assert.equal(weightOnTrack('maintain', -0.2), true);
});

test('Главная: сон — чек-ин важнее Apple Health, без данных — null', () => {
  assert.deepEqual(sleepCard(450, 7), { minutes: 450, source: 'checkin' });
  assert.deepEqual(sleepCard(undefined, 6.5), { minutes: 390, source: 'health' });
  assert.equal(sleepCard(undefined, undefined), null);
});

test('Главная: приветствие по времени и шаги за 7 дней — только из Apple Health', () => {
  assert.equal(greeting(8), 'Доброе утро');
  assert.equal(greeting(14), 'Добрый день');
  assert.equal(greeting(20), 'Добрый вечер');
  assert.equal(greeting(2), 'Доброй ночи');
  const w = stepsWeek({ '2026-10-25': { steps: 6840 }, '2026-10-23': { steps: 9000 }, '2026-10-20': { steps: 12000 } }, '2026-10-25');
  assert.equal(w.length, 7);
  assert.equal(w[6].date, '2026-10-25');
  assert.equal(w[6].label, 'Вс');
  assert.equal(w[0].label, 'Пн');
  assert.equal(w[5].steps, undefined, 'нет данных — пусто, а не ноль');
  assert.equal(stepsAverage(w), Math.round((6840 + 9000 + 12000) / 3));
  assert.equal(stepsAverage(w.slice(5)), null, 'меньше трёх дней — без среднего');
});
