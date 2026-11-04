import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDelta, fmtUnit, fmtValue, GROUP, MINUS, NBSP } from '../src/utils/format';
import { scaleFill, statLabel } from '../src/components/ds/logic';

// В шаблоне: пробел между цифрами — узкий неразрывный (разряды), перед буквами — неразрывный (единица)
const sp = (s: string) => s.replace(/(?<=\d) (?=\d)/g, GROUP).replace(/ /g, NBSP);

test('Числа ru-RU: разряды через узкий неразрывный пробел, запятая, без лишнего нуля', () => {
  assert.equal(fmtValue(2150), sp('2 150'));
  assert.equal(fmtValue(1234567), sp('1 234 567'));
  assert.equal(fmtValue(82.5, 1), '82,5');
  assert.equal(fmtValue(82, 1), '82');
  assert.equal(fmtValue(999), '999');
  assert.equal(fmtValue(NaN), '—');
  assert.equal(fmtValue(Infinity), '—');
});

test('Числа ru-RU: типографский минус, «−0» не показывается', () => {
  assert.equal(fmtValue(-1250), `${MINUS}${sp('1 250')}`);
  assert.equal(fmtValue(-0.5, 1), `${MINUS}0,5`);
  assert.equal(fmtValue(-0.01, 1), '0');
});

test('Число с единицей не переносится посередине', () => {
  assert.equal(fmtUnit(2150, 'ккал'), sp('2 150 ккал'));
  assert.equal(fmtUnit(82.5, 'кг', 1), sp('82,5 кг'));
  assert.equal(fmtUnit(NaN, 'кг'), '—');
  assert.equal(fmtUnit(12), '12');
});

test('Дельта: знак у роста и падения, ноль без знака', () => {
  assert.equal(fmtDelta(1.2, 1), '+1,2');
  assert.equal(fmtDelta(-0.5, 1), `${MINUS}0,5`);
  assert.equal(fmtDelta(0), '0');
  assert.equal(fmtDelta(-0.04, 1), '0');
  assert.equal(fmtDelta(1500), `+${sp('1 500')}`);
});

test('Шкала: доля до цели, перебор отдельно, мусор не ломает', () => {
  assert.deepEqual(scaleFill(70, 140), { fill: 0.5, over: false });
  assert.deepEqual(scaleFill(140, 140), { fill: 1, over: false });
  assert.deepEqual(scaleFill(180, 140), { fill: 1, over: true });
  assert.deepEqual(scaleFill(-5, 140), { fill: 0, over: false });
  assert.deepEqual(scaleFill(50, 0), { fill: 0, over: false });
  assert.deepEqual(scaleFill(NaN, 100), { fill: 0, over: false });
});

test('Подпись VoiceOver: число вместе с единицей и изменением', () => {
  assert.equal(statLabel('Белки', '96', 'г'), 'Белки: 96 г');
  assert.equal(statLabel('Вес', '82,5', 'кг', 'изменение −0,5'), 'Вес: 82,5 кг, изменение −0,5');
  assert.equal(statLabel('Тренировок', '12'), 'Тренировок: 12');
});
