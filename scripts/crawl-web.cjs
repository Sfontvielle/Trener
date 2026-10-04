/**
 * Обход всего приложения в Expo Web: каждый экран + «нажать всё подряд» на основных экранах.
 * Ловит: экран ошибки («Что-то пошло не так»), необработанные исключения (pageerror), console.error.
 * Запуск: npx expo start --web --port 8081, затем  node scripts/crawl-web.cjs [группа]
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = process.env.E2E_URL || 'http://localhost:8081';
const ONLY = process.argv[2];

const PROFILE = {
  name: 'Тест', sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 4, sessionMinutes: 70, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};
// E2E_SEX=female — тот же прогон для женского профиля; E2E_GOAL=cut|recomp|maintain — другая цель
if (process.env.E2E_SEX === 'female') Object.assign(PROFILE, { name: 'Анна', sex: 'female', age: 27, heightCm: 166, weightKg: 58 });
if (process.env.E2E_GOAL) Object.assign(PROFILE, { goal: process.env.E2E_GOAL, ratePctPerWeek: process.env.E2E_GOAL === 'cut' ? 0.6 : 0 });
// Кнопки, которые меняют/удаляют данные или уводят из приложения — не нажимаем
const SKIP = /Удал|Сброс|Очист|Отключ|Выйти|Заполнить демо|Экспорт|Восстанов|Импорт|Поделиться|настройк|Управление доступом|Свернуть тренировку|Завершить и сохранить|Не предлагать больше|Мне не нравится|Перейти на этот сплит|Применить|Начать с RYNJI|Подключить Apple Health|Сохранить и пересчитать|Перейти на мой расход|Профиль$/i;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const problems = [];
  let where = 'setup';
  page.on('pageerror', (e) => problems.push(`[pageerror @ ${where}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Download the React DevTools|favicon|net::ERR|Failed to load resource|openfoodfacts/i.test(t)) return;
    problems.push(`[console.error @ ${where}] ${t.slice(0, 300)}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate((p) => localStorage.setItem('form.profile', JSON.stringify({ state: { profile: p, settings: {} }, version: 1 })), PROFILE);
  await page.goto(`${URL}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByText('Тренировки', { exact: true }).first().click();
  await page.getByText('Сохранить и пересчитать').click();
  await page.waitForTimeout(1200);
  await page.goto(`${URL}/data`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Дополнительно', { exact: true }).click();
  await page.getByText('Заполнить демо-историей (для проверки)').click();
  await page.getByText('Добавить демо', { exact: true }).click();
  await page.waitForTimeout(800);

  const dismiss = async () => {
    const d = page.getByText('У тебя есть незавершённая тренировка');
    if (await d.count()) {
      await page.waitForTimeout(400);
      await page.getByText('Продолжить', { exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
  };
  const logBox = async (pg = page) => {
    try {
      return (await pg.locator('#error-toast div').filter({ hasText: /\S/ }).first().innerText({ timeout: 300 })).trim();
    } catch {
      return '';
    }
  };
  const errorScreen = async () => {
    const lb = await logBox();
    if (lb) problems.push(`[ошибка React в консоли @ ${where}] ${lb.slice(0, 200)}`);
    return (await page.getByText('Что-то пошло не так').count()) > 0;
  };

  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('form.workouts')).state.sessions.find((s) => s.status === 'completed'));
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('form.plan')).state.plan);
  const routes = [
    '/', '/nutrition', '/training', '/training?seg=plan', '/training?seg=history', '/training?seg=library', '/progress',
    '/checkin', '/weight', '/measurements', '/health', '/profile', '/data', '/appearance', '/plan', '/weekly-review', '/coach', '/labs', '/labs/hct', '/labs/review', '/health-monitor',
    '/training-prefs', '/food/add', '/food/add?productId=local:oats_dry', '/food/add?manual=1', '/food/scan',
    '/exercise/bench_press', `/workout/${session.id}`, `/workout/preview?templateId=${plan.templates[0].id}`, '/workout/builder', '/onboarding',
  ];

  // 1) Каждый экран открывается без ошибок
  if (!ONLY || ONLY === 'routes') {
    for (const r of routes) {
      where = r;
      await page.goto(URL + r, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await dismiss();
      if (await errorScreen()) problems.push(`[error screen] ${r}: ${(await page.evaluate(() => document.body.innerText)).slice(0, 200)}`);
    }
    console.log('routes checked:', routes.length);
  }

  // 2) «Нажать всё»: каждая видимая кнопка экрана по очереди, после каждой — проверка и возврат
  const monkey = async (route, prep) => {
    where = route;
    const open = async () => {
      await page.goto(URL + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await dismiss();
      if (prep) await prep();
    };
    await open();
    const labels = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[role="button"], button, [role="tab"], [role="link"]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > 4000) continue;
        const name = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (name) out.push(name);
      }
      return [...new Set(out)];
    });
    let n = 0;
    for (const name of labels) {
      if (SKIP.test(name)) continue;
      const el = page.getByRole('button', { name, exact: true }).first();
      if (!(await el.count())) continue;
      where = `${route} → «${name}»`;
      try {
        await el.scrollIntoViewIfNeeded({ timeout: 1500 });
        await el.click({ timeout: 1500 });
      } catch {
        await open();
        continue;
      }
      n++;
      await page.waitForTimeout(450);
      if (await errorScreen()) problems.push(`[error screen] ${where}: ${(await page.evaluate(() => document.body.innerText)).slice(0, 200)}`);
      await open();
    }
    console.log(`monkey ${route}: ${n} кнопок`);
  };

  const groups = {
    home: () => monkey('/'),
    nutrition: () => monkey('/nutrition'),
    training: () => monkey('/training'),
    progress: () => monkey('/progress'),
    profile: () => monkey('/profile'),
    checkin: () => monkey('/checkin'),
    food: () => monkey('/food/add'),
    labs: () => monkey('/labs'),
    health: () => monkey('/health-monitor'),
    weekly: () => monkey('/weekly-review'),
    onboarding: async () => {
      // Короткий онбординг (5 шагов), затем раздел «Здоровье» из ленты — каждый «+» открывает выбор, выбор и сохранение без ошибок
      const p2 = await ctx.newPage();
      p2.on('pageerror', (e) => problems.push(`[pageerror @ onboarding] ${e.message}`));
      await p2.evaluate(() => localStorage.clear()).catch(() => {});
      await p2.goto(`${URL}/onboarding`, { waitUntil: 'networkidle' });
      await p2.evaluate(() => localStorage.clear());
      await p2.goto(`${URL}/onboarding`, { waitUntil: 'networkidle' });
      await p2.waitForTimeout(1200);
      await p2.getByLabel('Как тебя зовут?').fill('Тест');
      for (let i = 0; i < 4; i++) { await p2.getByText('Далее', { exact: true }).click(); await p2.waitForTimeout(300); }
      await p2.getByText('Начать с RYNJI').click();
      await p2.waitForTimeout(1500);
      await p2.goto(`${URL}/profile?edit=health`, { waitUntil: 'networkidle' });
      await p2.waitForTimeout(1500);
      const btns = await p2.evaluate(() => [...document.querySelectorAll('[aria-label^="Выбрать:"],[aria-label^="Добавить:"]')].map((e) => e.getAttribute('aria-label')));
      for (const b of btns) {
        where = `onboarding «${b}»`;
        await p2.getByLabel(b, { exact: true }).click();
        await p2.waitForTimeout(500);
        const chip = p2.locator('[role="button"]').filter({ hasNotText: /Отмена|Сохранить|Закрыть/ }).nth(3);
        await p2.getByText('Популярное', { exact: true }).last().waitFor({ timeout: 2000 }).catch(() => problems.push(`[picker не открылся] ${b}`));
        await chip.click({ timeout: 1000 }).catch(() => {});
        await p2.getByText('Сохранить', { exact: true }).last().click({ timeout: 1500 }).catch(() => {});
        await p2.waitForTimeout(400);
        if ((await p2.getByText('Что-то пошло не так').count()) > 0) problems.push(`[error screen] ${where}`);
      }
      console.log('onboarding pickers:', btns.length);
      await p2.close();
    },
    workout: async () => {
      await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await dismiss();
      await page.getByText('Тренировать сейчас').click();
      await page.waitForTimeout(900);
      const again = page.getByText('Начать новую', { exact: true });
      if (await again.count()) { await again.click(); await page.waitForTimeout(800); }
      await monkey('/workout/active');
    },
  };
  // Онбординг очищает хранилище общего контекста — запускается последним
  const order = Object.keys(groups).sort((a, b) => (a === 'onboarding' ? 1 : 0) - (b === 'onboarding' ? 1 : 0));
  for (const k of order) if (!ONLY || ONLY === k) await groups[k]();

  console.log(problems.length ? `ПРОБЛЕМЫ (${problems.length}):\n${[...new Set(problems)].join('\n')}` : 'Ошибок не найдено');
  await browser.close();
  if (problems.length) process.exit(1);
})();
