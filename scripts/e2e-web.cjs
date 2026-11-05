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
// E2E_ONLY=31,59 — прогнать только эти сценарии (для отладки; полный прогон — без переменной)
const ONLY = (process.env.E2E_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
const check = async (name, fn) => {
  if (ONLY.length && !ONLY.includes(name.split('.')[0])) return;
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

/** Ответ тренера «печатается» (R1): ждём, пока исчезнут точки набора и текст допечатается */
const waitReply = async (pg, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!(await pg.getByTestId('coach-typing').count()) && !(await pg.getByTestId('coach-typing-reply').count())) return;
    await pg.waitForTimeout(200);
  }
  throw new Error('ответ тренера не допечатался');
};
/** Сигналы тренера — по колокольчику на главной (R1: главная без прокрутки, отдельной карточки совета нет) */
const openFeed = async (pg) => {
  await pg.getByTestId('home-bell').click();
  await pg.waitForTimeout(800);
  return pg.getByTestId('coach-feed-list').innerText();
};
/** Первый запуск: приветствие → вход (в браузере Apple ID нет — dev-обход) → 5 этапов анкеты по эталонам (каждый ответ — вручную) → «Твой план готов!» */
const passQuestionnaire = async (pg, name = 'Тест') => {
  const body = () => pg.evaluate(() => document.body.innerText);
  const next = async (title = 'Продолжить') => { await pg.getByRole('button', { name: title, exact: true }).press('Enter'); await pg.waitForTimeout(450); };
  const disabled = async () => (await pg.getByRole('button', { name: 'Продолжить', exact: true }).getAttribute('aria-disabled')) === 'true';
  await pg.goto(URL, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1500);
  assert.match(await body(), /Тренировки под твои цели\./);
  assert.match(await body(), /Персональная программа, питание и восстановление — в одной системе\./);
  await pg.getByText('Начать', { exact: true }).click();
  await pg.waitForTimeout(800);
  assert.match(await body(), /Вход/);
  // Вход можно пропустить (решение владельца, раунд 1)
  await pg.getByTestId('auth-skip').click();
  await pg.waitForTimeout(1000);
  // 1 из 5 — имя
  assert.match(await body(), /1 из 5[\s\S]*Как тебя зовут\?[\s\S]*Так я буду к тебе обращаться/);
  assert.ok(await disabled(), 'без имени дальше нельзя');
  await pg.getByLabel('Как тебя зовут?').fill(name);
  await next();
  // 2 из 5 — пол → возраст → рост → вес, ничего не подставлено
  assert.match(await body(), /2 из 5[\s\S]*Твой пол\?/);
  assert.ok(await disabled());
  await pg.getByLabel(PROFILE.sex === 'female' ? 'Женщина' : 'Мужчина').click();
  await next();
  assert.match(await body(), /Сколько тебе лет\?[\s\S]*Только для пользователей 18\+/);
  // Барабан: «+» сверху, «−» снизу, без поля ручного ввода; пока не тронули — значение не выбрано
  assert.equal(await pg.getByLabel('Возраст, лет').count(), 0, 'поля ручного ввода нет');
  assert.equal((await pg.getByTestId('q-age-value').innerText()).trim(), '25', 'возраст не подставлен — стартовое приглушённо');
  assert.ok(await disabled());
  for (let i = 0; i < PROFILE.age - 25; i++) await pg.getByTestId('q-age-plus').click();
  assert.equal((await pg.getByTestId('q-age-value').innerText()).trim(), `${PROFILE.age} лет`);
  await next();
  assert.match(await body(), /Какой у тебя рост\?/);
  assert.equal(await pg.getByLabel('Рост, см').inputValue(), '', 'рост не подставлен');
  // линейка: «+» с пустого значения ставит отметку шкалы, затем точное значение с клавиатуры
  await pg.getByLabel('Рост: больше', { exact: true }).click();
  assert.ok(!(await disabled()), 'после выбора на линейке — можно дальше');
  await pg.getByLabel('Рост, см').fill(String(PROFILE.heightCm));
  await next();
  assert.match(await body(), /Сколько ты весишь\?/);
  assert.equal(await pg.getByLabel('Текущий вес, кг').inputValue(), '', 'вес не подставлен');
  await pg.getByLabel('Текущий вес, кг').fill(String(PROFILE.weightKg).replace('.', ','));
  await pg.getByLabel('Текущий вес: больше', { exact: true }).click();
  await pg.getByLabel('Текущий вес: меньше', { exact: true }).click();
  await next();
  // 3 из 5 — цель: четыре иллюстрированные карточки, без целевого веса и сроков
  assert.match(await body(), /3 из 5[\s\S]*Твоя цель\?[\s\S]*Набор массы[\s\S]*Увеличить мышечную массу[\s\S]*Сушка[\s\S]*Рекомпозиция[\s\S]*Поддержание/);
  assert.doesNotMatch(await body(), /Целевой вес|срок|темп/i, 'целевой вес, срок и темп не спрашиваем');
  assert.equal(await pg.locator('img').count() >= 4, true, 'у карточек целей есть изображения');
  await pg.getByLabel(PROFILE.goal === 'cut' ? 'Сушка' : PROFILE.goal === 'recomp' ? 'Рекомпозиция' : PROFILE.goal === 'maintain' ? 'Поддержание' : 'Набор массы').click();
  await next();
  // 4 из 5 — опыт → раз в неделю → длительность → место
  assert.match(await body(), /4 из 5[\s\S]*Опыт тренировок\?[\s\S]*Новичок[\s\S]*Нет опыта или до 6 месяцев[\s\S]*Опытный/);
  await pg.getByLabel('Средний', { exact: true }).click();
  await next();
  assert.match(await body(), /Сколько раз в неделю планируешь тренироваться\?/);
  assert.ok(await disabled(), 'частота не выбрана за человека');
  await pg.getByLabel('4 раза в неделю', { exact: true }).click();
  await pg.getByLabel('Реже', { exact: true }).click();
  assert.equal((await pg.getByTestId('q-freq-value').innerText()).trim(), '3', '−/+ меняют частоту');
  await next();
  assert.match(await body(), /30 минут[\s\S]*45 минут[\s\S]*60 минут[\s\S]*90 минут/);
  await pg.getByLabel('60 минут', { exact: true }).click();
  await next();
  assert.match(await body(), /В зале[\s\S]*Дома[\s\S]*На улице[\s\S]*Комбинированно/);
  await pg.getByLabel('В зале', { exact: true }).click();
  await next();
  // 5 из 5 — образ жизни: выпадающие списки, «Дополнительно» необязательно
  assert.match(await body(), /5 из 5[\s\S]*Расскажи о своём образе жизни/);
  const pick = async (field, option) => {
    await pg.getByTestId(field).click();
    await pg.waitForTimeout(600);
    await pg.getByRole('radio', { name: option, exact: true }).last().click();
    await pg.waitForTimeout(600);
  };
  await pick('q-activity', 'Умеренный');
  await pick('q-sleep', '7–8 часов');
  await pick('q-diet', 'Нет');
  await next('Завершить анкету');
  await pg.waitForTimeout(800);
  // «Твой план готов!» — реальные калории и программа
  assert.match(await body(), /Твой план готов!/);
  assert.match(await pg.getByTestId('plan-kcal').innerText(), /^\d[\d\s ]*$/);
  assert.match(await body(), /Белки[\s\S]*Жиры[\s\S]*Углеводы[\s\S]*3× в неделю/);
  assert.match(await body(), /Программа тренировок[\s\S]*Персональное КБЖУ[\s\S]*Рекомендации по восстановлению/);
  await pg.getByText('Открыть мой план', { exact: true }).click();
  await pg.waitForTimeout(1500);
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
    await check('0. Приветствие → вход (без Apple ID в браузере) → анкета 5 этапов без подставленных значений → главная; здоровье — правила', async () => {
      await passQuestionnaire(op);
      assert.ok(await op.getByTestId('coach-today').count() || (await op.getByTestId('home-bell').isVisible()), 'после анкеты — главная');
      // Остальное — позже: лента предлагает рассказать о еде (колокольчик → лист со всеми сигналами)
      assert.match(await openFeed(op), /Дополни профиль: что любишь есть/);
      await closeSheet(op);
      await op.goto(`${URL}/profile?edit=health`, { waitUntil: 'networkidle' });
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
      assert.ok(!/Дополни профиль: здоровье|Дополни профиль: оборудование/.test(feed), 'здоровье и оборудование уже спрошены анкетой');
      assert.match(feed, /Дополни профиль: что любишь есть/);
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
  await page.getByRole('button', { name: 'Тренировки', exact: true }).click();
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
      // День отдыха: «Тренировки» → «+» справа вверху → «Начать тренировку» → «Повторить тренировку»
      await page.getByRole('tab', { name: /^Тренировки/ }).click();
      await page.waitForTimeout(900);
      await page.getByTestId('training-plus').click();
      await page.waitForTimeout(700);
      await page.getByTestId('hub-start').click();
      await page.waitForTimeout(500);
      await page.getByTestId('hub-repeat').click();
      await page.waitForTimeout(500);
      await page.getByTestId('hub-repeat-list').getByRole('button').first().click();
      await page.waitForTimeout(1500);
      const go = page.getByText(/^Начать тренировку$/);
      if (!/workout\/active/.test(page.url()) && (await go.count())) await go.first().click();
    }
    await page.waitForTimeout(1500);
    assert.match(await page.getByTestId('exercise-position').innerText(), /^1\/\d/);
    const n = await page.getByLabel(/^Записать подход \d$/).count();
    assert.equal(n, 1);
  });

  await check('7. Назад к предыдущему упражнению — подходы сохраняются', async () => {
    await page.getByLabel(/^Записать подход 1$/).click();
    await page.waitForTimeout(500);
    await page.getByText('Пропустить').click().catch(() => {});
    await page.getByLabel('Следующее упражнение').click();
    await page.waitForTimeout(600);
    assert.match(await page.getByTestId('exercise-position').innerText(), /^2\/\d/);
    await page.getByLabel('Предыдущее упражнение').click();
    await page.waitForTimeout(600);
    assert.match(await page.getByTestId('exercise-position').innerText(), /^1\/\d/);
    assert.equal(await page.getByLabel('Отменить выполнение подхода').count(), 1);
  });

  await check('8. Перезагрузка — тренировка и позиция восстанавливаются', async () => {
    await page.getByLabel('Следующее упражнение').click();
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await page.goto(`${URL}/workout/active`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    assert.match(await page.getByTestId('exercise-position').innerText(), /^2\/\d/);
    await page.getByLabel('Предыдущее упражнение').click();
    await page.waitForTimeout(600);
    assert.equal(await page.getByLabel('Отменить выполнение подхода').count(), 1);
  });

  await check('6. Все упражнения — шторкой по «1/8 ▾» в шапке: выполнено / текущее / впереди; крупное время сверху', async () => {
    const clock = await page.getByTestId('workout-elapsed').boundingBox();
    assert.ok(clock && clock.y < 80 && clock.height >= 24, `время тренировки — крупно сверху: y=${clock && clock.y}, h=${clock && clock.height}`);
    await page.getByLabel('Список упражнений', { exact: true }).click();
    await page.waitForTimeout(700);
    assert.ok(await page.getByTestId('workout-list').isVisible(), 'шторка со списком');
    assert.ok((await page.getByLabel(/, текущее$/).count()) === 1);
    assert.ok((await page.getByLabel(/, впереди$/).count()) >= 1);
    await page.mouse.click(20, 60);
    await page.waitForTimeout(600);
    assert.equal(await page.getByTestId('workout-list').count(), 0, 'закрыта тапом по фону');
  });

  await check('15. Экран подхода как на образце: название по центру, мышцы, подходы; внизу карточки — заметка, фото техники и «i»', async () => {
    await page.goto(`${URL}/workout/active`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const tech = await page.getByLabel('Техника выполнения').boundingBox();
    // Как на образце владельца: без «прошлый раз», целей и подсветки — только название, мышцы и подходы
    for (const gone of ['last-result', 'rynji-suggestion']) assert.equal(await page.getByTestId(gone).count(), 0, `${gone} — в «i», не на экране`);
    assert.equal(await page.getByTestId(/^set-goal-\d+$/).count(), 0, 'без подписей целей над подходами');
    const cta = await page.getByLabel(/^Записать подход \d$|^Разминка — готово$|^Далее: |^Завершить тренировку$|^Старт · /).first().boundingBox();
    assert.ok(tech && cta && tech.y < cta.y, `миниатюра техники — в карточке над панелью: ${tech && tech.y} < ${cta && cta.y}`);
    assert.ok(cta.y + cta.height <= 956, `главная кнопка на экране: y=${cta.y}`);
    assert.ok(await page.getByTestId('exercise-muscles').isVisible(), 'мышцы под названием');
    assert.equal(await page.getByTestId('technique-inline').count(), 0, 'без блока техники на экране');
    const main = await page.evaluate(() => document.body.innerText);
    assert.ok(!/Положение тела|Частые ошибки/.test(main), 'техника не на основном экране');
    assert.match(await page.getByTestId('exercise-position').innerText(), /^\d+\/\d+$/);
    await shot('workout');
  });

  await check('16. Шторка «Все упражнения» закрывается свайпом вниз', async () => {
    await page.getByLabel('Список упражнений', { exact: true }).click();
    await page.waitForTimeout(700);
    const head = await page.getByText('Упражнения', { exact: true }).last().boundingBox();
    assert.ok(head, 'шторка открыта');
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y: ty }] });
    await touch('touchStart', head.y + 5);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', head.y + 5 + i * 30); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await page.getByTestId('workout-list').count(), 0, 'шторка закрыта');
  });

  await check('16б. Техника — отдельной шторкой по фото упражнения: без заглушек, закрывается', async () => {
    await page.getByLabel('Техника выполнения').click();
    await page.waitForTimeout(800);
    assert.ok(await page.getByTestId('technique-inline').isVisible(), 'шторка техники открыта');
    assert.equal(await page.getByText(/появится/).count(), 0, 'нет заглушек «появится позже»');
    assert.match(await page.getByTestId('technique-inline').innerText(), /Положение тела/);
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(600);
    assert.equal(await page.getByTestId('technique-inline').count(), 0, 'шторка закрыта');
  });

  await check('22. Тренировки → «Программы»: неделя сверху, объём — шторкой', async () => {
    await page.goto(`${URL}/training?seg=program`, { waitUntil: 'networkidle' });
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

  await check('17. «Сегодня» на одном экране: заголовок и дата, колокольчик (сигналы), карточка тренировки, питание, три кольца — шаги, сон, неделя', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    assert.equal(await page.getByRole('button', { name: 'Профиль', exact: true }).count(), 0, 'профиля в шапке нет');
    assert.ok(await page.getByRole('tab', { name: 'Профиль' }).isVisible(), 'профиль — нижняя вкладка');
    const tabs = await page.getByRole('tab').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || '').split(',')[0]));
    assert.deepEqual(tabs, ['Сегодня', 'Тренировки', 'Питание', 'Прогресс', 'Профиль'], 'пять вкладок, без центрального «+»');
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /^Сегодня\s+(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье), \d+ /m, 'заголовок и дата');
    const cta = await page.getByTestId('coach-today').getByRole('button', { name: /Начать тренировку|Продолжить тренировку|Итоги|Заполнить анкету/ }).first().boundingBox().catch(() => null);
    const card = await page.getByTestId('coach-today').boundingBox();
    assert.ok(card && card.y + card.height < 956 - 80, `карточка тренировки на первом экране: y=${card && card.y}`);
    if (cta) assert.ok(cta.y + cta.height < 956 - 80, 'главная кнопка на первом экране');
    assert.ok(await page.getByTestId('home-bell').isVisible(), 'колокольчик — сигналы тренера');
    // Без дублей: нет плиток «Калории/Белки», веса, воды и манекена на главной
    for (const gone of ['home-protein', 'home-weight', 'home-steps-week']) assert.equal(await page.getByTestId(gone).count(), 0, `${gone} убран`);
    assert.equal(await page.getByLabel(/^Вода/).count(), 0, 'вода — только в «Питании»');
    assert.equal(await page.locator('img[src*="home_hero"]').count(), 0, 'без манекена');
    assert.match(await page.getByTestId('home-nutrition').innerText(), /из [\d\s\u202f]+ ккал[\s\S]*Белки[\s\S]*Жиры[\s\S]*Углеводы/, 'питание: ккал и Б/Ж/У');
    // Три кольца дня: шаги, сон, тренировки недели (R1)
    assert.ok(await page.getByTestId('home-rings').isVisible(), 'кольца дня');
    for (const l of [/^Шаги/, /^Сон/, /^Тренировки за неделю: \d+/, /^Калории: .*Открыть питание$/]) assert.ok(await page.getByLabel(l).count(), `${l}`);
    // Всё на одном экране: кольца над таб-баром, совета-карточки нет (сигналы — по колокольчику)
    const rings = await page.getByTestId('home-rings').boundingBox();
    assert.ok(rings && rings.y + rings.height < 956 - 80, `кольца на первом экране: низ ${rings && rings.y + rings.height}`);
    assert.equal(await page.getByTestId('coach-feed').count(), 0, 'отдельной карточки совета нет');
    assert.match(await openFeed(page), /./, 'сигналы — в листе по колокольчику');
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(500);
    // Кольцо недели ведёт в «Тренировки»
    await page.getByTestId('home-week').click();
    await page.waitForTimeout(900);
    assert.equal(await page.getByTestId('tab-bar').getByRole('tab', { name: /^Тренировки/ }).getAttribute('aria-selected'), 'true', 'кольцо недели → тренировки');
    await page.getByRole('tab', { name: 'Сегодня' }).click();
    await page.waitForTimeout(700);
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

  await check('19. Тренировки → «Программы» → «План и сплит» (лист): выбор сплита; библиотека — отдельный экран', async () => {
    await page.goto(`${URL}/training?seg=program`, { waitUntil: 'networkidle' });
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
    await page.getByLabel('Библиотека упражнений', { exact: true }).click();
    await page.waitForTimeout(1200);
    assert.match(page.url(), /\/library/);
    assert.match(await page.evaluate(() => document.body.innerText), /Библиотека упражнений[\s\S]*114 упражнений/);
    await shot('library');
  });

  await check('20. Коуч отвечает локально, без настройки', async () => {
    await page.goto(`${URL}/coach`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    assert.equal(await page.getByText(/Настрой|подключи/i).count(), 0);
    // Как живой человек: сначала «печатает…» с точками, потом текст появляется постепенно
    await page.getByLabel('Сообщение тренеру').fill('сколько белка мне нужно');
    await page.getByLabel('Отправить').click();
    await page.waitForTimeout(250);
    assert.ok(await page.getByTestId('coach-typing').count(), 'точки набора');
    assert.match(await page.evaluate(() => document.body.innerText), /RYNJI печатает…/);
    await waitReply(page);
    assert.match(await page.evaluate(() => document.body.innerText), /г\/кг/i);
    // Здоровье и безопасность — без «печати», сразу целиком
    await page.getByLabel('Сообщение тренеру').fill('можно ли тренироваться при простуде');
    await page.getByLabel('Отправить').click();
    await waitReply(page);
    assert.match(await page.evaluate(() => document.body.innerText), /врач/i);
    await shot('coach');
  });

  await check('23. Тренер: «что мне сегодня делать» и программа на мышцу — с кнопками', async () => {
    await page.goto(`${URL}/coach`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByLabel('Сообщение тренеру').fill('Что мне сегодня делать?');
    await page.getByLabel('Отправить').click();
    await waitReply(page);
    const t = await page.evaluate(() => document.body.innerText);
    assert.ok(!/Пройди утренний чек-ин/.test(t), 'не требует чек-ин');
    assert.ok(/Начать тренировку|Тренировка вне плана|уже сделана/.test(t), 'есть действие');
    await page.getByLabel('Сообщение тренеру').fill('хочу упражнение на верх груди');
    await page.getByLabel('Отправить').click();
    // Тап по печатающемуся ответу — показать целиком сразу
    await page.waitForTimeout(1800);
    if (await page.getByTestId('coach-typing-reply').count()) await page.getByTestId('coach-typing-reply').click();
    await waitReply(page, 3000);
    assert.ok(await page.getByText('Начать эту тренировку').last().isVisible());
    await shot('coach-target');
  });

  await check('24. «Тренировки»: «+» справа вверху — запланировать / начать (новая, повтор); шторка закрывается свайпом; «Тренировать сейчас» на карточке', async () => {
    await page.goto(`${URL}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    assert.equal(await page.getByLabel('Тренировка: начать, сгенерировать или собрать').count(), 0, 'центрального «+» нет');
    const plus = await page.getByTestId('training-plus').boundingBox();
    assert.ok(plus && plus.x > 300 && plus.y < 160, `«+» справа вверху: ${plus && plus.x},${plus && plus.y}`);
    await page.getByTestId('training-plus').click();
    await page.waitForTimeout(800);
    assert.match(await page.getByTestId('hub-root').innerText(), /Запланировать тренировку[\s\S]*Начать тренировку/);
    await page.getByTestId('hub-start').click();
    await page.waitForTimeout(500);
    assert.match(await page.getByTestId('hub-start').innerText(), /Новая тренировка[\s\S]*Повторить тренировку/);
    const card = await page.getByTestId('hub-new').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 220, y: ty }] });
    await touch('touchStart', card.y + 10);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', card.y + 10 + i * 25); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await page.getByTestId('hub-new').count(), 0, 'шторка закрыта свайпом');
    await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    assert.ok(await page.getByText('Тренировать сейчас').isVisible());
  });

  await check('21. Оформление: после смены темы «Назад» ведёт в профиль, затем на главную', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByRole('tab', { name: 'Профиль' }).click();
    await page.waitForTimeout(800);
    await page.getByText('Темы и акцентные цвета', { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByText('Синий', { exact: true }).last().click();
    await page.waitForTimeout(1500);
    assert.ok(await page.getByText('Оформление', { exact: true }).last().isVisible(), 'остались на «Оформлении»');
    await page.getByLabel('Назад').last().click();
    await page.waitForTimeout(900);
    const visible = async (txt) => { for (const el of await page.getByText(txt).all()) if (await el.isVisible()) return true; return false; };
    assert.ok(!(await visible('Выбор сохраняется на устройстве')), 'один «Назад» уходит с «Оформления»');
    assert.ok(await visible('Темы и акцентные цвета'), 'вернулись в профиль');
    assert.equal(await page.getByRole('tab', { name: 'Профиль' }).getAttribute('aria-selected'), 'true', 'профиль — вкладка');
    await page.getByRole('tab', { name: 'Сегодня' }).click();
    await page.waitForTimeout(900);
    assert.ok(await page.getByTestId('home-rings').isVisible(), 'вкладка «Сегодня»');
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
    const rows = () => page.locator('[data-testid^="set-row-"]').count();
    assert.equal(await rows(), 2);
    await page.getByLabel('Добавить подход', { exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(await rows(), 3);
    await page.getByLabel('Действия с упражнением').click();
    await page.waitForTimeout(600);
    await page.getByLabel('Убрать подход', { exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(await rows(), 2);
  });

  await check('26. Последний подход → «Завершить тренировку» → подтверждение → итог с «Поднято, кг» и калориями', async () => {
    for (let i = 0; i < 6; i++) {
      const b = page.getByLabel(/^Записать подход \d+$/);
      if (!(await b.count())) break;
      const last = (await b.first().getAttribute('aria-label')) === 'Записать подход 2';
      await b.first().click();
      await page.waitForTimeout(250);
      if (last) break; // после последнего подхода «Пропустить» не нажимаем: отдыха быть не должно
      const skip = page.getByText('Пропустить');
      if (await skip.count()) await skip.first().click();
      await page.waitForTimeout(200);
    }
    await page.getByText('Легко', { exact: true }).first().click().catch(() => {});
    // CTA появляется сразу после последнего подхода — без ожидания таймера отдыха
    const fin = page.getByLabel('Завершить тренировку', { exact: true });
    assert.ok(await fin.last().isVisible(), 'главная кнопка сменилась на «Завершить тренировку»');
    await fin.last().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByText('Все упражнения выполнены').last().isVisible());
    await page.getByText('Завершить', { exact: true }).last().click();
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /Поднято, кг/i);
    // Сколько заняла тренировка — как на таймере, со временем начала и конца
    assert.match(await page.getByTestId('session-duration').innerText(), /Время · \d\d:\d\d–\d\d:\d\d[\s\S]*\d+:\d\d/);
    assert.match(t, /Активные калории/i);
    assert.match(t, /как ощущалась тренировка\?/i);
    assert.ok(!/\bRPE\b|Тоннаж/.test(t), 'нет RPE и «Тоннажа»');
    // Кнопки ощущения — со смайлом; для VoiceOver — просто «Нормально»
    await page.getByLabel('Нормально', { exact: true }).click();
    await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => document.body.innerText), /🙂 Нормально/);
    await shot('summary');
  });

  await check('27. Питание: приёмы, «как вчера», таблица КБЖУ без воды', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    for (const m of ['Завтрак', 'Обед', 'Ужин', 'Перекусы']) assert.ok(await page.getByText(m, { exact: true }).first().isVisible(), m);
    const copyDay = page.getByText('Скопировать весь вчерашний день');
    const copyMeal = page.getByLabel(/^Скопировать .* со вчера$/);
    assert.ok((await copyDay.count()) + (await copyMeal.count()) > 0, 'копирование со вчера доступно');
    // Воды в дневнике нет (раунд 1); таблица КБЖУ: подписи колонок и итог дня
    assert.equal(await page.getByLabel(/^Вода/).count(), 0, 'воды нет');
    assert.match(await page.getByTestId('macro-table-head').innerText(), /Белки[\s\S]*Жиры[\s\S]*Углев[\s\S]*Клетч/);
    // Приёмы пищи — карточками (R2): у заполненного — строка Б·Ж·У·Кл, по тапу список сворачивается и разворачивается
    const totals = page.locator('[data-testid^="meal-totals-"]').first();
    if (await totals.count()) {
      const card = (await totals.getAttribute('data-testid')).replace('meal-totals-', '');
      const items = () => page.locator(`[data-testid="meal-${card}"]`).locator('xpath=..').locator('[data-testid^="entry-"]').count();
      const n0 = await items();
      await totals.click();
      await page.waitForTimeout(400);
      assert.equal(await items(), 0, 'приём свёрнут');
      await totals.click();
      await page.waitForTimeout(400);
      assert.equal(await items(), n0, 'и снова развёрнут');
    }
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
    await page.getByText('Данные и резервные копии', { exact: true }).click();
    await page.waitForTimeout(800);
    assert.ok(await page.getByText('Экспортировать мои данные').isVisible());
  });

  await check('29. Отчёт недели, тело и статистика доступны из «Прогресса»; данные переживают перезапуск', async () => {
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
    assert.ok(await page.getByTestId('progress-story').isVisible(), 'что изменилось — одной фразой');
    // Сила, рекорды и подробная статистика — не на первом экране, а в «Статистике»
    let t = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(t, /Рабочие веса и рекорды|Расчётный максимум/);
    assert.match(t, /% жира/, 'тело одной строкой: процент жира диапазоном');
    await page.getByLabel('Тело: состав, фото и замеры').click();
    await page.waitForTimeout(900);
    t = await page.evaluate(() => document.body.innerText);
    assert.match(await page.getByTestId('body-fat').innerText(), /\d+(,\d)?–\d+(,\d)?/);
    assert.match(t, /по (шее|росту) и талии|прибором/, 'по свежим замерам, а не по ИМТ');
    assert.match(t, /Талия/);
    await page.goto(`${URL}/progress`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await dismiss();
    await page.getByLabel('Статистика: сила, рекорды, нагрузка').click();
    await page.waitForTimeout(900);
    assert.match(await page.evaluate(() => document.body.innerText), /Расчётный максимум/);
    await page.getByText('Нагрузка', { exact: true }).last().click();
    await page.waitForTimeout(600);
    assert.match(await page.evaluate(() => document.body.innerText), /Что изменилось · к предыдущим 30 дням/);
    await page.goto(`${URL}/progress`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await dismiss();
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

  await check('31. «+» у «Завтрака» открывает добавление в завтрак; сводка — Б/Ж/У и клетчатка шкалами', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const t = await page.evaluate(() => document.body.innerText);
    for (const k of ['Осталось|Больше цели', 'Съедено', 'Цель', 'Белки', 'Углеводы', 'Жиры', 'Клетчатка']) assert.match(t, new RegExp(k, 'i'), k);
    // Весь заголовок приёма пищи — кнопка «Добавить в Завтрак» (не только маленький «+»)
    const head = await page.getByTestId('meal-breakfast').boundingBox();
    await page.mouse.click(head.x + head.width * 0.3, head.y + head.height / 2);
    await page.waitForTimeout(1000);
    assert.match(page.url(), /food\/add/, 'открыт экран добавления');
    assert.match(decodeURIComponent(page.url()), /meal=breakfast/, 'в завтрак');
    await page.goBack();
    await page.waitForTimeout(800);
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
    await page.getByLabel(/^Калории: .*Открыть питание$/).first().click();
    await page.waitForTimeout(900);
    assert.ok(await page.getByTestId('macro-summary').isVisible(), 'питание открыто');
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

  await check('35. Утро: сон, шаги и тренировка на первом экране (сон → готовность); тренировка — 1 тап', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const b = await page.getByLabel(/^Сон/).first().boundingBox();
    assert.ok(b && b.y + b.height < 956 - 80, 'кольцо сна на первом экране');
    assert.ok(await page.getByLabel(/^Шаги/).first().isVisible(), 'шаги на первом экране');
    const t = await page.evaluate(() => document.body.innerText);
    assert.match(t, /чек-ин|подъём|из чек-ина|Apple Health|нет данных/i);
    assert.ok(/Начать тренировку|Продолжить тренировку|Тренировка выполнена|отдых/i.test(t), 'тренировка дня видна');
  });

  await check('36. Тренировка: цель над подходом; свайп влево удаляет подход («Отменить» возвращает); таймер отдыха выключен, включается ⏱; заметка; замена; блины; разминка', async () => {
    await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await dismiss();
    await page.getByText('Тренировать сейчас').click();
    await page.waitForTimeout(800);
    const again = page.getByText('Начать новую', { exact: true });
    if (await again.count()) { await again.click(); await page.waitForTimeout(800); }
    await page.waitForTimeout(1000);
    // Редактор подхода (R2): тап по числам → шторка с крупными «−/+» и вводом; «Сохранить» — одним действием
    await page.getByTestId('set-edit-0').click();
    await page.waitForTimeout(600);
    assert.ok(await page.getByTestId('set-editor').isVisible(), 'редактор подхода');
    await page.getByTestId('edit-weight').fill('97,5');
    await page.getByLabel(/^Вес, кг: больше на 2,5$/).click();
    await page.getByLabel(/^Повторы: больше на 1$/).click();
    const reps0 = await page.getByTestId('edit-reps').inputValue();
    await page.getByTestId('edit-save').click();
    await page.waitForTimeout(600);
    const s0 = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('form.workouts')).state.active; return a.exercises[a.currentIndex ?? 0].sets[0]; });
    assert.equal(s0.weight, 100, 'вес 97,5 + 2,5');
    assert.equal(String(s0.reps), reps0, 'повторы из редактора');
    assert.match(await page.getByTestId('set-edit-0').innerText(), /100/);
    // Заметка — на виду, кнопкой под подходами
    assert.ok(await page.getByTestId('note-button').isVisible(), 'кнопка «Заметка» на экране');
    // Разминка: в «i» (на экране ничего лишнего), для 100 кг вставляется одним тапом
    await page.getByLabel('Рекомендация, почему').first().click();
    await page.waitForTimeout(600);
    assert.ok(await page.getByTestId('last-result').isVisible(), 'прошлый раз — в «i»');
    const warm = page.getByLabel(/^Добавить разминку/);
    if (await warm.count()) {
      await warm.click();
      await page.waitForTimeout(700);
      assert.ok((await page.getByText('Р', { exact: true }).count()) >= 2, 'разминочные подходы в списке');
    } else {
      await page.getByLabel('Закрыть').last().click();
      await page.waitForTimeout(500);
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
    for (let i = 0; i < 6 && (await page.getByLabel('Разминка — готово').count()); i++) {
      await page.getByLabel('Разминка — готово').click();
      await page.waitForTimeout(250);
      const skip = page.getByText('Пропустить');
      if (await skip.count()) await skip.first().click();
      await page.waitForTimeout(200);
    }
    // Цель подхода — в подписи строки для VoiceOver (на экране — только значения, они и есть цель)
    assert.match(await page.getByTestId(/^set-edit-\d+$/).last().getAttribute('aria-label'), /цель/);
    // Рабочий подход: большая ✓ внизу → справа от подхода появляется галочка; таймер отдыха по умолчанию выключен
    const firstWork = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('form.workouts')).state.active; return a.exercises[a.currentIndex ?? 0].sets.findIndex((x) => !x.warmup && !x.done); });
    await page.getByLabel(/^Записать подход 1$/).first().click();
    await page.waitForTimeout(500);
    assert.ok(await page.getByTestId(`set-done-${firstWork}`).isVisible(), 'галочка справа от выполненного подхода');
    assert.equal(await page.getByTestId('rest-strip').count(), 0, 'по умолчанию отдыха нет');
    assert.ok(!/Сколько повторений осталось в запасе|\bRIR\b/.test(await page.evaluate(() => document.body.innerText)), 'RIR больше не спрашиваем');
    // Свайп влево по невыполненному подходу → удалён; «Отменить» возвращает его на место
    const setIds = () => page.evaluate(() => { const a = JSON.parse(localStorage.getItem('form.workouts')).state.active; return a.exercises[a.currentIndex ?? 0].sets.map((x) => x.id); });
    const before = await setIds();
    const lastRow = page.getByTestId(`set-row-${before.length - 1}`);
    await lastRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await lastRow.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: box.y + box.height / 2 }] });
    await touch('touchStart', box.x + box.width - 30);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', box.x + box.width - 30 - i * 25); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal((await setIds()).length, before.length - 1, 'подход удалён свайпом');
    await page.getByText('Отменить', { exact: true }).last().click();
    await page.waitForTimeout(500);
    assert.deepEqual(await setIds(), before, '«Отменить» вернул подход на место');
    // Таймер отдыха: ⏱ → 1:30 → после следующего подхода идёт отсчёт; «Пропустить» убирает его
    await page.getByLabel('Таймер отдыха: выключен', { exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByLabel('1:30', { exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByLabel('Добавить подход', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByLabel(/^Записать подход 2$/).first().click();
    await page.waitForTimeout(600);
    assert.ok(await page.getByTestId('rest-strip').isVisible(), 'идёт отсчёт отдыха');
    assert.match(await page.getByTestId('rest-strip').innerText(), /Отдых 1:(29|30|2\d)/);
    await page.getByLabel('Пропустить отдых', { exact: true }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.getByTestId('rest-strip').count(), 0, 'отдых пропущен');
    // Выключить обратно — по умолчанию таймера нет и у следующих сценариев
    await page.getByLabel(/^Таймер отдыха: 1:30$/).click();
    await page.waitForTimeout(600);
    await page.getByLabel('Выключен', { exact: true }).click();
    await page.waitForTimeout(600);
    // Заметка к упражнению — кнопкой под подходами: сохраняется и видна под названием
    await page.getByTestId('note-button').click();
    await page.waitForTimeout(600);
    await page.getByPlaceholder(/сиденье на 4/).fill('Сиденье на 4');
    await page.getByText('Сохранить', { exact: true }).last().click();
    await page.waitForTimeout(600);
    assert.match(await page.getByTestId('exercise-note').innerText(), /Сиденье на 4/, 'заметка видна на экране упражнения');
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
    await page.getByLabel('Календарь дней', { exact: true }).click();
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
      await page.getByLabel('Календарь дней', { exact: true }).click();
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
    await page.getByLabel('Дневник: календарь дней').click();
    await page.waitForTimeout(800);
    assert.ok(await page.getByTestId('day-journal').count(), 'после календаря приложение отвечает');
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(600);
  });

  await check('40. Питание → «Ещё»: лист со списком стягивается пальцем за содержимое', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByTestId('nutrition-more').click();
    await page.waitForTimeout(800);
    const anchor = () => page.getByText('Подробный расчёт', { exact: true });
    const row = await anchor().boundingBox();
    assert.ok(row, 'лист открыт');
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 220, y: ty }] });
    // Короткое движение — лист следует за пальцем и возвращается
    await touch('touchStart', row.y + 5);
    for (let i = 1; i <= 3; i++) { await touch('touchMove', row.y + 5 + i * 15); await page.waitForTimeout(30); }
    const mid = await anchor().boundingBox();
    assert.ok(mid && mid.y > row.y + 10, `следует за пальцем: ${row.y} → ${mid && mid.y}`);
    await touch('touchEnd', 0);
    await page.waitForTimeout(700);
    const back = await anchor().boundingBox();
    assert.ok(back && Math.abs(back.y - row.y) < 3, 'вернулся без прыжка');
    await touch('touchStart', row.y + 5);
    for (let i = 1; i <= 14; i++) { await touch('touchMove', row.y + 5 + i * 30); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.equal(await anchor().count(), 0, 'закрыт свайпом');
  });

  await check('41. RYNJI COACH — СЕГОДНЯ: план дня, фокус и «Почему?» с данными и уверенностью', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const block = page.getByTestId('coach-today');
    if (await block.count()) {
      const t = await block.innerText();
      assert.match(t, /Тренировка по программе|По программе|Тренер советует отдых|Запланировано|Тренировка выполнена|День отдыха|Идёт тренировка/, 'главное на сегодня — одна карточка');
      // Калории дня — кольцом рядом (подробно КБЖУ — на «Питании», без дублирования)
      assert.match(await page.getByLabel(/^Калории: .*Открыть питание$/).first().innerText(), /ккал/, 'калории дня');
      // «Почему так» — в листе тренера (колокольчик на главной)
      await page.getByTestId('home-bell').click();
      await page.waitForTimeout(700);
      await page.getByLabel('Почему? Объяснение решений тренера').click();
      await page.waitForTimeout(900);
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

  await check('44. Отчёт недели: метрики и решения тренера (что/почему/данные/уверенность)', async () => {
    await page.goto(`${URL}/weekly-review`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Итог крупно; полная таблица — по «Все показатели»
    await dismiss();
    await page.getByText('Все показатели ›').click();
    await page.waitForTimeout(600);
    const t = await page.evaluate(() => document.body.innerText);
    for (const x of ['ВЕС, Δ', 'ТАЛИЯ, Δ', 'КАЛОРИИ, СР.', 'ШАГИ/ДЕНЬ', 'ТРЕНИРОВКИ', 'СИЛА', 'СОН, СР.']) assert.ok(t.toUpperCase().includes(x), x);
    if (await page.getByTestId('weekly-decisions').count()) {
      const d = await page.getByTestId('weekly-decisions').innerText();
      assert.match(d, /Решения тренера на неделю/i);
      assert.match(d, /Уверенность:/);
    }
  });

  await check('45. Питание: «Почему такие КБЖУ?»; в профиле цель — без ручного темпа', async () => {
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
    assert.equal(await page.getByTestId('rate-presets').count(), 0, 'темп набора/сушки в профиле не показываем');
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /%\/нед/, 'и в строке цели — тоже');
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

  await check('47. Суперсет: подход A → сразу B → снова A (без таймера отдыха); меню «Убрать / Суперсет со следующим»', async () => {
    assert.match(await page.getByTestId('exercise-position').innerText(), /^1\/3$/);
    await page.getByLabel(/^Записать подход 1$/).click();
    await page.waitForTimeout(1000);
    assert.match(await page.getByTestId('exercise-position').innerText(), /^2\/3$/, 'после A1 — сразу B');
    assert.equal(await page.getByLabel('Пропустить отдых').count(), 0, 'без отдыха между участниками');
    await page.getByLabel(/^Записать подход 1$/).click();
    await page.waitForTimeout(1000);
    assert.equal(await page.getByLabel('Пропустить отдых').count(), 0, 'после круга отдых сам не запускается');
    assert.match(await page.getByTestId('exercise-position').innerText(), /^1\/3$/, 'и снова A');
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
    assert.match(t, /сек/i);
    // Рекомендация — по «i», не на основном экране
    await page.getByLabel('Рекомендация, почему').click();
    await page.waitForTimeout(600);
    assert.match(await page.getByTestId('rec').innerText(), /Свой вес × \d:\d\d–\d:\d\d/, 'рекомендация в минутах:секундах');
    await page.getByLabel('Закрыть').last().click();
    await page.waitForTimeout(600);
    await page.getByLabel(/^Старт · \d:\d\d$/).click();
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

  await check('53. 3D-анимация техники: жим лёжа — зацикленный рендер, бейдж 3D, легенда подсвеченных мышц, пауза, во весь экран', async () => {
    await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const box = page.getByTestId('technique-3d');
    await box.scrollIntoViewIfNeeded();
    assert.ok(await box.isVisible(), '3D-блок на месте');
    const src = async () => (await page.getByTestId('technique-3d-media').locator('img').first().getAttribute('src')) || '';
    const legend = await box.innerText();
    assert.match(legend, /Основные мышцы[\s\S]*Большая грудная/);
    assert.match(legend, /Дополнительные[\s\S]*Трицепс, Дельтовидные/);
    assert.match(legend, /3D/);
    // В автотесте (как при «Уменьшении движения») петля стоит на стоп-кадре, пуск — касанием
    assert.match(await src(), /posters.*bench_press\.jpg/, 'стоп-кадр до пуска');
    await page.getByLabel(/^3D-анимация: Жим штанги лёжа\. Воспроизвести$/).click();
    await page.waitForTimeout(500);
    assert.match(await src(), /anim.*bench_press\.webp/, 'играет WebP-петля жима');
    assert.ok(await page.getByText('Повторение по кругу').isVisible());
    await page.getByLabel(/^3D-анимация: Жим штанги лёжа\. Пауза$/).click();
    await page.waitForTimeout(400);
    assert.match(await src(), /posters.*bench_press\.jpg/, 'на паузе — стоп-кадр');
    await page.getByTestId('technique-3d-full').click();
    await page.waitForTimeout(700);
    assert.ok(await page.getByTestId('technique-3d-close').isVisible(), 'полноэкранный просмотр');
    await page.getByTestId('technique-3d-close').click();
    await page.waitForTimeout(500);
    // Упражнение без 3D-сцены: без заглушек «появится позже»
    await page.goto(`${URL}/exercise/lateral_raise`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    assert.equal(await page.getByTestId('technique-3d').count(), 0);
    assert.equal(await page.getByText(/появится/).count(), 0, 'нет заглушек');
    // Без 3D — нейтральная схема мышц, без фото атлета
    assert.ok(await page.getByTestId('technique-muscles').isVisible(), 'схема мышц');
    const photos = await page.evaluate(() => [...document.querySelectorAll('img, div')].filter((el) => /assets\/exercises\/|free-exercise-db/.test(`${el.getAttribute('src') || ''} ${el.style?.backgroundImage || ''}`)).length);
    assert.equal(photos, 0, 'фото атлета в технике нет');
  });

  await check('52. Программы: неделя «X из N» и дни недели; сегодня → состав с картой мышц в процентах', async () => {
    await page.goto(`${URL}/training?seg=program`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    assert.equal((await page.getByTestId('week-label').innerText()).trim(), 'Эта неделя');
    assert.match(await page.evaluate(() => document.body.innerText), /\d+ из \d+/);
    // Календарь листается: следующая неделя — план по ротации, назад — текущая
    await page.getByLabel('Следующая неделя').click();
    await page.waitForTimeout(600);
    assert.equal((await page.getByTestId('week-label').innerText()).trim(), 'Следующая неделя');
    assert.match(await page.evaluate(() => document.body.innerText), /по плану/);
    await page.getByLabel('Предыдущая неделя').click();
    await page.waitForTimeout(600);
    const det = page.getByLabel(/: .+, сегодня$/);
    if (!(await det.count())) return; // день отдыха — сегодняшней тренировки нет
    await det.first().click();
    await page.waitForTimeout(1500);
    const tm = await page.getByTestId('target-muscles').innerText();
    assert.match(tm, /Целевые мышцы/i);
    const pcts = [...tm.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    assert.ok(pcts.length >= 2 && pcts.every((x, i) => i === 0 || x <= pcts[i - 1]), `по убыванию: ${pcts}`);
  });

  // ─── Этап 3: «Мои тренировки», планирование любой тренировки, шаблоны, фильтры ───
  const schedule = () => page.evaluate(() => JSON.parse(localStorage.getItem('form.schedule') || '{"state":{"planned":[],"templates":[]}}').state);
  const resetActive = () => page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('form.workouts')); raw.state.active = null; raw.state.draft = null; localStorage.setItem('form.workouts', JSON.stringify(raw)); });
  const openTraining = async (seg = '') => {
    await page.goto(`${URL}/training${seg ? `?seg=${seg}` : ''}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
  };

  await check('56. «+» → «Запланировать»: своя тренировка на завтра (конструктор) и повтор любой прошлой на сегодня; «Начать» у плана → выполнено', async () => {
    await resetActive();
    await openTraining();
    assert.match(await page.evaluate(() => document.body.innerText), /Мои тренировки[\s\S]*Программы[\s\S]*Шаблоны[\s\S]*Текущая программа[\s\S]*Сегодня[\s\S]*История тренировок/);
    await page.getByTestId('training-plus').click();
    await page.waitForTimeout(800);
    await page.getByTestId('hub-plan').click();
    await page.waitForTimeout(600);
    assert.match(await page.getByTestId('hub-plan-form').innerText(), /Программа[\s\S]*Другое[\s\S]*Повтор прошлой тренировки[\s\S]*Своя тренировка/);
    await page.getByTestId('plan-days').getByText('Завтра', { exact: true }).click();
    await page.getByTestId('hub-plan-custom').click();
    await page.waitForTimeout(1500);
    assert.match(page.url(), /workout\/builder/);
    await page.getByLabel('Название тренировки').fill('Руки и пресс');
    await page.getByText('Добавить упражнение', { exact: true }).click();
    await page.waitForTimeout(900);
    await page.getByPlaceholder('Поиск: жим, присед, бицепс…').fill('планка');
    await page.waitForTimeout(500);
    await page.getByLabel('Планка', { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByTestId('builder-plan').click();
    await page.waitForTimeout(1500);
    let st = await schedule();
    const custom = st.planned.find((x) => x.name === 'Руки и пресс');
    assert.ok(custom && custom.source === 'custom' && custom.status === 'planned', 'своя тренировка запланирована');
    assert.deepEqual(custom.exercises.map((e) => e.exerciseId), ['plank']);
    assert.ok(await page.getByLabel('Руки и пресс, Завтра, запланировано').isVisible(), 'в «Ближайших» — на завтра');
    // Повтор любой прошлой: список полный, одинаковые названия не склеены
    const done = await page.evaluate(() => JSON.parse(localStorage.getItem('form.workouts')).state.sessions.filter((x) => x.status === 'completed' && x.exercises.length).sort((a, b) => b.startedAt - a.startedAt));
    await page.getByTestId('training-plus').click();
    await page.waitForTimeout(800);
    await page.getByTestId('hub-plan').click();
    await page.waitForTimeout(500);
    await page.getByTestId('hub-plan-repeat').click();
    await page.waitForTimeout(600);
    const list = page.getByTestId('hub-plan-repeat-list').getByRole('button');
    assert.equal(await list.count(), Math.min(done.length, 20) + (done.length > 20 ? 1 : 0), 'все прошлые тренировки (страницами по 20)');
    await list.first().click();
    await page.waitForTimeout(1200);
    st = await schedule();
    const rep = st.planned.find((x) => x.source === 'repeat');
    assert.ok(rep && rep.fromSessionId === done[0].id && rep.name === done[0].name, 'повтор привязан к исходной тренировке');
    const original = JSON.stringify(done[0]);
    // «Сегодня» → ▶ → активная тренировка помнит план; завершение отмечает план выполненным
    await page.getByTestId('mine-today-planned').getByLabel(`Начать: ${rep.name}`).first().click();
    await page.waitForTimeout(1800);
    assert.match(page.url(), /workout\/active/);
    const a = await activeState();
    assert.equal(a.plannedId, rep.id, 'сессия знает свой план');
    // Основная зона: прошлый раз и предложение RYNJI; подходы заполнены предложением
    const r0 = a.exercises[0].recommendation;
    if (r0 && r0.action !== 'new' && r0.weight > 0) {
      // Прошлый раз и предложение RYNJI — в «i» (на экране только подходы, как на образце)
      await page.getByLabel('Рекомендация, почему').first().click();
      await page.waitForTimeout(600);
      assert.ok(await page.getByTestId('last-result').isVisible(), 'прошлый раз');
      assert.match(await page.getByTestId('rec').innerText(), /[\d,]+ кг × \d+–\d+/);
      await page.getByLabel('Закрыть').last().click();
      await page.waitForTimeout(500);
      assert.equal(a.exercises[0].sets.find((x) => !x.warmup).weight, r0.weight, 'подход заполнен предложением');
    }
    await page.getByLabel(/^Записать подход 1$/).first().click();
    await page.waitForTimeout(700);
    await page.getByLabel('Тренировка: время, калории, завершение').click();
    await page.waitForTimeout(700);
    await page.getByText('Закончить тренировку', { exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByText('Завершить', { exact: true }).last().click();
    await page.waitForTimeout(1800);
    st = await schedule();
    const closed = st.planned.find((x) => x.id === rep.id);
    assert.equal(closed.status, 'done', 'план выполнен');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('form.workouts')).state.sessions);
    assert.equal(JSON.stringify(after.find((x) => x.id === done[0].id)), original, 'исходная тренировка не изменилась');
    assert.ok(after.some((x) => x.id === closed.doneSessionId && x.plannedId === rep.id), 'новая сессия в истории');
    await shot('stage3-planned-done');
  });

  await check('57. Шаблоны: «Сохранить как шаблон» в конструкторе и «В шаблоны» у прошлой → «Шаблоны» → «Запланировать» на выбранный день', async () => {
    await resetActive();
    await openTraining();
    await page.getByTestId('training-plus').click();
    await page.waitForTimeout(800);
    await page.getByTestId('hub-start').click();
    await page.waitForTimeout(400);
    await page.getByTestId('hub-new').click();
    await page.waitForTimeout(1500);
    await page.getByLabel('Название тренировки').fill('Верх (любимый)');
    await page.getByLabel('Цвет: Синий').click().catch(() => {});
    await page.getByText('Добавить упражнение', { exact: true }).click();
    await page.waitForTimeout(900);
    await page.getByPlaceholder('Поиск: жим, присед, бицепс…').fill('планка');
    await page.waitForTimeout(500);
    await page.getByLabel('Планка', { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByTestId('builder-save-template').click();
    await page.waitForTimeout(900);
    let st = await schedule();
    const t = st.templates.find((x) => x.name === 'Верх (любимый)');
    assert.ok(t && t.exercises.length === 1, 'шаблон сохранён');
    // прошлая тренировка → «В шаблоны»
    const sid = await page.evaluate(() => JSON.parse(localStorage.getItem('form.workouts')).state.sessions.filter((x) => x.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)[1].id);
    await page.goto(`${URL}/workout/${sid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1300);
    await page.getByTestId('session-template').click();
    await page.waitForTimeout(800);
    st = await schedule();
    assert.equal(st.templates.length >= 2, true, 'и прошлая — в шаблонах');
    await openTraining('templates');
    assert.match(await page.evaluate(() => document.body.innerText), /Программа от RYNJI[\s\S]*Мои шаблоны[\s\S]*Верх \(любимый\)[\s\S]*Создать с нуля[\s\S]*Библиотека упражнений/);
    await shot('stage3-templates');
    await page.getByLabel('Шаблон Верх (любимый)').click();
    await page.waitForTimeout(900);
    await page.getByTestId('template-plan').click();
    await page.waitForTimeout(1200);
    assert.ok(await page.getByTestId('hub-plan-confirm').isVisible(), 'остался только выбор дня');
    const third = page.getByTestId('plan-days').getByRole('button').nth(3);
    await third.click();
    await page.getByTestId('hub-plan-confirm').click();
    await page.waitForTimeout(1000);
    st = await schedule();
    const p = st.planned.find((x) => x.source === 'template' && x.templateId === t.id);
    const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    assert.ok(p && p.date === iso(new Date(Date.now() + 3 * 86400000)), `запланирован на 4-й день: ${p && p.date}`);
  });

  await check('58. История: фильтры по статусу, группе мышц и периоду; пропущенная запланированная → «Перенести»', async () => {
    // Просроченная запланированная (вчера) — в истории как «пропущено»
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('form.schedule'));
      const dt = new Date(Date.now() - 86400000);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      raw.state.planned.push({ id: 'e2e_missed', date: iso, name: 'Пропущенная спина', source: 'custom', exercises: [{ exerciseId: 'lat_pulldown', sets: 3, repMin: 8, repMax: 12, targetRir: 2, restSec: 90 }], status: 'planned', createdAt: 1 });
      localStorage.setItem('form.schedule', JSON.stringify(raw));
    });
    await openTraining('history');
    await page.getByTestId('history-filter').click();
    await page.waitForTimeout(800);
    await page.getByTestId('history-filter-sheet').getByText('Пропущенные', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByTestId('history-filter-apply').click();
    await page.waitForTimeout(800);
    assert.match(await page.getByTestId('history-filter-summary').innerText(), /пропущенные · найдено: \d+/);
    assert.ok(await page.getByLabel(/^Пропущенная спина, Вчера, пропущено$/).isVisible(), 'просроченный план — «пропущено»');
    assert.equal(await page.getByTestId('session-exercise').count(), 0);
    await shot('stage3-filter-missed');
    // группа мышц + период: только тренировки со спиной за 30 дней
    await page.getByTestId('history-filter').click();
    await page.waitForTimeout(700);
    await page.getByTestId('history-filter-sheet').getByText('Все', { exact: true }).click();
    await page.getByTestId('history-filter-sheet').getByText('Спина', { exact: true }).click();
    await page.getByTestId('history-filter-sheet').getByText('30 дней', { exact: true }).click();
    await page.getByTestId('history-filter-apply').click();
    await page.waitForTimeout(800);
    const n = Number((await page.getByTestId('history-filter-summary').innerText()).match(/найдено: (\d+)/)[1]);
    const expect = await page.evaluate(() => {
      const from = new Date(Date.now() - 29 * 86400000);
      const f = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      return { sessions: JSON.parse(localStorage.getItem('form.workouts')).state.sessions.filter((x) => x.status === 'completed' && x.date >= f).length };
    });
    assert.ok(n > 0 && n <= expect.sessions + 1, `спина за 30 дней: ${n} из ${expect.sessions}`);
    await page.getByLabel('Сбросить фильтры').click();
    await page.waitForTimeout(600);
    assert.equal(await page.getByTestId('history-filter-summary').count(), 0, 'фильтры сброшены');
    // пропущенная → перенести на завтра → снова в «Ближайших»
    await page.getByLabel(/^Пропущенная спина, Вчера, пропущено$/).click();
    await page.waitForTimeout(900);
    assert.match(await page.getByTestId('planned-sheet').innerText(), /Выполнить сейчас[\s\S]*Перенести[\s\S]*Отметить пропущенной/);
    await page.getByTestId('planned-move').click();
    await page.waitForTimeout(400);
    await page.getByTestId('planned-sheet').getByTestId('plan-days').getByText('Завтра', { exact: true }).click();
    await page.getByTestId('planned-move-confirm').click();
    await page.waitForTimeout(1000);
    assert.ok(await page.getByLabel('Пропущенная спина, Завтра, запланировано').isVisible(), 'перенесена на завтра');
    const st = await schedule();
    assert.equal(st.planned.find((x) => x.id === 'e2e_missed').status, 'planned');
  });

  await check('59. Дневник: неделя дней, запись задним числом, удаление свайпом → «Отменить», копирование дня → «Отменить»', async () => {
    const pad = (n) => String(n).padStart(2, '0');
    const isoOf = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const day = (back) => isoOf(new Date(Date.now() - back * 86400000));
    const [today, y1, y2] = [day(0), day(1), day(2)];
    // Позавчера — запись, вчера — две; сегодня пусто
    await page.evaluate(({ today, y1, y2 }) => {
      const st = JSON.parse(localStorage.getItem('form.nutrition'));
      st.state.entries = st.state.entries.filter((e) => ![today, y1, y2].includes(e.date));
      const mk = (id, date, meal, name, grams, kcal) => ({ id, date, productId: `local:${id}`, name, grams, macros: { kcal, protein: 10, fat: 5, carbs: 20 }, meal, createdAt: Date.now() });
      st.state.entries.push(mk('e2e_y2', y2, 'lunch', 'Гречка отварная', 200, 220));
      st.state.entries.push(mk('e2e_y1a', y1, 'breakfast', 'Овсянка', 60, 210), mk('e2e_y1b', y1, 'dinner', 'Творог 5%', 180, 218));
      localStorage.setItem('form.nutrition', JSON.stringify(st));
    }, { today, y1, y2 });
    const entries = () => page.evaluate(() => JSON.parse(localStorage.getItem('form.nutrition')).state.entries);
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    // Неделя: сегодня справа, точка — у дней с записями
    assert.match(await page.getByTestId(`strip-${today}`).getAttribute('aria-label'), /сегодня/);
    assert.match(await page.getByTestId(`strip-${y2}`).getAttribute('aria-label'), /есть записи/);
    // Позавчера: сводка этого дня; «+» у перекуса открывает добавление в этот день
    await page.getByTestId(`strip-${y2}`).click();
    await page.waitForTimeout(600);
    assert.match(await page.getByTestId('day-summary').getAttribute('aria-label'), /съедено 220 из/);
    await page.getByTestId('meal-snack').click();
    await page.waitForTimeout(900);
    assert.match(decodeURIComponent(page.url()), new RegExp(`date=${y2}.*meal=snack|meal=snack.*date=${y2}`), 'добавление — в выбранный день');
    await page.goBack();
    await page.waitForTimeout(900);
    // Вчера: удаление свайпом влево → «Отменить» возвращает запись
    await page.getByTestId(`strip-${y1}`).click();
    await page.waitForTimeout(600);
    const row = await page.getByTestId('entry-e2e_y1b').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: row.y + row.height / 2 }] });
    await touch('touchStart', row.x + row.width - 30);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', row.x + row.width - 30 - i * 25); await page.waitForTimeout(16); }
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    assert.ok(!(await entries()).some((e) => e.id === 'e2e_y1b'), 'удалено свайпом');
    await page.getByText('Отменить', { exact: true }).last().click();
    await page.waitForTimeout(500);
    assert.ok((await entries()).some((e) => e.id === 'e2e_y1b'), '«Отменить» вернул запись');
    // Сегодня: «Скопировать весь вчерашний день» → 2 записи; «Отменить» — снова пусто
    await page.getByTestId(`strip-${today}`).click();
    await page.waitForTimeout(600);
    await page.getByTestId('copy-yesterday').click();
    await page.waitForTimeout(500);
    assert.equal((await entries()).filter((e) => e.date === today).length, 2, 'день скопирован');
    await page.getByText('Отменить', { exact: true }).last().click();
    await page.waitForTimeout(500);
    assert.equal((await entries()).filter((e) => e.date === today).length, 0, 'копирование отменено');
    await shot('nutrition-diary');
  });

  const nutritionState = () => page.evaluate(() => JSON.parse(localStorage.getItem('form.nutrition')).state);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  await check('60. Повторный продукт — 3 действия: «+» у обеда → продукт в «Недавних» → «Добавить в обед» (порция прошлого раза)', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const before = (await nutritionState()).entries.length;
    await page.getByTestId('meal-lunch').click(); // 1
    await page.waitForTimeout(1000);
    const first = page.getByLabel(/ккал на 100 г$/).first();
    const name = (await first.getAttribute('aria-label')).split(',')[0];
    await first.click(); // 2
    await page.waitForTimeout(800);
    const st0 = await nutritionState();
    const pid = st0.recent[0];
    await page.getByTestId('portion-add').click(); // 3
    await page.waitForTimeout(900);
    assert.match(page.url(), /\/nutrition/, 'вернулись в дневник');
    const st = await nutritionState();
    assert.equal(st.entries.length, before + 1, 'запись добавлена');
    const e = st.entries[st.entries.length - 1];
    assert.equal(e.meal, 'lunch');
    assert.ok(e.name.startsWith(name), `${e.name} ~ ${name}`);
    assert.equal(e.grams, st0.lastGrams[pid] ?? e.grams, 'порция прошлого раза');
  });

  await check('61. Корзина: 3 продукта одним добавлением в ужин; «Отменить» убирает все три', async () => {
    await page.goto(`${URL}/food/add?meal=dinner`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    const before = (await nutritionState()).entries.length;
    for (let i = 0; i < 3; i++) {
      await page.getByLabel(/^В корзину: /).first().click();
      await page.waitForTimeout(300);
    }
    assert.match(await page.getByTestId('food-cart').innerText(), /3 продукта/);
    const draft = (await nutritionState()).draft;
    assert.equal(draft.items.length, 3, 'корзина сохранена в хранилище');
    await page.getByTestId('cart-commit').click();
    await page.waitForTimeout(900);
    const st = await nutritionState();
    assert.equal(st.entries.length, before + 3, '3 записи одним действием');
    assert.ok(st.entries.slice(-3).every((e) => e.meal === 'dinner'), 'все — в ужин');
    assert.equal(st.draft, null, 'корзина очищена');
    await page.getByText('Отменить', { exact: true }).last().click();
    await page.waitForTimeout(500);
    assert.equal((await nutritionState()).entries.length, before, '«Отменить» убрал все три');
  });

  await check('62. Без сети: поиск по базовым и своим продуктам с опечаткой, добавление работает', async () => {
    // Оба экрана загружаются до отключения сети: dev-сервер отдаёт экраны по запросу, в сборке они уже внутри
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByTestId('meal-snack').click();
    await page.waitForTimeout(1200);
    await ctx.setOffline(true);
    try {
      await page.getByTestId('food-search').fill('тварог');
      await page.waitForTimeout(1500);
      assert.ok(await page.getByLabel(/^Творог 5%.*ккал на 100 г$/).first().isVisible(), 'опечатка «тварог» → творог, офлайн');
      const before = (await nutritionState()).entries.length;
      await page.getByLabel(/^Творог 5%.*ккал на 100 г$/).first().click();
      await page.waitForTimeout(800);
      await page.getByTestId('portion-add').click();
      await page.waitForTimeout(800);
      assert.equal((await nutritionState()).entries.length, before + 1, 'добавлено без сети');
    } finally {
      await ctx.setOffline(false);
    }
  });

  await check('63. Свой продукт с весом 1 шт: порция «2 шт» → в дневнике «2 шт, 80 г»; правка порции → «Отменить»', async () => {
    await page.goto(`${URL}/food/add?meal=snack`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByText('Свой продукт', { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByLabel('Название', { exact: true }).fill('Батончик e2e');
    await page.getByLabel('Белки, г', { exact: true }).fill('20');
    await page.getByLabel('Жиры, г', { exact: true }).fill('15');
    await page.getByLabel('Углев., г', { exact: true }).fill('45');
    await page.getByLabel('Вес 1 шт, г', { exact: true }).fill('40');
    await page.getByText('Сохранить продукт', { exact: true }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('tab', { name: /^шт/ }).click();
    await page.waitForTimeout(300);
    // 100 г по умолчанию = 2,5 шт; минус полштуки → 2 шт = 80 г; 395 ккал/100 г → 316 ккал
    await page.getByTestId('portion-qty').getByLabel(/^Уменьшить/).click();
    await page.waitForTimeout(300);
    assert.match(await page.getByTestId('portion-macros').getAttribute('aria-label'), /На порцию 80 г: 316 ккал/);
    await page.getByTestId('portion-add').click();
    await page.waitForTimeout(900);
    const e = (await nutritionState()).entries.slice(-1)[0];
    assert.equal(e.grams, 80);
    assert.deepEqual(e.unit, { id: 'piece', qty: 2, label: 'шт' });
    assert.ok(await page.getByText('2 шт, 80 г').first().isVisible(), 'в дневнике — как ввели');
    // Правка: 1,5 шт → «Отменить» возвращает 2 шт
    await page.getByLabel(/^Батончик e2e, 2 шт/).first().click();
    await page.waitForTimeout(800);
    await page.getByTestId('portion-qty').getByLabel(/^Уменьшить/).click();
    await page.getByTestId('portion-save').click();
    await page.waitForTimeout(700);
    assert.equal((await nutritionState()).entries.find((x) => x.id === e.id).grams, 60);
    await page.getByText('Отменить', { exact: true }).last().click();
    await page.waitForTimeout(500);
    assert.equal((await nutritionState()).entries.find((x) => x.id === e.id).grams, 80, 'правка отменена');
  });

  await check('64. Рецепт: 2 продукта, вес готового и порции → КБЖУ на 100 г готового → порция в обед; правка рецепта не меняет запись', async () => {
    await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByTestId('meal-lunch').click();
    await page.waitForTimeout(1000);
    await page.getByRole('tab', { name: 'Мои' }).click();
    await page.getByTestId('new-recipe').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('recipe-name').fill('Гречка с курицей e2e');
    const addIng = async (q, name, grams, idx) => {
      await page.getByText('Добавить', { exact: true }).first().click();
      await page.waitForTimeout(700);
      await page.getByTestId('ingredient-search').fill(q);
      await page.waitForTimeout(800);
      await page.getByLabel(new RegExp(`^${name},`)).first().click();
      await page.waitForTimeout(700);
      await page.getByTestId(`recipe-ing-${idx}`).locator('input').fill(String(grams));
      await page.waitForTimeout(200);
    };
    await addIng('гречка', 'Гречка отварная', 200, 0);
    await addIng('курица', 'Куриная грудка отварная', 150, 1);
    await page.getByTestId('recipe-cooked').locator('input').fill('700');
    await page.waitForTimeout(300);
    // (200 × 1,10 + 150 × 1,37) = 425,5 ккал на 700 г готового: 61 ккал/100 г; порция 350 г — 213 ккал
    const sum = await page.getByTestId('recipe-summary').innerText();
    assert.match(sum, /На 100 г готового\s+61\s+ккал/, sum);
    assert.match(sum, /Порция · 350 г\s+213\s+ккал/, sum);
    await page.getByTestId('recipe-save').click();
    await page.waitForTimeout(1000);
    const st0 = await nutritionState();
    const rec = st0.recipes.find((r) => r.name === 'Гречка с курицей e2e');
    assert.ok(rec, 'рецепт сохранён');
    await page.getByRole('tab', { name: 'Мои' }).click();
    await page.getByLabel(/^Гречка с курицей e2e/).first().click();
    await page.waitForTimeout(900);
    await page.getByRole('tab', { name: /^порция/ }).click();
    await page.waitForTimeout(300);
    await page.getByTestId('portion-add').click();
    await page.waitForTimeout(900);
    const st = await nutritionState();
    const e = st.entries.slice(-1)[0];
    assert.equal(e.recipeId, rec.id);
    assert.equal(e.meal, 'lunch');
    assert.equal(Math.round(e.macros.kcal), 213);
    assert.deepEqual(e.unit, { id: 'serving', qty: 1, label: 'порция' });
    assert.ok(await page.getByText('1 порция, 350 г').first().isVisible(), 'в дневнике — порция');
    // Правка рецепта (меньше порций) не трогает запись — снимок
    await page.evaluate((id) => {
      const raw = JSON.parse(localStorage.getItem('form.nutrition'));
      raw.state.recipes = raw.state.recipes.map((r) => (r.id === id ? { ...r, per100: { ...r.per100, kcal: 999 } } : r));
      localStorage.setItem('form.nutrition', JSON.stringify(raw));
    }, rec.id);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    assert.equal(Math.round((await nutritionState()).entries.find((x) => x.id === e.id).macros.kcal), 213, 'снимок записи не изменился');
  });

  await check('65. «Сегодня» в день отдыха: «День отдыха», причина и ближайшая тренировка; без кнопки «Начать»', async () => {
    const iso = todayIso();
    const saved = await page.evaluate((day) => {
      const raw = JSON.parse(localStorage.getItem('form.plan'));
      const prev = raw.state.overrides?.[day] ?? null;
      raw.state.overrides = { ...(raw.state.overrides || {}), [day]: { date: day, templateId: null, mode: 'rest', reason: 'Тренер перенёс нагрузку: сегодня восстановление', source: 'coach', createdAt: Date.now() } };
      localStorage.setItem('form.plan', JSON.stringify(raw));
      return prev;
    }, iso);
    try {
      await page.goto(URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await dismiss();
      const card = page.getByTestId('coach-today');
      const t = await card.innerText();
      // активная, выполненная или своя запланированная на сегодня тренировка важнее отдыха (после полуночи «завтра» из сценария 56 становится сегодня)
      if (/Идёт тренировка|Тренировка выполнена|Запланировано/.test(t)) return;
      assert.match(t, /День отдыха/);
      assert.match(t, /Тренер перенёс нагрузку/);
      assert.equal(await card.getByText('Начать тренировку').count(), 0, 'в день отдыха нет «Начать»');
      if (await card.getByLabel(/^Ближайшая: /).count()) {
        await card.getByLabel(/^Ближайшая: /).click();
        await page.waitForTimeout(900);
        assert.match(page.url(), /workout\/preview/, 'ближайшая — состав тренировки');
      }
      await shot('home-rest');
    } finally {
      await page.evaluate(({ day, prev }) => {
        const raw = JSON.parse(localStorage.getItem('form.plan'));
        if (prev) raw.state.overrides[day] = prev;
        else delete raw.state.overrides[day];
        localStorage.setItem('form.plan', JSON.stringify(raw));
      }, { day: iso, prev: saved });
    }
  });

  await check('66. Дневник: подсказка тренера по остатку — при переборе без «отработай»; «Спросить тренера» открывает чат с вопросом', async () => {
    const iso = todayIso();
    await page.evaluate((day) => {
      const st = JSON.parse(localStorage.getItem('form.nutrition'));
      st.state.entries.push({ id: 'e2e-over', date: day, productId: 'local:oats_dry', name: 'Овсяные хлопья', grams: 1000, macros: { kcal: 3660, protein: 122, fat: 61, carbs: 595, fiber: 101 }, meal: 'dinner', createdAt: Date.now() });
      localStorage.setItem('form.nutrition', JSON.stringify(st));
    }, iso);
    try {
      await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await dismiss();
      const hint = page.getByTestId('nutrition-hint');
      assert.equal(await hint.count(), 1, 'одна подсказка');
      const t = await hint.innerText();
      assert.match(t, /Калорий на [\d\s\u202f]+ больше цели/);
      assert.doesNotMatch(t, /отработ|голод|сожги/i, 'без компенсаций');
      await shot('nutrition-hint');
      await page.getByLabel('Спросить тренера').click();
      await page.waitForTimeout(1200);
      assert.match(page.url(), /\/coach/);
      assert.equal(await page.getByLabel('Сообщение тренеру').inputValue(), 'Что мне поесть сейчас?');
    } finally {
      await page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('form.nutrition'));
        st.state.entries = st.state.entries.filter((e) => e.id !== 'e2e-over');
        localStorage.setItem('form.nutrition', JSON.stringify(st));
      });
    }
  });

  await check('67. Миниатюры упражнений: без фото атлета; 3D-постер — только у упражнений со своей петлёй', async () => {
    await page.goto(`${URL}/library`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dismiss();
    const media = () => page.evaluate(() => [...document.querySelectorAll('img, div')].map((el) => `${el.getAttribute('src') || ''} ${el.style?.backgroundImage || ''}`).filter((x) => x.trim()));
    let all = await media();
    assert.equal(all.filter((x) => /assets\/exercises\/|free-exercise-db/.test(x)).length, 0, 'в библиотеке нет фото атлета');
    assert.ok((await page.locator('svg path').count()) > 50, 'миниатюры — схемы мышц');
    const posters = all.filter((x) => /posters\//.test(x)).map((x) => x.match(/posters\/([a-z_]+)/)[1]);
    const own = ['bench_press', 'lat_pulldown', 'db_row', 'db_curl', 'back_squat', 'romanian_deadlift'];
    assert.ok(posters.every((p) => own.includes(p)), `постеры только своих петель: ${posters}`);
    await shot('library-thumbs');
  });

  await check('14. Тема сохраняется после перезапуска', async () => {
    await page.goto(`${URL}/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await dismiss();
    await page.getByText('Светлая', { exact: true }).click();
    await page.waitForTimeout(1200);
    await page.goto(`${URL}/profile`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Фон светлой темы (#F3F5F8) после полной перезагрузки страницы
    const light = await page.evaluate(() => [...document.querySelectorAll('div')].some((d) => getComputedStyle(d).backgroundColor === 'rgb(243, 245, 248)'));
    assert.ok(light, 'светлый фон после перезапуска');
  });

  results.push(errors.length ? `JS-ошибки: ${errors.join(' | ')}` : 'JS-ошибок нет');
  console.log(results.join('\n'));
  await browser.close();
  if (results.some((r) => r.startsWith('✗'))) process.exit(1);
})();
