/**
 * Регрессия снимков (фаза F): дневник питания и активная тренировка в web-рендере сравниваются с эталонами
 * в scripts/visual-baseline. Время в браузере зафиксировано, данные — демо-история приложения от этой даты,
 * поэтому снимки воспроизводимы. Сравнение — попиксельно в браузере (canvas), без дополнительных зависимостей.
 *
 * Запуск: npx expo start --web --port 8081, затем
 *   node scripts/visual-web.cjs            — сравнить с эталонами (отличия — в VISUAL_OUT, по умолчанию visual-out/)
 *   node scripts/visual-web.cjs --update   — перезаписать эталоны (после намеренного изменения интерфейса)
 * Шрифт текста перед снимком — явно Inter (пакет fonts-inter); Chromium из Playwright 1.63 — так же в CI.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const URL = process.env.E2E_URL || 'http://localhost:8081';
const UPDATE = process.argv.includes('--update');
const BASE = path.join(__dirname, 'visual-baseline');
const OUT = process.env.VISUAL_OUT || path.join(process.cwd(), 'visual-out');
/** Пиксель «другой», если какой-то канал отличается больше чем на 48 из 255 (сглаживание шрифта — меньше) */
const CHANNEL = 48;
/** Допустимая доля других пикселей */
const MAX_RATIO = 0.005;
const NOW = new Date('2026-11-02T18:30:00');
const PROFILE = {
  name: 'Алексей', sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 4, sessionMinutes: 60, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};

async function capture(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: theme, locale: 'ru-RU', reducedMotion: 'reduce' });
  await ctx.clock.setFixedTime(NOW);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const go = async (route) => {
    await p.goto(URL + route, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    const d = p.getByText('У тебя есть незавершённая тренировка');
    if (await d.count()) {
      await p.getByText('Удалить', { exact: true }).last().click();
      await p.waitForTimeout(500);
    }
  };
  const shots = {};
  // Системный стек шрифтов RN-web (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto…) на разных Linux
  // разрешается в разные шрифты; перед снимком текст явно переводится на Inter (fonts-inter), иконочные шрифты не трогаются
  const pinFont = () =>
    p.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) if (/apple-system|BlinkMacSystemFont|Segoe UI|Roboto/.test(getComputedStyle(el).fontFamily)) el.style.fontFamily = 'Inter';
    });
  const shot = async (name) => {
    await p.waitForTimeout(900);
    await pinFont();
    await p.waitForTimeout(300);
    shots[`${name}-${theme}`] = await p.screenshot();
  };
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate((pr) => {
    localStorage.setItem('form.profile', JSON.stringify({ state: { profile: pr, settings: { theme: 'system' } }, version: 1 }));
    localStorage.setItem('form.account', JSON.stringify({ state: { welcomeSeen: true, authSkipped: true }, version: 1 }));
  }, PROFILE);
  await go('/profile');
  await p.getByRole('button', { name: 'Тренировки', exact: true }).click();
  await p.getByText('Сохранить и пересчитать').click();
  await p.waitForTimeout(1200);
  await go('/data');
  await p.getByText('Дополнительно', { exact: true }).click();
  await p.getByText('Заполнить демо-историей (для проверки)').click();
  await p.getByText('Добавить демо', { exact: true }).click();
  await p.waitForTimeout(800);
  // Дневник: вчерашний день — с записями (сегодняшний в демо пуст)
  await go('/nutrition');
  // 2 ноября 2026 — понедельник; 1 ноября — в той же полосе недели
  await p.getByLabel(/^1 ноября/).first().click();
  await shot('diary');
  // Активная тренировка: первый экран и после записанного подхода
  await go('/exercise/bench_press');
  await p.getByText('Тренировать сейчас').click();
  await p.waitForTimeout(1500);
  await shot('active');
  await p.getByTestId('workout-cta').click();
  await shot('active-set');
  await ctx.close();
  return { shots, errors };
}

/** Сравнение двух PNG в браузере: доля отличающихся пикселей и картинка отличий (красным) */
async function diff(browser, a, b) {
  const page = await browser.newPage();
  const res = await page.evaluate(
    async ({ a, b, CHANNEL }) => {
      const load = (src) => new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1, size: `${ia.width}×${ia.height} ≠ ${ib.width}×${ib.height}` };
      const c = document.createElement('canvas');
      c.width = ia.width;
      c.height = ia.height;
      const g = c.getContext('2d');
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, c.width, c.height);
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, c.width, c.height);
      const out = g.createImageData(c.width, c.height);
      let n = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
        if (d > CHANNEL) {
          n++;
          out.data.set([255, 0, 0, 255], i);
        } else out.data.set([db.data[i] / 3, db.data[i + 1] / 3, db.data[i + 2] / 3, 255], i);
      }
      g.putImageData(out, 0, 0);
      return { ratio: n / (c.width * c.height), png: c.toDataURL('image/png') };
    },
    { a: `data:image/png;base64,${a.toString('base64')}`, b: `data:image/png;base64,${b.toString('base64')}`, CHANNEL },
  );
  await page.close();
  return res;
}

(async () => {
  const browser = await chromium.launch();
  const all = {};
  const errors = [];
  for (const theme of ['dark', 'light']) {
    const r = await capture(browser, theme);
    Object.assign(all, r.shots);
    errors.push(...r.errors);
  }
  fs.mkdirSync(BASE, { recursive: true });
  if (UPDATE) {
    for (const [name, buf] of Object.entries(all)) fs.writeFileSync(path.join(BASE, `${name}.png`), buf);
    console.log(`эталоны обновлены: ${Object.keys(all).join(', ')}`);
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    let failed = 0;
    for (const [name, buf] of Object.entries(all)) {
      const file = path.join(BASE, `${name}.png`);
      if (!fs.existsSync(file)) {
        console.log(`✗ ${name}: нет эталона (node scripts/visual-web.cjs --update)`);
        failed++;
        continue;
      }
      const r = await diff(browser, fs.readFileSync(file), buf);
      const pct = (r.ratio * 100).toFixed(2);
      if (r.ratio > MAX_RATIO) {
        failed++;
        fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
        if (r.png) fs.writeFileSync(path.join(OUT, `${name}-diff.png`), Buffer.from(r.png.split(',')[1], 'base64'));
        console.log(`✗ ${name}: отличается ${pct}% пикселей${r.size ? ` (${r.size})` : ''} — снимок и отличия в ${OUT}`);
      } else console.log(`✓ ${name}: ${pct}%`);
    }
    if (failed) process.exitCode = 1;
  }
  if (errors.length) {
    console.log(`JS-ошибки: ${errors.join(' | ')}`);
    process.exitCode = 1;
  }
  await browser.close();
})();
