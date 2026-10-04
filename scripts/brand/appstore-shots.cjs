/**
 * Скриншоты для App Store (iPhone 6,7″: 1290×2796): реальные экраны RYNJI на демо-данных.
 * Запуск: npx expo start --web --port 8081, затем node scripts/brand/appstore-shots.cjs
 * Затем: python3 scripts/brand/compose-shots.py — подписи «тренер, а не трекер» и рамка.
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const URL = process.env.E2E_URL || 'http://localhost:8081';
const OUT = path.join(__dirname, '..', '..', 'store', 'raw');
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = {
  name: 'Алекс', sex: 'male', age: 29, heightCm: 180, weightKg: 78, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 3,
  daysPerWeek: 4, sessionMinutes: 70, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: ['Курица', 'Творог', 'Рис'], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 8000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.addInitScript(() => localStorage.setItem('rynji.noGH', '1'));
  const page = await ctx.newPage();
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
  // Два анализа — для экрана «что изменилось»
  const iso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  await page.evaluate(({ a, b }) => {
    const mk = (id, date, rows) => ({ id, date, lab: 'Инвитро', source: { kind: 'pdf' }, confirmed: true, createdAt: Date.parse(date), results: rows.map(([markerId, name, value, unit, refLow, refHigh], i) => ({ id: id + i, markerId, name, value, unit, refLow, refHigh, refText: `${refLow ?? ''}${refLow !== undefined ? ' – ' : '< '}${refHigh}` })) });
    localStorage.setItem('form.labs', JSON.stringify({ state: { reports: [
      mk('l1', a, [['hct', 'Гематокрит', 44.8, '%', 39, 49], ['hgb', 'Гемоглобин', 151, 'г/л', 132, 173], ['ldl', 'ЛПНП', 2.9, 'ммоль/л', undefined, 3.0], ['alt', 'АЛТ', 26, 'ед/л', undefined, 41], ['ferritin', 'Ферритин', 64, 'мкг/л', 30, 400], ['vitd', 'Витамин D', 22, 'нг/мл', 30, 100]]),
      mk('l2', b, [['hct', 'Гематокрит', 46.1, '%', 39, 49], ['hgb', 'Гемоглобин', 156, 'г/л', 132, 173], ['ldl', 'ЛПНП', 2.7, 'ммоль/л', undefined, 3.0], ['alt', 'АЛТ', 27, 'ед/л', undefined, 41], ['ferritin', 'Ферритин', 88, 'мкг/л', 30, 400], ['vitd', 'Витамин D', 38, 'нг/мл', 30, 100]]),
    ] }, version: 1 }));
  }, { a: iso(120), b: iso(6) });
  const shot = async (name) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  };
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot('1-today');
  await page.getByLabel('Почему? Объяснение решений тренера').click();
  await shot('2-why');
  await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Тренировать сейчас').click();
  await page.waitForTimeout(1500);
  await page.getByText(/^Подход выполнен|^Выполнить подход|^Готово/).first().click().catch(() => {});
  await shot('3-workout');
  await page.goto(`${URL}/weekly-review`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('4-weekly');
  await page.goto(`${URL}/labs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('5-labs');
  await page.goto(`${URL}/nutrition`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByLabel('Почему такие КБЖУ?').click();
  await shot('6-nutrition');
  await page.goto(`${URL}/progress`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await shot('7-progress');
  await browser.close();
})();
