/**
 * Доступность и крупный шрифт: каждый экран при имитации крупного системного шрифта (×A11Y_SCALE, по умолчанию 1,5)
 * на узком iPhone (375 pt). Ищет: текст, вылезающий за экран; кнопки/переключатели без названия для VoiceOver.
 * Запуск: npx expo start --web --port 8081, затем node scripts/a11y-web.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = process.env.E2E_URL || 'http://localhost:8081';
const SCALE = process.env.A11Y_SCALE || '1.5';
const PROFILE = {
  name: 'Анна', sex: 'female', age: 27, heightCm: 166, weightKg: 58, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 4, sessionMinutes: 70, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 7000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((k) => {
    localStorage.setItem('rynji.fontScale', k);
    localStorage.setItem('rynji.noGH', '1');
  }, SCALE);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
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

  const routes = ['/', '/nutrition', '/training', '/training?seg=plan', '/training?seg=history', '/progress', '/checkin', '/weight', '/measurements', '/health', '/profile', '/data', '/appearance', '/plan', '/weekly-review', '/coach', '/training-prefs', '/food/add', '/exercise/bench_press', '/labs', '/health-monitor', '/onboarding'];
  // Активная тренировка — самый важный экран в зале
  await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Тренировать сейчас').click();
  await page.waitForTimeout(1200);
  routes.push('/workout/active');
  for (const r of routes) {
    if (r !== '/workout/active' || page.url().indexOf('/workout/active') < 0) await page.goto(URL + r, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const res = await page.evaluate(() => {
      const W = window.innerWidth;
      const out = { overflow: [], unnamed: [] };
      const inHScroll = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
          if (cs.position === 'fixed' && p !== document.body) return false;
        }
        return false;
      };
      for (const el of document.querySelectorAll('[dir="auto"]')) {
        const rc = el.getBoundingClientRect();
        if (!rc.width || !el.textContent.trim()) continue;
        if (rc.right > W + 2 && !inHScroll(el)) out.overflow.push(`${el.textContent.trim().slice(0, 60)} (правый край ${Math.round(rc.right)} > ${W})`);
      }
      for (const el of document.querySelectorAll('[role="button"],[role="switch"],[role="tab"],[role="radio"],[role="checkbox"],[role="adjustable"],a')) {
        const rc = el.getBoundingClientRect();
        if (!rc.width || !rc.height) continue;
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (!name) out.unnamed.push(el.outerHTML.slice(0, 140));
      }
      return out;
    });
    for (const o of [...new Set(res.overflow)].slice(0, 6)) problems.push(`[вылезает текст @ ${r}] ${o}`);
    for (const u of [...new Set(res.unnamed)].slice(0, 6)) problems.push(`[кнопка без названия @ ${r}] ${u}`);
  }
  console.log(`экранов: ${routes.length}, шрифт ×${SCALE}`);
  console.log(problems.length ? `ПРОБЛЕМЫ (${problems.length}):\n${problems.join('\n')}` : 'Ошибок не найдено');
  await browser.close();
  if (problems.length) process.exit(1);
})();
