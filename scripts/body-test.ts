import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BodyMetric, WeightEntry } from '../src/types';
import { analyzeBody, bfLevel, bmiBodyFat, bodyTrend, combineBodyFat, estimateBodyFat, mergeZones, navyBodyFat, withoutStrengths, parsePhotoAnalysis, rfmBodyFat } from '../src/features/progress/body';

const D = '2026-10-14';
const m = (kind: BodyMetric['kind'], value: number, date = '2026-10-10'): BodyMetric => ({ id: `${kind}${date}${value}`, kind, value, date });
const w = (date: string, kg: number): WeightEntry => ({ id: date, date, kg, createdAt: 0 });
const male = { sex: 'male' as const, age: 29, heightCm: 180, weightKg: 78, today: D };

test('Тело: формулы процента жира (ВМС США, RFM, по ИМТ)', () => {
  assert.ok(Math.abs(navyBodyFat('male', 180, 85, 38)! - 16.1) < 0.2, 'ВМС США, мужчина 180/85/38 ≈ 16%');
  assert.ok(Math.abs(navyBodyFat('female', 165, 70, 32, 96)! - 25.4) < 0.2, 'ВМС США, женщина 165/70/96/32 ≈ 25%');
  assert.equal(navyBodyFat('female', 165, 70, 32), null, 'женщинам нужны бёдра');
  assert.equal(navyBodyFat('male', 180, 35, 38), null, 'талия меньше шеи — ошибка ввода');
  assert.ok(Math.abs(rfmBodyFat('male', 180, 85) - 21.6) < 0.1);
  assert.ok(Math.abs(bmiBodyFat('male', 29, 180, 78) - 19.4) < 0.1);
});

test('Тело: лучший доступный способ оценки и диапазон', () => {
  assert.equal(estimateBodyFat({ ...male, metrics: [] }).method, 'bmi');
  assert.equal(estimateBodyFat({ ...male, metrics: [m('waist', 85)] }).method, 'rfm');
  const navy = estimateBodyFat({ ...male, metrics: [m('waist', 85), m('neck', 38)] });
  assert.equal(navy.method, 'navy');
  assert.deepEqual([navy.low, navy.high], [12.6, 19.6]);
  assert.equal(estimateBodyFat({ ...male, metrics: [m('waist', 85), m('neck', 38), m('bodyfat', 15)] }).method, 'measured');
  assert.equal(estimateBodyFat({ ...male, metrics: [m('bodyfat', 15, '2026-08-01')] }).method, 'bmi', 'старый замер прибором не используется');
  assert.equal(estimateBodyFat({ ...male, metrics: [m('waist', 85, '2026-05-01')] }).method, 'bmi', 'замеры старше 60 дней не используются');
  assert.equal(bfLevel('male', 12), 'athletic');
  assert.equal(bfLevel('male', 21), 'average');
  assert.equal(bfLevel('female', 23), 'fit');
  assert.equal(bfLevel('female', 34), 'high');
});

test('Тело: пропорции, зоны жира, отстающие зоны и акцент в плане', () => {
  const a = analyzeBody({ ...male, metrics: [m('waist', 94), m('neck', 38), m('hips', 100), m('chest', 104), m('arm', 36), m('thigh', 50)] });
  const by = Object.fromEntries(a.ratios.map((r) => [r.key, r]));
  assert.equal(by.whtr.ok, false, 'талия 94 при росте 180 — больше 0,5');
  assert.equal(by.whr.ok, false, '0,94 > 0,90');
  assert.equal(by.chestWaist.ok, false, '104/94 < 1,25');
  assert.equal(by.thighArm.ok, false, '50/36 = 1,39 — ноги отстают');
  assert.deepEqual(a.fatZones.map((z) => z.zone).sort(), ['belly', 'sides']);
  assert.deepEqual(a.lagging.map((z) => z.zone).sort(), ['back', 'legs', 'shoulders']);
  assert.ok(a.focus.find((f) => f.zone === 'legs')!.muscles.includes('quads'));
  assert.ok(a.focus.find((f) => f.zone === 'back')!.muscles.includes('lats'));
  assert.deepEqual(a.missing, [], 'все нужные замеры есть');

  const fit = analyzeBody({ ...male, metrics: [m('waist', 80), m('neck', 39), m('chest', 106), m('arm', 38), m('thigh', 60)] });
  assert.deepEqual(fit.fatZones, []);
  assert.deepEqual(fit.lagging, []);
  assert.ok(fit.ratios.every((r) => r.ok));

  // Только фото и профиль (без замеров): оценка по ИМТ, подсказка, что измерить
  const none = analyzeBody({ ...male, weightKg: 98, metrics: [] });
  assert.equal(none.bodyFat!.method, 'bmi');
  assert.equal(none.level, 'high');
  assert.deepEqual(none.fatZones.map((z) => z.zone), ['belly', 'sides'], 'типичные зоны при высоком проценте');
  assert.deepEqual(none.missing.slice(0, 2), ['waist', 'neck']);

  const f = analyzeBody({ sex: 'female', age: 30, heightCm: 165, weightKg: 60, today: D, metrics: [m('waist', 70), m('neck', 32), m('hips', 84)] });
  assert.ok(f.lagging.some((z) => z.zone === 'glutes'), 'ровная талия и узкие бёдра — акцент на ягодицы');
});

