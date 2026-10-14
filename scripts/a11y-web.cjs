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

  const routes = ['/', '/nutrition', '/training', '/training?seg=plan', '/training?seg=history', '/progress', '/checkin', '/weight', '/measurements', '/health', '/profile', '/data', '/appearance', '/plan', '/weekly-review', '/coach', '/training-prefs', '/food/add', '/exercise/bench_press', '/labs', '/labs/report', '/labs/table', '/body', '/stats', '/health-monitor', '/onboarding'];
  // Дневник: тренировка с суперсетом, планкой и заметкой; черновик конструктора с суперсетом
  const tplId = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('form.workouts'));
    const iso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const st = (w, r, extra = {}) => ({ id: Math.random().toString(36).slice(2), weight: w, reps: r, done: true, ...extra });
    const t0 = Date.parse(`${iso}T18:00:00`);
    raw.state.sessions.push({ id: 'a11y_ss', date: iso, name: 'Грудь и спина', focus: '', source: 'custom', startedAt: t0, finishedAt: t0 + 3120000, volumeFactor: 1, status: 'completed', sessionRpe: 10, notes: 'Тяжело, но всё сделал', exercises: [
      { id: 'e1', exerciseId: 'bench_press', plannedSets: 3, repMin: 6, repMax: 10, targetRir: 2, restSec: 120, superset: 'ss0', sets: [st(80, 10), st(85, 8), st(85, 8)] },
      { id: 'e2', exerciseId: 'barbell_row', plannedSets: 3, repMin: 8, repMax: 12, targetRir: 2, restSec: 90, superset: 'ss0', sets: [st(70, 10), st(70, 10), st(70, 9)] },
      { id: 'e3', exerciseId: 'farmers_walk', plannedSets: 2, repMin: 30, repMax: 60, targetRir: 2, restSec: 60, sets: [st(32, 45), st(32, 50)] },
    ] });
    raw.state.draft = { id: 'd_a11y', name: 'Руки', focus: '', source: 'custom', createdAt: Date.now(), exercises: [
      { exerciseId: 'barbell_curl', sets: 2, repMin: 8, repMax: 12, targetRir: 1, restSec: 75, superset: 'ss0' },
      { exerciseId: 'triceps_pushdown', sets: 2, repMin: 10, repMax: 15, targetRir: 1, restSec: 75, superset: 'ss0' },
      { exerciseId: 'side_plank', sets: 2, repMin: 20, repMax: 45, targetRir: 2, restSec: 60 },
    ] };
    localStorage.setItem('form.workouts', JSON.stringify(raw));
    return JSON.parse(localStorage.getItem('form.plan')).state.plan.templates[0].id;
  });
  routes.push('/workout/a11y_ss', '/workout/builder', `/workout/preview?templateId=${tplId}`, '/exercise/plank');
  // Активная тренировка — самый важный экран в зале
  await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Тренировать сейчас').click();
  await page.waitForTimeout(1200);
  routes.push('/workout/active');
  const audit = async (r) => {
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
  };
  for (const r of routes) {
    if (r !== '/workout/active' || page.url().indexOf('/workout/active') < 0) await page.goto(URL + r, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await audit(r);
  }
  // Тренировка с суперсетом и подходом на время (таймер удержания)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('form.workouts'));
    const set = (id, w, r) => ({ id, weight: w, reps: r, done: false });
    const ex = (id, exerciseId, sets, extra = {}) => ({ id, exerciseId, plannedSets: sets.length, repMin: 6, repMax: 10, targetRir: 2, restSec: 90, sets, recommendation: { weight: sets[0].weight, repMin: 6, repMax: 10, sets: sets.length, targetRir: 2, action: 'hold', delta: 'Оставить 80 кг', rationale: '' }, ...extra });
    raw.state.active = { id: 'a11y_act', date: new Date().toISOString().slice(0, 10), name: 'Суперсеты', focus: '', source: 'custom', startedAt: Date.now() - 600000, volumeFactor: 1, status: 'active', currentIndex: 0, exercises: [
      ex('a', 'bench_press', [set('a1', 80, 8), set('a2', 80, 8)], { superset: 'ss0' }),
      ex('b', 'barbell_row', [set('b1', 70, 10), set('b2', 70, 10)], { superset: 'ss0' }),
      ex('c', 'farmers_walk', [set('c1', 32, 45), set('c2', 32, 45)], { repMin: 30, repMax: 60 }),
    ] };
    raw.state.rest = null;
    localStorage.setItem('form.workouts', JSON.stringify(raw));
  });
  await page.goto(`${URL}/workout/active`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await audit('/workout/active (суперсет)');
  await page.getByLabel('Список упражнений', { exact: true }).click();
  await page.waitForTimeout(700);
  await audit('/workout/active (навигатор с суперсетом)');
  await page.getByLabel(/^Прогулка фермера, /).click();
  await page.waitForTimeout(900);
  await page.getByLabel(/^Старт · /).click();
  await page.waitForTimeout(800);
  await audit('/workout/active (таймер удержания)');
  routes.push('/workout/active (суперсет, таймер)');
  console.log(`экранов: ${routes.length}, шрифт ×${SCALE}`);
  console.log(problems.length ? `ПРОБЛЕМЫ (${problems.length}):\n${problems.join('\n')}` : 'Ошибок не найдено');
  await browser.close();
  if (problems.length) process.exit(1);
})();
