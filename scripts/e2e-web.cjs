/**
 * E2E-проверки интерфейса в Expo Web (iPhone 440×956).
 * Запуск: npx expo start --web --port 8081, затем  node scripts/e2e-web.cjs
 * Нужен Playwright (PLAYWRIGHT_PATH — путь к модулю, если он установлен глобально).
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const URL = process.env.E2E_URL || 'http://localhost:8081';

const PROFILE = {
  name: 'Тест', sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 4, sessionMinutes: 70, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message}`);
  }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Онбординг пропускаем: кладём профиль в хранилище и создаём план через приложение
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate((p) => localStorage.setItem('form.profile', JSON.stringify({ state: { profile: p, settings: {} }, version: 1 })), PROFILE);
  await page.goto(`${URL}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // План и КБЖУ создаёт само приложение: Профиль → Тренировки → «Сохранить и пересчитать»
  await page.getByText('Тренировки', { exact: true }).first().click();
  await page.getByText('Сохранить и пересчитать').click();
  await page.waitForTimeout(1200);
  await page.getByText('Заполнить демо-историей (для проверки)').click();
  await page.getByText('Добавить демо', { exact: true }).click();
  await page.waitForTimeout(800);
  const shot = async (name) => process.env.E2E_SHOTS && page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png` });
  const dismiss = async () => {
    const d = page.getByText('У тебя есть незавершённая тренировка');
    await d.waitFor({ timeout: 2500 }).catch(() => {});
    if (await d.count()) {
      await page.waitForTimeout(500); // дождаться появления, иначе тап по фону теряется
      await page.mouse.click(12, 12);
      await d.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
    }
  };

  await check('3. «Добавить еду» видна без прокрутки', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const box = await page.getByLabel('Добавить еду').first().boundingBox();
    assert.ok(box && box.y + box.height <= 956 - 70, `y=${box && box.y}`);
  });

  await check('4. Активная тренировка показывает одно упражнение', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    await page.getByText(/Начать тренировку|Продолжить тренировку/).first().click();
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    assert.match(text, /1 из \d/);
    const n = await page.getByText(/^Завершить подход \d$/).count();
    assert.equal(n, 1);
  });

  await check('7. Назад к предыдущему упражнению — подходы сохраняются', async () => {
    await page.getByText(/^Завершить подход 1$/).click();
    await page.waitForTimeout(500);
    await page.getByText('Пропустить').click().catch(() => {});
    await page.getByLabel('Следующее упражнение').click();
    await page.waitForTimeout(600);
    assert.match(await page.evaluate(() => document.body.innerText), /2 из \d/);
    await page.getByLabel('Предыдущее упражнение').click();
    await page.waitForTimeout(600);
    assert.match(await page.evaluate(() => document.body.innerText), /1 из \d/);
    assert.equal(await page.getByLabel('Отменить выполнение подхода').count(), 1);
  });

  await check('8. Перезагрузка — тренировка и позиция восстанавливаются', async () => {
    await page.getByLabel('Следующее упражнение').click();
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await page.goto(`${URL}/workout/active`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    assert.match(await page.evaluate(() => document.body.innerText), /2 из \d/);
    await page.getByLabel('Предыдущее упражнение').click();
    await page.waitForTimeout(600);
    assert.equal(await page.getByLabel('Отменить выполнение подхода').count(), 1);
  });

  await check('6. Навигатор: выполнено / текущее / впереди', async () => {
    await page.getByLabel('Список упражнений').click();
    await page.waitForTimeout(700);
    assert.ok((await page.getByLabel(/, текущее$/).count()) === 1);
    assert.ok((await page.getByLabel(/, впереди$/).count()) >= 1);
    await page.mouse.click(220, 40);
  });

  await check('15. Техника — отдельная кнопка, экран тренировки без прокрутки', async () => {
    await page.goto(`${URL}/workout/active`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const tech = await page.getByLabel('Техника выполнения').boundingBox();
    assert.ok(tech && tech.y < 300, `кнопка «Техника» вверху: y=${tech && tech.y}`);
    const cta = await page.getByText(/^Завершить подход \d$|^Следующее упражнение|^Завершить тренировку/).first().boundingBox();
    assert.ok(cta && cta.y + cta.height <= 956, `CTA на экране: y=${cta && cta.y}`);
    await shot('workout');
  });

  await check('16. Шторка упражнений закрывается свайпом вниз', async () => {
    await page.getByLabel('Список упражнений').click();
    await page.waitForTimeout(700);
    const item = await page.getByLabel(/, текущее$/).boundingBox();
    assert.ok(item, 'шторка открыта');
    const x = 220, y = item.y - 30;
    // Настоящий свайп пальцем (touch-события), как на iPhone
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty }] });
    await touch('touchStart', y);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', y + i * 25); await page.waitForTimeout(16); }
    await touch('touchEnd', y + 300);
    await page.waitForTimeout(900);
    assert.equal(await page.getByLabel(/, текущее$/).count(), 0, 'шторка закрыта');
  });

  await check('22. Тренировки: неделя сверху, объём — шторкой', async () => {
    await page.goto(`${URL}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const wk = await page.getByText('Эта неделя', { exact: true }).boundingBox();
    assert.ok(wk && wk.y < 220, `неделя сверху: y=${wk && wk.y}`);
    await shot('training-today');
    await page.getByLabel('Объём за неделю').click();
    await page.waitForTimeout(700);
    assert.ok(await page.getByText('Прямые рабочие подходы с понедельника · сделано / план').isVisible());
    await shot('volume-sheet');
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(600);
  });

  await check('17. Главная: Coach у иконки профиля, без прокрутки', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const coach = await page.getByLabel('Тренер FORM — совет дня и чат').boundingBox();
    const prof = await page.getByLabel('Профиль').first().boundingBox();
    assert.ok(coach && prof && Math.abs(coach.y - prof.y) < 20, 'кнопка коуча рядом с профилем');
    assert.equal(await page.getByText('Coach расчёт').count(), 0);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('div')].some((d) => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== 'visible' && d.clientHeight > 500));
    assert.ok(!overflow, 'главная помещается на экран');
    await shot('home');
  });

  await check('18. Смена темы и акцента на лету — без ошибок', async () => {
    await page.goto(`${URL}/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/theme-start.png` });
    const before = errors.length;
    for (const t of ['Синий', 'Светлая', 'Оранжевый', 'Тёмная', 'Салатовый · по умолчанию']) {
      await page.getByText(t, { exact: true }).last().click({ timeout: 4000 }).catch(async (e) => { if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/fail-${t}.png` }); throw e; });
      await page.waitForTimeout(900);
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/theme-${t}.png` });
      assert.ok((await page.getByText('Оформление').count()) > 0, `экран жив после «${t}»`);
    }
    assert.equal(errors.length, before, errors.slice(before).join(' | '));
  });

  await check('19. Тренировки → План: выбор сплита', async () => {
    await page.goto(`${URL}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByText('План', { exact: true }).first().click();
    await page.waitForTimeout(600);
    assert.ok(await page.getByText('Твой план', { exact: true }).isVisible(), 'план сверху');
    await page.getByLabel('Сменить сплит').click();
    await page.waitForTimeout(400);
    await shot('split-list');
    await page.getByText('Всё тело', { exact: true }).first().click();
    await page.waitForTimeout(600);
    assert.ok((await page.getByText('Перейти на этот сплит').count()) === 1);
    await shot('split');
    await page.getByText('Библиотека', { exact: true }).first().click();
    await page.waitForTimeout(800);
    await shot('library');
  });

  await check('20. Коуч отвечает локально, без настройки', async () => {
    await page.goto(`${URL}/coach`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    assert.equal(await page.getByText(/Настрой|подключи/i).count(), 0);
    await page.getByLabel('Сообщение тренеру').fill('можно ли тренироваться при простуде');
    await page.getByLabel('Отправить').click();
    await page.waitForTimeout(1500);
    assert.match(await page.evaluate(() => document.body.innerText), /врач/i);
    await shot('coach');
  });

  await check('23. Тренер: «что мне сегодня делать» и программа на мышцу — с кнопками', async () => {
    await page.goto(`${URL}/coach`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByLabel('Сообщение тренеру').fill('Что мне сегодня делать?');
    await page.getByLabel('Отправить').click();
    await page.waitForTimeout(1200);
    const t = await page.evaluate(() => document.body.innerText);
    assert.ok(!/Пройди утренний чек-ин/.test(t), 'не требует чек-ин');
    assert.ok(/Начать тренировку|Тренировка вне плана|уже сделана/.test(t), 'есть действие');
    await page.getByLabel('Сообщение тренеру').fill('хочу упражнение на верх груди');
    await page.getByLabel('Отправить').click();
    await page.waitForTimeout(1200);
    assert.ok(await page.getByText('Начать эту тренировку').last().isVisible());
    await shot('coach-target');
  });

  await check('24. Шторка «+» закрывается свайпом за содержимое; «Тренировать сейчас» на карточке', async () => {
    await page.goto(`${URL}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByLabel('Тренировка: начать, сгенерировать или собрать').click();
    await page.waitForTimeout(800);
    const card = await page.getByText('Сегодня по плану').boundingBox();
    assert.ok(card, 'шторка открыта');
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 220, y: ty }] });
    await touch('touchStart', card.y + 10);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', card.y + 10 + i * 25); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await page.getByText('Сегодня по плану').count(), 0, 'шторка закрыта свайпом');
    await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    assert.ok(await page.getByText('Тренировать сейчас').isVisible());
  });

  await check('21. Оформление: после смены темы «Назад» ведёт в профиль, затем на главную', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByLabel('Профиль').first().click();
    await page.waitForTimeout(800);
    await page.getByText('Оформление', { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByText('Синий', { exact: true }).last().click();
    await page.waitForTimeout(1500);
    assert.ok(await page.getByText('Оформление', { exact: true }).last().isVisible(), 'остались на «Оформлении»');
    await page.getByLabel('Назад').last().click();
    await page.waitForTimeout(900);
    const visible = async (txt) => { for (const el of await page.getByText(txt).all()) if (await el.isVisible()) return true; return false; };
    assert.ok(!(await visible('Выбор сохраняется на устройстве')), 'один «Назад» уходит с «Оформления»');
    assert.ok(await visible('Оформление'), 'вернулись в профиль');
    await page.getByLabel('Назад').last().click();
    await page.waitForTimeout(900);
    assert.ok(await page.getByLabel('Тренер FORM — совет дня и чат').isVisible(), 'второй «Назад» — главная');
  });

  await check('14. Тема сохраняется после перезапуска', async () => {
    await page.goto(`${URL}/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByText('Светлая', { exact: true }).click();
    await page.waitForTimeout(1200);
    await page.goto(`${URL}/profile`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Фон светлой темы (#F1F2EE) после полной перезагрузки страницы
    const light = await page.evaluate(() => [...document.querySelectorAll('div')].some((d) => getComputedStyle(d).backgroundColor === 'rgb(241, 242, 238)'));
    assert.ok(light, 'светлый фон после перезапуска');
  });

  results.push(errors.length ? `JS-ошибки: ${errors.join(' | ')}` : 'JS-ошибок нет');
  console.log(results.join('\n'));
  await browser.close();
  if (results.some((r) => r.startsWith('✗'))) process.exit(1);
})();