test('Тело: тренд талии против веса', () => {
  const metrics = [m('waist', 82, '2026-08-20'), m('waist', 82.5, '2026-10-10'), m('arm', 36, '2026-08-20'), m('arm', 37, '2026-10-10')];
  const good = bodyTrend({ ...male, metrics, weights: [w('2026-08-20', 76), w('2026-10-09', 78)] })!;
  assert.equal(good.tone, 'good');
  assert.match(good.text, /качественный набор/);
  const fat = bodyTrend({ ...male, metrics: [m('waist', 82, '2026-08-20'), m('waist', 86, '2026-10-10')], weights: [w('2026-08-20', 76), w('2026-10-10', 78)] })!;
  assert.equal(fat.tone, 'warn');
  assert.match(fat.text, /с жиром/);
  const cut = bodyTrend({ ...male, metrics: [m('waist', 90, '2026-08-20'), m('waist', 86, '2026-10-10')], weights: [w('2026-08-21', 84), w('2026-10-10', 81)] })!;
  assert.match(cut.text, /уходит жир/);
  assert.equal(bodyTrend({ ...male, metrics: [m('waist', 82, '2026-10-01'), m('waist', 83, '2026-10-10')] }), null, 'меньше 3 недель — рано делать выводы');
});

test('Тело: оценка по фото уточняет замеры', () => {
  const navy = { value: 16, low: 12.5, high: 19.5, method: 'navy' as const };
  assert.deepEqual(combineBodyFat(navy, { low: 14, high: 18 }), { value: 16, low: 14, high: 18, method: 'photo' });
  assert.deepEqual(combineBodyFat(navy, { low: 22, high: 25 }), { value: 18.8, low: 12.5, high: 25, method: 'photo' }, 'не пересекаются — честно шире');
  assert.equal(combineBodyFat({ ...navy, method: 'measured' }, { low: 20, high: 24 })!.method, 'measured', 'прибор важнее фото');
  assert.deepEqual(combineBodyFat({ ...navy, method: 'bmi' }, { low: 20, high: 24 }), { value: 22, low: 20, high: 24, method: 'photo' }, 'фото точнее ИМТ');
  assert.equal(combineBodyFat(navy, null), navy);
});

test('Тело: ответ анализа фото проверяется и нормализуется', () => {
  const meta = { id: 'a', date: D, createdAt: 1, photoIds: ['p1'] };
  const ok = parsePhotoAnalysis({ quality: 'good', qualityNote: '', bodyFatLow: 14, bodyFatHigh: 18, summary: 'Хорошая база.', strengths: ['плечи'], lagging: [{ zone: 'legs', note: 'бёдра' }, { zone: 'legs', note: 'дубль' }, { zone: 'face', note: 'нет такой зоны' }], fatZones: [{ zone: 'belly', note: 'низ живота' }], focus: [{ zone: 'back', why: 'ширина' }, { zone: 'arms', why: '' }] }, meta)!;
  assert.deepEqual(ok.bodyFat, { low: 14, high: 18 });
  assert.deepEqual(ok.lagging, [{ zone: 'legs', text: 'бёдра' }], 'неизвестные зоны и повторы отброшены');
  assert.deepEqual(ok.focus, [{ zone: 'back', text: 'ширина' }], 'пустые пояснения отброшены');
  const poor = parsePhotoAnalysis({ quality: 'poor', qualityNote: 'не видно силуэта', bodyFatLow: 10, bodyFatHigh: 14, lagging: [{ zone: 'legs', note: 'x' }] }, meta)!;
  assert.equal(poor.bodyFat, null);
  assert.deepEqual(poor.lagging, []);
  assert.equal(parsePhotoAnalysis({ quality: 'good', bodyFatLow: 5, bodyFatHigh: 30 }, meta)!.bodyFat, null, 'слишком широкий диапазон — не оценка');
  assert.equal(parsePhotoAnalysis(null, meta), null);
  assert.deepEqual(mergeZones([{ zone: 'belly', text: 'замер' }], [{ zone: 'belly', text: 'фото' }, { zone: 'hips', text: 'фото' }]).map((z) => z.text), ['замер', 'фото']);
});

test('Тело: сильная сторона по фото снимает зону из «что подтянуть»', () => {
  const z = [{ zone: 'shoulders' as const, text: 'дельты' }, { zone: 'legs' as const, text: 'бёдра' }];
  assert.deepEqual(withoutStrengths(z, ['Плечи широкие']).map((x) => x.zone), ['legs']);
  assert.deepEqual(withoutStrengths(z).map((x) => x.zone), ['shoulders', 'legs']);
});
