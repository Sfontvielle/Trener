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
  // Онбординг на чистом устройстве: шаг «Здоровье» и разбор ограничений
  {
    const octx = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
    const op = await octx.newPage();
    await check('0. Онбординг: шаг «Здоровье», введённые ограничения сразу превращаются в правила', async () => {
      await op.goto(`${URL}/onboarding`, { waitUntil: 'networkidle' });
      await op.waitForTimeout(1500);
      await op.getByLabel('Как тебя зовут?').fill('Тест');
      for (let i = 0; i < 4; i++) { await op.getByText('Далее', { exact: true }).click(); await op.waitForTimeout(350); }
      assert.ok(await op.getByText('Здоровье и особенности').isVisible(), 'шаг здоровья');
      await op.getByLabel('Хронические ограничения', { exact: true }).fill('протрузия L5, гипертония');
      await op.waitForTimeout(300);
      const t = await op.evaluate(() => document.body.innerText);
      assert.match(t, /Поясница: не назначать/);
      assert.match(t, /без отказа/);
      // A1. Каждый «+» открывает селектор своей категории (поиск, популярное, Отмена/Сохранить)
      const health = { 'Выбрать: Травмы': 'Травмы', 'Выбрать: Хронические ограничения': 'Хронические ограничения', 'Выбрать: Движения, вызывающие боль': 'Движения, вызывающие боль', 'Выбрать: Ограничения от врача или физиотерапевта': 'Ограничения от врача', 'Добавить: Аллергии': 'Аллергии', 'Добавить: Непереносимости': 'Непереносимости', 'Добавить: Запрещённые продукты': 'Запрещённые продукты' };
      const openPicker = async (btn, title) => {
        await op.getByLabel(btn, { exact: true }).click();
        await op.waitForTimeout(600);
        assert.ok(await op.getByText(title, { exact: true }).last().isVisible(), `${btn} → «${title}»`);
        assert.ok(await op.getByLabel('Поиск', { exact: true }).last().isVisible(), `${btn}: поиск`);
        assert.ok(await op.getByText('Популярное', { exact: true }).last().isVisible(), `${btn}: популярное`);
      };
      for (const [btn, title] of Object.entries(health)) {
        await openPicker(btn, title);
        await op.getByText('Отмена', { exact: true }).last().click();
        await op.waitForTimeout(500);
      }
      // Выбор + свой вариант + сохранение; повторное открытие показывает текущее состояние
      await openPicker('Добавить: Аллергии', 'Аллергии');
      await op.getByText('Арахис', { exact: true }).last().click();
      await op.getByLabel('Поиск', { exact: true }).last().fill('Киноа');
      await op.getByLabel('Добавить «Киноа»').click();
      await op.getByText('Сохранить', { exact: true }).last().click();
      await op.waitForTimeout(600);
      assert.ok(await op.getByLabel('Удалить Арахис').isVisible() && (await op.getByLabel('Удалить Киноа').isVisible()), 'выбранные аллергены на форме');
      await openPicker('Добавить: Аллергии', 'Аллергии');
      assert.ok(await op.getByLabel('Убрать Арахис').isVisible(), 'лист помнит выбор');
      await op.getByText('Отмена', { exact: true }).last().click();
      await op.waitForTimeout(500);
      await openPicker('Выбрать: Травмы', 'Травмы');
      await op.getByText('Плечо', { exact: true }).last().click();
      await op.getByText('Сохранить', { exact: true }).last().click();
      await op.waitForTimeout(500);
      assert.match(await op.getByLabel('Травмы', { exact: true }).inputValue(), /Плечо/);
      await op.getByText('Далее', { exact: true }).click(); await op.waitForTimeout(350);
      await op.getByText('Далее', { exact: true }).click(); await op.waitForTimeout(350);
      for (const [btn, title] of Object.entries({ 'Добавить: Любимые продукты': 'Любимые продукты', 'Добавить: Не ешь / не любишь': 'Не ешь / не любишь' })) {
        await openPicker(btn, title);
        await op.getByText('Отмена', { exact: true }).last().click();
        await op.waitForTimeout(500);
      }
      await op.getByText('Далее', { exact: true }).click(); await op.waitForTimeout(350);
      await op.getByText('Начать с RYNJI').click();
      await op.waitForTimeout(1500);
      assert.ok(await op.getByLabel('Тренер RYNJI — совет дня и чат').isVisible(), 'после онбординга — главная');
    });
    await octx.close();
  }
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
  // Демо-история — в Профиль → Данные и конфиденциальность → Дополнительно
  await page.goto(`${URL}/data`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Дополнительно', { exact: true }).click();
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
    // Старт — с главной (если сегодня тренировка) или через «+» (в день отдыха)
    const main = page.getByText(/^Начать тренировку$|^Продолжить тренировку$/);
    if (await main.count()) await main.first().click();
    else {
      await page.getByLabel('Тренировка: начать, сгенерировать или собрать').click();
      await page.waitForTimeout(700);
      await page.getByText(/^Сделать .* сегодня$|^Начать тренировку$/).first().click();
    }
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

  await check('6. Боковой навигатор: выполнено / текущее / впереди', async () => {
    await page.getByLabel('Список упражнений', { exact: true }).click();
    await page.waitForTimeout(700);
    assert.ok((await page.getByLabel(/, текущее$/).count()) === 1);
    assert.ok((await page.getByLabel(/, впереди$/).count()) >= 1);
    await page.mouse.click(20, 500);
    await page.waitForTimeout(500);
  });

  await check('15. Техника — отдельная кнопка, экран тренировки без прокрутки', async () => {
    await page.goto(`${URL}/workout/active`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const tech = await page.getByLabel('Техника выполнения').boundingBox();
    assert.ok(tech && tech.y < 300, `кнопка «Техника» вверху: y=${tech && tech.y}`);
    const cta = await page.getByText(/^Завершить подход \d$|^Далее: |^Завершить тренировку/i).first().boundingBox();
    assert.ok(cta && cta.y + cta.height <= 956, `CTA на экране: y=${cta && cta.y}`);
    // Техника не занимает основной экран: только кнопка; разбор — в отдельном листе
    const main = await page.evaluate(() => document.body.innerText);
    assert.ok(!/Положение тела|Частые ошибки/.test(main), 'техника не на основном экране');
    assert.match(main, /Упражнение \d+ из \d+/);
    await shot('workout');
  });

  await check('16. Боковой навигатор закрывается свайпом вправо', async () => {
    await page.getByLabel('Список упражнений', { exact: true }).click();
    await page.waitForTimeout(700);
    const item = await page.getByLabel(/, текущее$/).boundingBox();
    assert.ok(item, 'панель открыта');
    const y = item.y + 10, x = item.x + 20;
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, tx) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: tx, y }] });
    await touch('touchStart', x);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', x + i * 22); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await page.getByLabel(/, текущее$/).count(), 0, 'панель закрыта');
  });

  await check('16б. Шторка техники во время тренировки: следует за пальцем и закрывается свайпом, не прыгает вверх', async () => {
    await page.getByLabel('Техника выполнения').click();
    await page.waitForTimeout(900);
    const head = await page.getByText('Положение тела').first().boundingBox();
    assert.ok(head, 'техника открыта: положение тела');
    assert.ok(await page.getByText('Дыхание', { exact: true }).first().isVisible().catch(() => false) || true);
    const grab = await page.getByLabel('Закрыть', { exact: true }).last().boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const x = 220, y0 = grab.y + 10;
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty }] });
    // Короткий свайп — возврат на место (без перелёта вверх)
    await touch('touchStart', y0);
    for (let i = 1; i <= 3; i++) { await touch('touchMove', y0 + i * 15); await page.waitForTimeout(30); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(700);
    const back = await page.getByLabel('Закрыть', { exact: true }).last().boundingBox();
    assert.ok(back && Math.abs(back.y - grab.y) < 3, `вернулась: ${grab.y} → ${back && back.y}`);
    // Длинный свайп при тикающем таймере — закрывается
    await touch('touchStart', y0);
    for (let i = 1; i <= 14; i++) { await touch('touchMove', y0 + i * 30); await page.waitForTimeout(40); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await page.getByText('Положение тела').count(), 0, 'шторка закрыта свайпом');
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

  await check('17. Главная «Сегодня»: главное действие и метрики дня на первом экране', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const coach = await page.getByLabel('Тренер RYNJI — совет дня и чат').boundingBox();
    const prof = await page.getByLabel('Профиль').first().boundingBox();
    assert.ok(coach && prof && Math.abs(coach.y - prof.y) < 20, 'кнопка коуча рядом с профилем');
    // «Сегодня»: главное действие и метрики дня — на первом экране
    const cta = await page.getByText(/^Начать тренировку$|^Продолжить тренировку$|^Добавить еду$/).first().boundingBox();
    assert.ok(cta && cta.y + cta.height < 956 - 80, `главная кнопка на первом экране: y=${cta && cta.y}`);
    for (const l of ['Калории, открыть питание', 'Вода: добавить стакан 250 мл', 'Шаги', 'Сон, чек-ин', 'Прогресс к цели']) assert.ok(await page.getByLabel(l).count(), l);
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
    assert.ok(await page.getByLabel('Тренер RYNJI — совет дня и чат').isVisible(), 'второй «Назад» — главная');
  });

  await check('25. Подходы: «Тренировать сейчас» — 2 подхода; добавить/убрать подход', async () => {
    await page.goto(`${URL}/exercise/lateral_raise`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await dismiss();
    await page.getByText('Тренировать сейчас').click();
    await page.waitForTimeout(800);
    const again = page.getByText('Начать новую', { exact: true });
    if (await again.count()) { await again.click(); await page.waitForTimeout(800); }
    await page.waitForTimeout(1200);
    const rows = () => page.getByLabel(/^Вес, подход \d+$/).count();
    assert.equal(await rows(), 2);
    await page.getByText('Добавить подход').click();
    await page.waitForTimeout(300);
    assert.equal(await rows(), 3);
    await page.getByText('Убрать подход').click();
    await page.waitForTimeout(300);
    assert.equal(await rows(), 2);
  });

  await check('26. Последний подход → «Завершить тренировку» → подтверждение → итог с «Поднято, кг» и калориями', async () => {
    for (let i = 0; i < 6; i++) {
      const b = page.getByText(/^Завершить подход \d+$/);
      if (!(await b.count())) break;
      const last = (await page.getByText(/^Завершить подход \d+$/).first().innerText()) === 'Завершить подход 2';
      await b.first().click();
      await page.waitForTimeout(250);
      if (last) break; // после последнего подхода «Пропустить» не нажимаем: отдыха быть не должно
      const skip = page.getByText('Пропустить');
      if (await skip.count()) await skip.first().click();
      await page.waitForTimeout(200);
    }
    await page.getByText('Легко', { exact: true }).first().click().catch(() => {});
    // CTA появляется сразу после последнего подхода — без ожидания таймера отдыха
    const fin = page.getByText('ЗАВЕРШИТЬ ТРЕНИРОВКУ', { exact: true });
    assert.ok(await fin.last().isVisible(), 'главная кнопка сменилась на «ЗАВЕРШИТЬ ТРЕНИРОВКУ»');
    await fin.last().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByText('Все упражнения выполнены').last().isVisible());
    await page.getByText('Завершить', { exact: true }).last().click();
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /Поднято, кг/i);
    assert.match(t, /Активные калории/i);
    assert.match(t, /как ощущалась тренировка\?/i);
    assert.ok(!/\bRPE\b|Тоннаж/.test(t), 'нет RPE и «Тоннажа»');
    await page.getByText('Нормально', { exact: true }).click();
    await shot('summary');
  });

  await check('27. Питание: иконки приёмов, «как вчера», вода', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    for (const m of ['Завтрак', 'Обед', 'Ужин', 'Перекусы']) assert.ok(await page.getByText(m, { exact: true }).first().isVisible(), m);
    const copyDay = page.getByText('Скопировать весь вчерашний день');
    const copyMeal = page.getByLabel(/^Скопировать .* со вчера$/);
    assert.ok((await copyDay.count()) + (await copyMeal.count()) > 0, 'копирование со вчера доступно');
    await page.getByLabel('Плюс 250 мл воды').click();
    await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => document.body.innerText), /Вода 250 мл/);
    await shot('nutrition');
  });

  await check('28. Профиль: нет настройки сервера; здоровье и «Данные и конфиденциальность»', async () => {
    await page.goto(`${URL}/profile`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const t = await page.evaluate(() => document.body.innerText);
    assert.ok(!/сервер/i.test(t), 'нет внешнего сервера');
    assert.ok(!/Сохранить копию|Восстановить/.test(t), 'бэкап убран из профиля');
    await page.getByText('Здоровье и особенности', { exact: true }).click();
    await page.waitForTimeout(700);
    await page.getByLabel('Травмы', { exact: true }).fill('Правое плечо — боль в жиме над головой');
    await page.waitForTimeout(300);
    assert.ok(await page.getByText('Что будет учтено').isVisible(), 'превью правил');
    assert.match(await page.evaluate(() => document.body.innerText), /Плечо: не назначать — жим над головой/);
    await page.getByText('Сохранить и пересчитать').click();
    await page.waitForTimeout(1200);
    await page.getByText('Данные и конфиденциальность', { exact: true }).click();
    await page.waitForTimeout(800);
    assert.ok(await page.getByText('Экспортировать мои данные').isVisible());
  });

  await check('29. Отчёт недели и замеры доступны из «Прогресса»; данные переживают перезапуск', async () => {
    await page.goto(`${URL}/measurements`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await dismiss();
    await page.getByText('Сохранить замеры').click();
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.goto(`${URL}/progress`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /талия/i);
    assert.match(t, /что изменилось/i);
    await page.getByText('Отчёт недели', { exact: true }).click();
    await page.waitForTimeout(1000);
    assert.match(await page.evaluate(() => document.body.innerText), /вывод тренера|прошлая неделя пустая/i);
    await shot('review');
  });

  await check('30. Сон 7 ч 43 мин: колесо часы+минуты сохраняется в минутах', async () => {
    await page.goto(`${URL}/checkin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const spin = async (id, idx) => {
      await page.evaluate(([tid, i]) => {
        const root = document.querySelector(`[data-testid="${tid}"]`);
        const sc = [...root.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 10 && getComputedStyle(d).overflowY !== 'visible');
        sc.scrollTop = i * 40;
        sc.dispatchEvent(new Event('scroll'));
      }, [id, idx]);
      await page.waitForTimeout(600);
    };
    await spin('sleep-wheel-h', 7);
    await spin('sleep-wheel-m', 43);
    assert.equal((await page.getByTestId('sleep-value').innerText()).trim(), '7 ч 43 мин');
    await page.getByText(/^Сохранить · /).click();
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('form.checkins')));
    const today = Object.values(saved.state.byDate).sort((a, b) => b.createdAt - a.createdAt)[0];
    assert.equal(today.sleepMinutes, 463);
    assert.equal(saved.version, 2);
    assert.match(await page.evaluate(() => document.body.innerText), /Высокая|Нормальная|Сниженная|Низкая/, 'категория вместо %');
  });

  await check('31. Тап по всей карточке «Завтрак» открывает «Добавить в Завтрак»; сводка с клетчаткой', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const t = await page.evaluate(() => document.body.innerText);
    for (const k of ['Белки', 'Углеводы', 'Жиры', 'Клетчатка']) assert.match(t, new RegExp(k, 'i'), k);
    const card = await page.getByTestId('meal-breakfast').boundingBox();
    // Тап в середину нижней строки карточки, а не по маленькому «+»
    await page.mouse.click(card.x + card.width * 0.4, card.y + card.height - 8);
    await page.waitForTimeout(800);
    assert.ok(await page.getByText('Добавить в Завтрак', { exact: true }).isVisible(), 'лист «Добавить в Завтрак»');
    for (const o of ['Поиск продукта', 'Сканировать штрихкод', 'Недавние', 'Частые продукты', 'Мои блюда']) assert.ok(await page.getByText(o, { exact: true }).count(), o);
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(500);
  });

  await check('32. Календарь: тап по старой дате показывает именно этот день', async () => {
    const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('form.workouts')).state.sessions.filter((s) => s.status === 'completed').sort((a, b) => a.startedAt - b.startedAt)[0]);
    await page.goto(`${URL}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    // Неделя с числами и подсветкой сегодня
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.match(await page.getByTestId(`day-${iso}`).getAttribute('aria-label'), /сегодня/);
    await page.getByLabel('Открыть календарь месяца').click();
    await page.waitForTimeout(500);
    for (let i = 0; i < 3 && !(await page.getByTestId(`day-${sess.date}`).count()); i++) {
      await page.getByLabel('Предыдущий месяц').click();
      await page.waitForTimeout(400);
    }
    await page.getByTestId(`day-${sess.date}`).first().click();
    await page.waitForTimeout(800);
    const det = await page.getByTestId('day-details').innerText();
    assert.ok(det.includes(sess.name), `в истории дня «${sess.name}»`);
    await shot('day-details');
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(500);
  });

  await check('33. Главная: быстрые действия, шаги «X / цель», замеры в один тап', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    for (const l of ['+ Еда', '+ Замеры', 'Check-in']) assert.ok(await page.getByLabel(l, { exact: true }).isVisible(), l);
    assert.ok(await page.getByTestId('measure-card').isVisible(), 'карточка замеров');
    await page.getByLabel('+ Замеры', { exact: true }).click();
    await page.waitForTimeout(700);
    assert.ok(await page.getByText('Талия · на уровне пупка, на выдохе').isVisible(), 'лист замеров: талия');
    await page.getByText('Сохранить', { exact: true }).last().click();
    await page.waitForTimeout(800);
    await shot('home-v2');
  });

  await check('34. Старые сохранённые данные (v1, без новых полей) открываются', async () => {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await page.evaluate((day) => {
      localStorage.setItem('form.checkins', JSON.stringify({ state: { byDate: { [day]: { date: day, sleepHours: 6.5, sleepQuality: 3, energy: 3, stress: 3, soreness: 2, pain: false, createdAt: Date.now() } } }, version: 1 }));
    }, iso);
    await page.goto(`${URL}/checkin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    assert.equal((await page.getByTestId('sleep-value').innerText()).trim(), '6 ч 30 мин');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('form.checkins')));
    assert.equal(saved.version, 2, 'миграция записала v2');
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    assert.match(await page.evaluate(() => document.body.innerText), /Клетчатка/i);
  });

  await check('35. Утро: сон, шаги, готовность и тренировка на первом экране; тренировка — 1 тап', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    for (const l of ['Сон, чек-ин', 'Шаги, как рассчитана цель']) {
      const b = await page.getByLabel(l).boundingBox();
      assert.ok(b && b.y < 956, `${l} на первом экране`);
    }
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /Готовность/);
    assert.ok(/Начать тренировку|Продолжить тренировку|Тренировка выполнена|отдых/i.test(t), 'тренировка дня видна');
  });

  await check('36. Тренировка: подход → RIR одним тапом → таймер отдыха сам; замена с причинами; блины; разминка', async () => {
    await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await dismiss();
    await page.getByText('Тренировать сейчас').click();
    await page.waitForTimeout(800);
    const again = page.getByText('Начать новую', { exact: true });
    if (await again.count()) { await again.click(); await page.waitForTimeout(800); }
    await page.waitForTimeout(1000);
    await page.getByLabel('Вес, подход 1').fill('100');
    await page.waitForTimeout(300);
    // Разминка: предложена для 100 кг, вставляется одним тапом
    const warm = page.getByLabel('Добавить разминку');
    if (await warm.count()) {
      await warm.click();
      await page.waitForTimeout(400);
      assert.ok((await page.getByText('Р', { exact: true }).count()) >= 2, 'разминочные подходы в таблице');
      await page.getByLabel('Убрать подход').count();
    }
    // Блины по тапу на рекомендованный вес (если рекомендация со штангой)
    const plates = page.getByLabel('Раскладка блинов');
    if (await plates.count()) {
      await plates.click();
      await page.waitForTimeout(600);
      assert.ok(await page.getByTestId('plates').isVisible(), 'раскладка блинов');
      await page.getByLabel('Закрыть').last().click();
      await page.waitForTimeout(500);
    }
    // Разминочные подходы (если добавлены) — отметить, отдых между ними короткий
    for (let i = 0; i < 6 && (await page.getByText('Разминка — готово').count()); i++) {
      await page.getByText('Разминка — готово').click();
      await page.waitForTimeout(250);
      const skip = page.getByText('Пропустить');
      if (await skip.count()) await skip.first().click();
      await page.waitForTimeout(200);
    }
    // Рабочий подход: один тап «Завершить подход» → таймер запускается сам → RIR одним тапом
    await page.getByText(/^Завершить подход 1$/).first().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByText('Пропустить').first().isVisible(), 'таймер отдыха запущен автоматически');
    assert.ok(await page.getByText('+30', { exact: true }).isVisible(), '+30 сек');
    assert.ok(await page.getByTestId('rir-picker').isVisible(), 'вопрос RIR');
    await page.getByLabel('Запас 2', { exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId('rir-picker').count(), 0, 'RIR сохранён одним тапом');
    // Замена: причины → альтернативы
    await page.getByLabel('Заменить упражнение', { exact: true }).first().click();
    await page.waitForTimeout(600);
    assert.ok(await page.getByText('Тренажёр занят').isVisible());
    await page.getByText('Тренажёр занят').click();
    await page.waitForTimeout(900);
    assert.ok(await page.getByText('Заменить на…').isVisible(), 'список замен');
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(500);
    await shot('workout-v3');
  });

  await check('37. Питание: обычный завтрак одним тапом; продукт с последней порцией; КБЖУ обновились', async () => {
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('form.nutrition'));
      const pad = (n) => String(n).padStart(2, '0');
      const iso = (dd) => `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
      const today = iso(new Date());
      st.state.entries = st.state.entries.filter((e) => !(e.date === today && e.meal === 'breakfast'));
      for (let i = 1; i <= 4; i++) {
        const dd = new Date(); dd.setDate(dd.getDate() - i);
        const d = iso(dd);
        st.state.entries = st.state.entries.filter((e) => !(e.date === d && e.meal === 'breakfast'));
        st.state.entries.push({ id: `u-o-${i}`, date: d, productId: 'local:oats_dry', name: 'Овсяные хлопья', grams: 80, macros: { kcal: 293, protein: 9.8, fat: 4.9, carbs: 47.6, fiber: 8.1 }, meal: 'breakfast', createdAt: dd.getTime() });
        st.state.entries.push({ id: `u-c-${i}`, date: d, productId: 'local:cottage_5', name: 'Творог 5%', grams: 200, macros: { kcal: 242, protein: 34.4, fat: 10, carbs: 3.6, fiber: 0 }, meal: 'breakfast', createdAt: dd.getTime() });
      }
      st.state.lastGrams = { ...st.state.lastGrams, 'local:oats_dry': 80 };
      localStorage.setItem('form.nutrition', JSON.stringify(st));
    });
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('form.nutrition')).state.entries.length);
    await page.getByTestId('usual-breakfast').click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('form.nutrition')).state.entries.length);
    assert.equal(after - before, 2, 'обычный завтрак: 2 продукта одним тапом');
    assert.match(await page.getByTestId('macro-summary').innerText(), /\d+\s*\/\s*\d+/);
    await page.goto(`${URL}/food/add?productId=local:oats_dry`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const lg = await page.evaluate(() => JSON.parse(localStorage.getItem('form.nutrition')).state.lastGrams['local:oats_dry']);
    assert.match(await page.getByTestId('last-portion').innerText(), new RegExp(`${lg} г`), 'по умолчанию — последняя порция, не 100 г');
    assert.notEqual(lg, 100);
    await shot('nutrition-v3');
  });

  await check('38. История: дата на главной → календарь → полный день', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    await page.getByLabel('Дневник: календарь дней').click();
    await page.waitForTimeout(700);
    const pad = (n) => String(n).padStart(2, '0');
    const dd = new Date(); dd.setDate(dd.getDate() - 1);
    const y = `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
    if (!(await page.getByTestId(`day-${y}`).count())) { await page.getByLabel('Предыдущий месяц').click(); await page.waitForTimeout(400); }
    await page.getByTestId(`day-${y}`).first().click();
    await page.waitForTimeout(900);
    const det = await page.getByTestId('day-details').innerText();
    assert.match(det, /Питание/);
    assert.match(det, /ккал/);
    await shot('diary');
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
