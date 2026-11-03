/**
 * Веб-замер отрисовки экранов на больших данных (фаза F): время до появления содержимого и сумма длинных задач
 * (> 50 мс) главного потока при открытии. Данные — выгрузка scripts/perf-bench.ts (PERF_DUMP).
 * Запуск: npx expo start --web --port 8081; PERF_DUMP=year.json npm run perf; node scripts/perf-web.cjs year.json [month.json]
 * Это Chromium на сервере, а не iPhone: смотрим на разницу между объёмами данных, а не на абсолютные числа.
 */
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = process.env.E2E_URL || 'http://localhost:8081';
const ROUTES = [
  ['/', 'coach-today'],
  ['/nutrition', 'macro-summary'],
  ['/training?seg=history', 'training-plus'],
  ['/progress', 'progress-story'],
  ['/stats', null],
];

async function measure(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((d) => {
    if (sessionStorage.getItem('perf.seeded')) return;
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
    localStorage.setItem('form.account', JSON.stringify({ state: { welcomeSeen: true, authSkipped: true }, version: 1 }));
    sessionStorage.setItem('perf.seeded', '1');
  }, data);
  await ctx.addInitScript(() => {
    window.__long = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: true });
    } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const out = [];
  for (const [route, tid] of ROUTES) {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      await page.goto(URL + route, { waitUntil: 'domcontentloaded' });
      if (tid) await page.getByTestId(tid).first().waitFor({ state: 'visible', timeout: 20000 });
      else await page.waitForLoadState('networkidle');
      const shown = Date.now() - t0;
      await page.waitForTimeout(600);
      const long = await page.evaluate(() => Math.round(window.__long));
      runs.push({ shown, long });
    }
    runs.sort((a, b) => a.shown - b.shown);
    out.push({ route, ...runs[1] });
  }
  await browser.close();
  return { out, errors };
}

(async () => {
  const files = process.argv.slice(2);
  const res = [];
  for (const f of files) res.push({ f, ...(await measure(f)) });
  console.log('экран | ' + files.map((f) => `${f.split('/').pop()}: до содержимого, мс / длинные задачи, мс`).join(' | '));
  for (let i = 0; i < ROUTES.length; i++) console.log(`${ROUTES[i][0]} | ` + res.map((r) => `${r.out[i].shown} / ${r.out[i].long}`).join(' | '));
  for (const r of res) if (r.errors.length) console.log(`JS-ошибки (${r.f}): ${r.errors.join(' | ')}`);
})();
