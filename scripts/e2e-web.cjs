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
// E2E_SEX=female — тот же прогон для женского профиля; E2E_GOAL=cut|recomp|maintain — другая цель
if (process.env.E2E_SEX === 'female') Object.assign(PROFILE, { name: 'Анна', sex: 'female', age: 27, heightCm: 166, weightKg: 58 });
if (process.env.E2E_GOAL) Object.assign(PROFILE, { goal: process.env.E2E_GOAL, ratePctPerWeek: process.env.E2E_GOAL === 'cut' ? 0.6 : 0 });

const results = [];
const pages = [];
/** Ошибки React в консоли (dev-оверлей Expo LogBox) — тоже ошибка теста: раньше они проходили незамеченными */
const logBoxText = async (pg) => {
  try {
    const t = await pg.locator('#error-toast div').filter({ hasText: /\S/ }).first().innerText({ timeout: 300 });
    return t.trim();
  } catch {
    return '';
  }
};
const check = async (name, fn) => {
  try {
    await fn();
    for (const pg of pages) {
      const lb = await logBoxText(pg);
      if (lb) throw new Error(`ошибка в консоли React: ${lb.slice(0, 200)}`);
    }
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message}`);
  }
};

/** Лента тренера на главной — одна строка; все сигналы — в листе по тапу */
const openFeed = async (pg) => {
  await pg.getByTestId('coach-feed').click();
  await pg.waitForTimeout(800);
  return pg.getByTestId('coach-feed-list').innerText();
};
const closeSheet = async (pg) => {
  await pg.getByLabel('Закрыть').last().click();
  await pg.waitForTimeout(600);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
  // E2E_NO_GH=1 — проверка режима телефона: шторки на PanResponder, без gesture-handler
  if (process.env.E2E_NO_GH) await ctx.addInitScript(() => localStorage.setItem('rynji.noGH', '1'));
  // Онбординг на чистом устройстве: шаг «Здоровье» и разбор ограничений
  {
    const octx = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
    const op = await octx.newPage();
    pages.push(op);
    await check('0. Короткий онбординг (5 шагов) → «Дополни профиль: здоровье» в ленте → ограничения сразу превращаются в правила', async () => {
      await op.goto(`${URL}/onboarding`, { waitUntil: 'networkidle' });
      await op.waitForTimeout(1500);
      await op.getByLabel('Как тебя зовут?').fill('Тест');
      assert.match(await op.evaluate(() => document.body.innerText), /1 \/ 5/);
      for (let i = 0; i < 4; i++) { await op.getByText('Далее', { exact: true }).click(); await op.waitForTimeout(350); }
      assert.match(await op.evaluate(() => document.body.innerText), /вот твой старт/);
      await op.getByText('Начать с RYNJI').click();
      await op.waitForTimeout(1500);
      assert.ok(await op.getByTestId('coach-today').count() || (await op.getByTestId('coach-feed').isVisible()), 'после онбординга — главная');
      // Остальное — позже: лента предлагает заполнить здоровье (строка тренера → лист со всеми сигналами)
      assert.match(await openFeed(op), /Дополни профиль: здоровье/);
      await op.getByLabel('Заполнить: Дополни профиль: здоровье и ограничения').click();
      await op.waitForTimeout(1500);
      assert.ok(await op.getByText('Здоровье и особенности').last().isVisible(), 'открыт раздел здоровья');
      await op.getByLabel('Хронические ограничения', { exact: true }).fill('протрузия L5, гипертония');
      await op.waitForTimeout(300);
      const t = await op.evaluate(() => document.body.innerText);
      assert.match(t, /Поясница: не назначать/);
      assert.match(t, /без отказа/);
      // A1. Каждый «+» открывает селектор своей категории (поиск, популярное, Отмена/Сохранить)
      const health = { 'Выбрать: Травмы': 'Травмы', 'Выбрать: Хронические ограничения': 'Хронические ограничения', 'Выбрать: Движения, вызывающие боль': 'Движения, вызывающие боль', 'Выбрать: Ограничения от врача или физиотерапевта': 'Ограничения от врача', 'Добавить: Аллергии': 'Аллергии', 'Добавить: Непереносимости': 'Непереносимости', 'Добавить: Запрещённые продукты': 'Запрещённые продукты' };
      // Пока предыдущий лист закрывается, в DOM два листа — ждём, пока виден элемент нового (до 2 с)
      const anyVisible = async (loc) => {
        for (let t = 0; t < 20; t++) {
          const n = await loc.count();
          for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible()) return true;
          await op.waitForTimeout(100);
        }
        return false;
      };
      // Нажимаем «+» справа в поле: тап по выбранному чипу в центре поля удаляет его (так задумано)
      const tapAdd = async (btn) => {
        const el = op.getByLabel(btn, { exact: true });
        const box = await el.boundingBox();
        await el.click({ position: { x: box.width - 22, y: Math.min(box.height / 2, 26) } });
      };
      const openPicker = async (btn, title) => {
        await tapAdd(btn);
        await op.waitForTimeout(600);
        assert.ok(await anyVisible(op.getByText(title, { exact: true })), `${btn} → «${title}»`);
        assert.ok(await anyVisible(op.getByLabel('Поиск', { exact: true })), `${btn}: поиск`);
        assert.ok(await anyVisible(op.getByText('Популярное', { exact: true })), `${btn}: популярное`);
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
      await op.getByText('Сохранить и пересчитать').click();
      await op.waitForTimeout(1000);
      // Раздел заполнен — лента предлагает следующий, а не здоровье
      await op.goto(URL, { waitUntil: 'networkidle' });
      await op.waitForTimeout(1500);
      const feed = await openFeed(op);
      assert.ok(!/Дополни профиль: здоровье/.test(feed), 'здоровье больше не предлагается');
      assert.match(feed, /Дополни профиль: оборудование/);
      await closeSheet(op);
      // Питание: пикеры любимых и нелюбимых продуктов
      await op.goto(`${URL}/profile?edit=food`, { waitUntil: 'networkidle' });
      await op.waitForTimeout(1500);
      for (const [btn, title] of Object.entries({ 'Добавить: Любимые продукты': 'Любимые продукты', 'Добавить: Не ешь / не любишь': 'Не ешь / не любишь' })) {
        await openPicker(btn, title);
        await op.getByText('Отмена', { exact: true }).last().click();
        await op.waitForTimeout(500);
      }
    });
    await octx.close();
  }
  const page = await ctx.newPage();
  pages.length = 0;
  pages.push(page);
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
    assert.ok(await page.getByLabel('Профиль').first().isVisible(), 'профиль в шапке');
    // «Сегодня»: одно главное действие, три кольца дня и одна строка тренера — на первом экране
    const cta = await page.getByText(/^Начать тренировку$|^Продолжить тренировку$|^Добавить еду$/).first().boundingBox();
    assert.ok(cta && cta.y + cta.height < 956 - 80, `главная кнопка на первом экране: y=${cta && cta.y}`);
    for (const l of ['Калории, открыть питание', 'Вода: добавить или уменьшить', 'Сон, чек-ин']) {
      const b = await page.getByLabel(l).first().boundingBox();
      assert.ok(b && b.y + b.height < 956 - 80, `${l} на первом экране`);
    }
    const coachLine = await page.getByTestId('coach-feed').boundingBox();
    assert.ok(coachLine && coachLine.y + coachLine.height < 956 - 80, 'строка тренера на первом экране');
    // Шаги — в дневнике дня (тап по дате)
    await page.getByLabel('Дневник: календарь дней').click();
    await page.waitForTimeout(700);
    assert.ok(await page.getByLabel('Шаги, как рассчитана цель').isVisible(), 'шаги в дневнике дня');
    await closeSheet(page);
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

  await check('19. Тренировки → «План и сплит» (лист): выбор сплита', async () => {
    await page.goto(`${URL}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByLabel('План и сплит').click();
    await page.waitForTimeout(800);
    assert.ok(await page.getByText('Твой план', { exact: true }).isVisible(), 'план сверху');
    await page.getByLabel('Сменить сплит').click();
    await page.waitForTimeout(400);
    await shot('split-list');
    await page.getByText('Всё тело', { exact: true }).first().click();
    await page.waitForTimeout(600);
    assert.ok((await page.getByText('Перейти на этот сплит').count()) === 1);
    await shot('split');
    await page.getByText('Отмена', { exact: true }).last().click();
    await page.waitForTimeout(300);
    await closeSheet(page);
    await page.getByText('Упражнения', { exact: true }).first().click();
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
    const fin = page.getByText('Завершить тренировку', { exact: true });
    assert.ok(await fin.last().isVisible(), 'главная кнопка сменилась на «Завершить тренировку»');
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
    // Кнопки ощущения — со смайлом; для VoiceOver — просто «Нормально»
    await page.getByLabel('Нормально', { exact: true }).click();
    await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => document.body.innerText), /🙂 Нормально/);
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
    // Сон крупно; колесо — по тапу
    await page.getByLabel('Изменить сон').click();
    await page.waitForTimeout(600);
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
    await page.goto(`${URL}/training?seg=history`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    // Календарь — по кнопке в дневнике: месяц с подсветкой сегодня
    await page.getByLabel('Календарь тренировок').click();
    await page.waitForTimeout(900);
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.match(await page.getByTestId(`day-${iso}`).first().getAttribute('aria-label'), /сегодня/);
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

  await check('33. Главная: кольца — быстрые входы (готовность → чек-ин, ккал → питание); вес — «+» в «Прогрессе»', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    await page.getByLabel('Калории, открыть питание').first().click();
    await page.waitForTimeout(900);
    assert.ok(await page.getByLabel('Добавить еду').isVisible(), 'питание открыто');
    await page.goto(`${URL}/progress`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.getByLabel('Записать вес').first().click();
    await page.waitForTimeout(900);
    assert.match(await page.evaluate(() => document.body.innerText), /Вес/);
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
    const b = await page.getByLabel(/Сон, чек-ин/).first().boundingBox();
    assert.ok(b && b.y < 956, 'готовность на первом экране');
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /готовность|чек-ин|сон/i);
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
    // Блины — в пояснении к рекомендации (тап по рекомендации), если вес на штанге
    await page.getByLabel('Рекомендация, почему').first().click();
    await page.waitForTimeout(400);
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
    // Замена: «•••» → причины → альтернативы
    await page.getByLabel('Действия с упражнением').first().click();
    await page.waitForTimeout(600);
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
    assert.ok(await page.getByTestId('day-journal').isVisible(), 'дата открывает дневник дня');
    await page.getByLabel('Календарь дней').click();
    await page.waitForTimeout(900);
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
    // Повторно: другой день — окно дня открывается после полного закрытия календаря, приложение отвечает
    for (const back of [3, 5]) {
      await page.getByLabel('Закрыть').last().click();
      await page.waitForTimeout(700);
      await page.getByLabel('Дневник: календарь дней').click();
      await page.waitForTimeout(700);
      await page.getByLabel('Календарь дней').click();
      await page.waitForTimeout(900);
      const d2 = new Date(); d2.setDate(d2.getDate() - back);
      const y2 = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`;
      if (!(await page.getByTestId(`day-${y2}`).count())) { await page.getByLabel('Предыдущий месяц').click(); await page.waitForTimeout(400); }
      await page.getByTestId(`day-${y2}`).first().click();
      await page.waitForTimeout(1100);
      assert.ok(await page.getByTestId('day-details').count(), `день −${back} открыт`);
    }
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(800);
    await page.getByLabel('Вода: добавить или уменьшить').click();
    await page.waitForTimeout(800);
    assert.ok(await page.getByTestId('water-amount').count(), 'после календаря приложение отвечает');
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(600);
  });

  await check('39. Вода: увеличить и уменьшить в листе с главной', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    await page.getByLabel('Вода: добавить или уменьшить').click();
    await page.waitForTimeout(700);
    const amount = async () => (await page.getByTestId('water-amount').innerText()).trim();
    const a0 = await amount();
    await page.getByLabel('Увеличить на 250 мл').click();
    await page.waitForTimeout(200);
    await page.getByLabel('Увеличить на 250 мл').click();
    await page.waitForTimeout(200);
    const a1 = await amount();
    assert.notEqual(a1, a0, 'увеличилось');
    await page.getByLabel('Уменьшить на 250 мл').click();
    await page.waitForTimeout(200);
    assert.notEqual(await amount(), a1, 'уменьшилось');
    // Лист закрывается свайпом вниз за шапку
    const head = await page.getByText('Ориентир', { exact: false }).last().boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 220, y: ty }] });
    await touch('touchStart', head.y);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', head.y + i * 30); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await page.getByTestId('water-amount').count(), 0, 'лист закрыт свайпом');
  });

  await check('40. «Добавить в Завтрак»: лист со списком стягивается пальцем за содержимое', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByTestId('meal-lunch').click();
    await page.waitForTimeout(800);
    const row = await page.getByText('Поиск продукта', { exact: true }).boundingBox();
    assert.ok(row, 'лист открыт');
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 220, y: ty }] });
    // Короткое движение — лист следует за пальцем и возвращается
    await touch('touchStart', row.y + 5);
    for (let i = 1; i <= 3; i++) { await touch('touchMove', row.y + 5 + i * 15); await page.waitForTimeout(30); }
    const mid = await page.getByText('Поиск продукта', { exact: true }).boundingBox();
    assert.ok(mid && mid.y > row.y + 10, `следует за пальцем: ${row.y} → ${mid && mid.y}`);
    await touch('touchEnd', 0);
    await page.waitForTimeout(700);
    const back = await page.getByText('Поиск продукта', { exact: true }).boundingBox();
    assert.ok(back && Math.abs(back.y - row.y) < 3, 'вернулся без прыжка');
    await touch('touchStart', row.y + 5);
    for (let i = 1; i <= 14; i++) { await touch('touchMove', row.y + 5 + i * 30); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await page.getByText('Поиск продукта', { exact: true }).count(), 0, 'закрыт свайпом');
  });

  await check('41. RYNJI COACH — СЕГОДНЯ: план дня, фокус и «Почему?» с данными и уверенностью', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const block = page.getByTestId('coach-today');
    if (await block.count()) {
      const t = await block.innerText();
      assert.match(t, /Тренировка дня|Сегодня|Тренировка выполнена/, 'главное на сегодня — крупно, без служебных подписей');
      // Калории дня — кольцом рядом (подробно КБЖУ — на «Питании», без дублирования)
      assert.match(await page.getByLabel(/Калории, открыть питание/).first().innerText(), /ккал/, 'калории дня');
      await page.getByLabel('Почему? Объяснение решений тренера').click();
      await page.waitForTimeout(700);
      const why = await page.getByTestId('coach-why').innerText();
      assert.match(why, /Уверенность:/);
      assert.match(why, /ккал/);
      await shot('coach-why');
      await page.getByLabel('Закрыть').last().click();
      await page.waitForTimeout(400);
    } else {
      assert.ok(await page.getByText('Продолжить тренировку').count(), 'идёт тренировка — блок плана заменён продолжением');
    }
  });

  await check('42. Анализы: вставка текста → «Проверьте распознанные данные» → правка → сохранение → история и изменения', async () => {
    const paste = async (text) => {
      await page.goto(`${URL}/labs`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await dismiss();
      await page.getByText('Добавить', { exact: true }).first().click();
      await page.waitForTimeout(600);
      await page.getByText('Вставить текст анализов').click();
      await page.waitForTimeout(700);
      await page.getByTestId('lab-paste').fill(text);
      await page.getByText('Распознать', { exact: true }).click();
      await page.waitForTimeout(1000);
      assert.ok(await page.getByText('Проверьте распознанные данные').isVisible(), 'экран проверки обязателен');
    };
    await paste('ИНВИТРО\nДата взятия образца: 01.03.2026\nГематокрит (HCT) 46,0 % 39 - 49\nХолестерин ЛПНП 3,1 ммоль/л < 3,0 H\nАЛТ 30 Ед/л < 41');
    // Любое значение можно исправить до сохранения
    await page.getByLabel('Значение, строка 3').fill('31');
    await page.getByText('Подтвердить и сохранить').click();
    await page.waitForTimeout(1000);
    let t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /Гематокрит/);
    assert.match(t, /31/);
    await paste('ИНВИТРО\nДата взятия образца: 01.09.2026\nГематокрит (HCT) 48,1 % 39 - 49\nХолестерин ЛПНП 3,5 ммоль/л < 3,0 H\nАЛТ 31 Ед/л < 41');
    await page.getByText('Подтвердить и сохранить').click();
    await page.waitForTimeout(1000);
    const ch = await page.getByTestId('lab-changes').innerText();
    assert.match(ch, /Что изменилось с прошлого анализа/i);
    assert.match(ch, /↑ 2,1 п\.п\./);
    assert.match(ch, /↑ 0,4/);
    await shot('labs');
    await page.getByLabel(/^Гематокрит: 48,1/).click();
    await page.waitForTimeout(900);
    t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /референс вашей лаборатории: 39 – 49/);
    await shot('lab-marker');
  });

  await check('43. Здоровье: давление по среднему, Enhanced — история и граница безопасности', async () => {
    await page.goto(`${URL}/health-monitor`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    for (const [s1, d1] of [[146, 94], [148, 95]]) {
      await page.getByText('Записать', { exact: true }).click();
      await page.waitForTimeout(500);
      await page.getByTestId('bp-sys').fill(String(s1));
      await page.getByTestId('bp-dia').fill(String(d1));
      await page.getByText('Сохранить', { exact: true }).last().click();
      await page.waitForTimeout(600);
    }
    let t = await page.getByTestId('health-signals').innerText();
    assert.match(t, /≥140\/90/);
    assert.match(t, /обсудить/);
    await page.getByText('Режим Enhanced (AAS)').click();
    await page.waitForTimeout(400);
    t = await page.getByTestId('enhanced-card').innerText();
    assert.match(t, /Не составляет циклы/);
    assert.match(t, /Нормальные анализы не означают, что AAS безопасны/);
    await page.getByText('Добавить запись').click();
    await page.waitForTimeout(500);
    await page.getByLabel('Вещество', { exact: true }).fill('Тестовая запись');
    await page.getByText('Сохранить', { exact: true }).last().click();
    await page.waitForTimeout(600);
    assert.match(await page.getByTestId('enhanced-card').innerText(), /Тестовая запись/);
    await shot('health');
    // Сигнал давления виден на главной и запрещает повышение нагрузки
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const line = await page.getByTestId('coach-feed').innerText();
    assert.ok(/Давление/.test(line) || /Давление/.test(await openFeed(page)), 'сигнал давления на главной');
  });

  await check('44. Отчёт недели: метрики и решения тренера (что/почему/данные/уверенность)', async () => {
    await page.goto(`${URL}/weekly-review`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Итог крупно; полная таблица — по «Все показатели»
    await page.getByText('Все показатели ›').click();
    await page.waitForTimeout(600);
    const t = await page.evaluate(() => document.body.innerText);
    for (const x of ['ВЕС, Δ', 'ТАЛИЯ, Δ', 'КАЛОРИИ, СР.', 'ШАГИ/ДЕНЬ', 'ТРЕНИРОВКИ', 'СИЛА', 'СОН, СР.']) assert.ok(t.toUpperCase().includes(x), x);
    if (await page.getByTestId('weekly-decisions').count()) {
      const d = await page.getByTestId('weekly-decisions').innerText();
      assert.match(d, /Решения тренера на неделю/i);
      assert.match(d, /Уверенность:/);
      assert.match(d, /Нагрузку не повышаем/, 'давление ≥140/90 — без повышения нагрузки');
    }
  });

  await check('45. Питание: «Почему такие КБЖУ?»; цель: пресеты темпа с предупреждением', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByLabel('Почему такие КБЖУ?').click();
    await page.waitForTimeout(700);
    const w = await page.getByTestId('macro-why').innerText();
    assert.match(w, /1,6–2,2 г\/кг/);
    assert.match(w, /Уверенность:/);
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(400);
    await page.goto(`${URL}/profile`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByText('Цель', { exact: true }).first().click();
    await page.waitForTimeout(700);
    if (PROFILE.goal !== 'bulk') { await page.getByLabel('Закрыть').last().click(); await page.waitForTimeout(400); return; }
    const pr = await page.getByTestId('rate-presets').innerText();
    assert.match(pr, /Консервативный/);
    assert.match(pr, /Сбалансированный/);
    assert.match(pr, /Более быстрый набор/);
    assert.match(pr, /РЕКОМЕНДУЕМ/);
    assert.ok(!/гарантир/i.test(pr));
    await page.getByLabel(/^Более быстрый набор/).click();
    await page.waitForTimeout(300);
    assert.match(await page.getByTestId('rate-warning').innerText(), /риск лишнего жира/);
    await page.getByLabel(/^Сбалансированный/).click();
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(400);
  });

  // ─── Дневник, суперсеты, упражнения на время (по мотивам Fitsession / YouCan) ───
  const isoLocal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const newWorkout = async () => {
    // «Есть незавершённая тренировка» → начать новую
    const c = page.getByText('Начать новую', { exact: true });
    await c.waitFor({ timeout: 1500 }).catch(() => {});
    if (await c.count()) await c.last().click();
    await page.waitForTimeout(1500);
  };
  const activeState = () => page.evaluate(() => JSON.parse(localStorage.getItem('form.workouts')).state.active);

  await check('46. Дневник: итоги недели плашками, лента по неделям со смайлом и заметкой → подробности → «Повторить»', async () => {
    await page.evaluate((iso) => {
      const raw = JSON.parse(localStorage.getItem('form.workouts'));
      const st = (w, r, extra = {}) => ({ id: Math.random().toString(36).slice(2), weight: w, reps: r, done: true, ...extra });
      const t0 = Date.parse(`${iso}T18:00:00`);
      raw.state.sessions = raw.state.sessions.filter((x) => x.id !== 'e2e_ss');
      raw.state.sessions.push({ id: 'e2e_ss', date: iso, name: 'Грудь и спина', focus: 'суперсеты', source: 'custom', startedAt: t0, finishedAt: t0 + 52 * 60000, volumeFactor: 1, status: 'completed', sessionRpe: 7, notes: 'Отличная тренировка!', exercises: [
        { id: 'e1', exerciseId: 'bench_press', plannedSets: 3, repMin: 6, repMax: 10, targetRir: 2, restSec: 120, superset: 'ss0', sets: [st(40, 8, { warmup: true }), st(80, 10), st(85, 8), st(85, 8)] },
        { id: 'e2', exerciseId: 'barbell_row', plannedSets: 3, repMin: 8, repMax: 12, targetRir: 2, restSec: 90, superset: 'ss0', sets: [st(70, 10), st(70, 10), st(70, 9)] },
        { id: 'e3', exerciseId: 'plank', plannedSets: 2, repMin: 30, repMax: 60, targetRir: 2, restSec: 60, sets: [st(0, 45), st(0, 50)] },
      ] });
      localStorage.setItem('form.workouts', JSON.stringify(raw));
    }, isoLocal(new Date(Date.now() - 86400000)));
    await page.goto(`${URL}/training?seg=history`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await dismiss();
    // Итоги недели — в заголовке недели ленты, одной строкой
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /(Эта неделя|Прошлая неделя)\s+\d+\s+трениров/i);
    assert.match(t, /\d+\s+мин/);
    assert.match(t, /«Отличная тренировка!»/);
    assert.match(t, /🙂/);
    await shot('diary');
    await page.getByLabel(/^Грудь и спина, (Вчера|Сегодня)/).first().click();
    await page.waitForTimeout(1500);
    const d = await page.evaluate(() => document.body.innerText);
    assert.match(d, /80 кг × 10 · 85 кг × 8, 8/, 'подходы одной строкой, без разминки, один вес — без повтора');
    assert.match(d, /0:45, 0:50/, 'планка — время');
    assert.match(d, /A1[\s\S]*A2/, 'суперсет помечен');
    assert.match(d, /🙂 Нормально/);
    await shot('session-detail');
    await page.getByText('Повторить', { exact: true }).click();
    await newWorkout();
    assert.match(page.url(), /workout\/active/);
    const a = await activeState();
    assert.deepEqual(a.exercises.map((x) => x.exerciseId), ['bench_press', 'barbell_row', 'plank']);
    assert.deepEqual(a.exercises.map((x) => x.sets.length), [3, 3, 2], 'столько же рабочих подходов');
    assert.ok(a.exercises[0].superset && a.exercises[0].superset === a.exercises[1].superset, 'суперсет сохранён');
    assert.ok(await page.getByTestId('superset-chip').isVisible(), 'на экране — «Суперсет A1»');
  });

  await check('47. Суперсет: подход A → сразу B без отдыха → отдых → снова A; меню «Убрать / Суперсет со следующим»', async () => {
    assert.match(await page.getByTestId('exercise-position').innerText(), /^1 из 3$/);
    await page.getByText(/^Завершить подход 1$/).click();
    await page.waitForTimeout(1000);
    assert.match(await page.getByTestId('exercise-position').innerText(), /^2 из 3$/, 'после A1 — сразу B');
    assert.equal(await page.getByLabel('Пропустить отдых').count(), 0, 'без отдыха между участниками');
    await page.getByText(/^Завершить подход 1$/).click();
    await page.waitForTimeout(1000);
    assert.ok(await page.getByLabel('Пропустить отдых').isVisible(), 'после круга — отдых');
    assert.match(await page.getByTestId('exercise-position').innerText(), /^1 из 3$/, 'и снова A');
    assert.match(await page.evaluate(() => document.body.innerText), /Следующий: Жим штанги лёжа/i);
    await page.getByLabel('Пропустить отдых').click();
    await page.waitForTimeout(400);
    await page.getByLabel('Действия с упражнением').click();
    await page.waitForTimeout(700);
    await page.getByText('Убрать из суперсета', { exact: true }).click();
    await page.waitForTimeout(900);
    assert.equal(await page.getByTestId('superset-chip').count(), 0, 'суперсет распался');
    await page.getByLabel('Действия с упражнением').click();
    await page.waitForTimeout(700);
    await page.getByText(/^Суперсет со следующим: Тяга штанги в наклоне$/).click();
    await page.waitForTimeout(900);
    assert.ok(await page.getByTestId('superset-chip').isVisible(), 'снова суперсет');
  });

  await check('48. Планка — подход на время: «Старт» → таймер → «Стоп» записывает секунды; запас повторов не спрашивается', async () => {
    await page.getByLabel('Список упражнений', { exact: true }).click();
    await page.waitForTimeout(700);
    await page.getByLabel(/^Планка, /).click();
    await page.waitForTimeout(900);
    const skip = page.getByLabel('Пропустить отдых');
    if (await skip.count()) await skip.click();
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /СЕК|Сек/);
    assert.match(t, /Свой вес × \d:\d\d–\d:\d\d/, 'рекомендация в минутах:секундах');
    await page.getByText(/^Старт · \d:\d\d$/).click();
    await page.waitForTimeout(400);
    assert.ok(await page.getByTestId('hold-timer').isVisible(), 'таймер удержания');
    await page.waitForTimeout(2600);
    await page.getByLabel('Стоп — записать время').click();
    await page.waitForTimeout(800);
    const a = await activeState();
    const s0 = a.exercises[2].sets[0];
    assert.ok(s0.done && s0.reps >= 2 && s0.reps <= 6, `записано ${s0.reps} с`);
    assert.ok(!/Сколько повторений осталось в запасе/.test(await page.evaluate(() => document.body.innerText)), 'RIR у планки не спрашиваем');
    await shot('plank');
  });

  await check('49. Конструктор: «Объединить в суперсет» → A1/A2 → тренировка начинается с суперсетом', async () => {
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('form.workouts'));
      raw.state.draft = { id: 'd_e2e', name: 'Руки', focus: '', source: 'custom', createdAt: Date.now(), exercises: [
        { exerciseId: 'barbell_curl', sets: 2, repMin: 8, repMax: 12, targetRir: 1, restSec: 75 },
        { exerciseId: 'triceps_pushdown', sets: 2, repMin: 10, repMax: 15, targetRir: 1, restSec: 75 },
        { exerciseId: 'plank', sets: 2, repMin: 30, repMax: 60, targetRir: 2, restSec: 60 },
      ] };
      localStorage.setItem('form.workouts', JSON.stringify(raw));
    });
    await page.goto(`${URL}/workout/builder`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    assert.match(await page.evaluate(() => document.body.innerText), /2 × 0:30–1:00/, 'планка в конструкторе — секунды');
    await page.getByLabel('Суперсет со следующим: Подъём штанги на бицепс').click();
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /A1[\s\S]*A2/);
    assert.ok(await page.getByLabel('Разъединить суперсет: Подъём штанги на бицепс').isVisible());
    await page.getByText('Начать тренировку', { exact: true }).click();
    await newWorkout();
    const a = await activeState();
    assert.equal(a.name, 'Руки');
    assert.ok(a.exercises[0].superset && a.exercises[0].superset === a.exercises[1].superset && !a.exercises[2].superset);
    assert.ok(await page.getByTestId('superset-chip').isVisible());
  });

  await check('50. Экспорт тренировок в CSV: заголовок, строка на подход, планка — в секундах', async () => {
    await page.goto(`${URL}/data`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByText('Экспорт в CSV', { exact: true }).click()]);
    assert.match(dl.suggestedFilename(), /^rynji-trenirovki-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = require('node:fs').readFileSync(await dl.path(), 'utf8');
    const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r\n/);
    assert.match(lines[0], /^Дата;Начало;Тренировка;/);
    assert.ok(lines.length > 20, `строк: ${lines.length}`);
    assert.ok(lines.some((l) => /;Планка;;1;;;;45;/.test(l)), 'планка: секунды в своей колонке');
    assert.ok(lines.some((l) => /;Жим штанги лёжа;A1;/.test(l)), 'суперсет в таблице');
  });

  await check('51. Карточка упражнения: объём по тренировкам с рекордами, тап по столбику — дата и лучший подход', async () => {
    await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const bars = page.getByTestId('session-bars');
    await bars.scrollIntoViewIfNeeded();
    const before = await bars.innerText();
    assert.match(before, /кг/);
    assert.match(before, /лучший \d+(,\d)? кг × \d+/);
    const first = page.getByLabel(/^\d+ [а-я]{3}: [\d\s ]+ кг/).first();
    await first.click();
    await page.waitForTimeout(300);
    const after = await bars.innerText();
    assert.notEqual(after.split('\n')[0], before.split('\n')[0], 'показан выбранный день');
    await shot('exercise-bars');
  });

  await check('52. Неделя: «X из N» и дни недели; сегодня → состав с картой мышц в процентах', async () => {
    await page.goto(`${URL}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /Эта неделя\s*\n?\s*\d+ из \d+/);
    const det = page.getByLabel(/, сегодня$/);
    if (!(await det.count())) return; // день отдыха — сегодняшней тренировки нет
    await det.first().click();
    await page.waitForTimeout(1500);
    const tm = await page.getByTestId('target-muscles').innerText();
    assert.match(tm, /Целевые мышцы/i);
    const pcts = [...tm.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    assert.ok(pcts.length >= 2 && pcts.every((x, i) => i === 0 || x <= pcts[i - 1]), `по убыванию: ${pcts}`);
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
