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
