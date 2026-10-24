/**
 * Сколько всего видно на первом экране (above the fold) — метрика простоты интерфейса.
 * Для каждого основного экрана на демо-данных считает видимое выше нижнего меню:
 *   texts    — отдельные текстовые блоки (вложенный текст — один блок), без иконок;
 *   icons    — иконки;
 *   controls — элементы, на которые можно нажать (кнопки, вкладки, поля);
 *   surfaces — карточки и подложки (заливка, отличная от фона экрана);
 *   words    — слов текста.
 * total = texts + icons + controls + surfaces.
 *
 * Запуск: npx expo start --web --port 8081, затем node scripts/ux-fold.cjs [--json out.json] [--compare base.json] [--shots dir] [--only Сегодня,Питание]
 * UX_URL — другой адрес (например, базовая версия на :8082 для сравнения в те же минуты).
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const URL = process.env.UX_URL || 'http://localhost:8081';
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const OUT_JSON = arg('--json');
const BASE_JSON = arg('--compare');
const SHOTS = arg('--shots');
const ONLY = arg('--only') ? arg('--only').split(',') : null;
const TAB_BAR = 64;
const VIEW = { width: 393, height: 852 };

const PROFILE = {
  name: 'Алекс', sex: 'male', age: 29, heightCm: 180, weightKg: 78, goal: 'bulk', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 3,
  daysPerWeek: 4, sessionMinutes: 70, location: 'gym', equipment: ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar'],
  limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [], activity: 'moderate', stepsPerDay: 8000,
  workStyle: 'desk', preferredTime: 'evening', preferredDays: [], createdAt: 0, updatedAt: 0,
};

/** Подсчёт в странице: только видимое в окне выше нижнего меню */
function measure({ fold }) {
  const W = innerWidth;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const tabBar = document.querySelector('[data-testid="tab-bar"]');
  const CONTROL = new Set(['button', 'tab', 'link', 'switch', 'checkbox', 'radio', 'slider', 'adjustable', 'textbox', 'searchbox']);
  const hidden = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || p.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  };
  const inView = (r) => r.width >= 2 && r.height >= 2 && r.bottom > 1 && r.top < fold - 1 && r.right > 1 && r.left < W - 1;
  const isControl = (el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || CONTROL.has(el.getAttribute('role') || '');
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const isIcon = (el) => /ionicons|material|fontawesome/i.test(getComputedStyle(el).fontFamily);
  const insideControl = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (isControl(p)) return true;
    return false;
  };
  const textAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (ownText(p)) return true;
    return false;
  };
  const r = { texts: 0, icons: 0, controls: 0, surfaces: 0, words: 0 };
  const seenText = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (tabBar && tabBar.contains(el)) continue;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const rect = el.getBoundingClientRect();
    if (!inView(rect)) continue;
    if (hidden(el)) continue;
    if (isControl(el)) {
      r.controls++;
    }
    if (ownText(el) && !textAncestor(el)) {
      if (isIcon(el)) r.icons++;
      else {
        r.texts++;
        const t = (el.innerText ?? el.textContent ?? "").trim();
        r.words += t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
        seenText.push(t.slice(0, 40));
      }
    }
    const bg = getComputedStyle(el).backgroundColor;
    const filled = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== bodyBg;
    if (filled) {
      const visH = Math.min(rect.bottom, fold) - Math.max(rect.top, 0);
      const big = rect.width * visH >= 6000;
      // Кнопки-«пилюли» — это controls; подложкой считаем крупное (карточки, списки, плитки)
      if (big && !(isControl(el) && rect.height < 64)) r.surfaces++;
    }
  }
  r.total = r.texts + r.icons + r.controls + r.surfaces;
  r.sample = seenText.slice(0, 60);
  return r;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.addInitScript(() => localStorage.setItem('rynji.noGH', '1'));
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate((p) => localStorage.setItem('form.profile', JSON.stringify({ state: { profile: p, settings: {} }, version: 1 })), PROFILE);
  await page.goto(`${URL}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Тренировки', exact: true }).click();
  await page.getByText('Сохранить и пересчитать').click();
  await page.waitForTimeout(1200);
  await page.goto(`${URL}/data`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Дополнительно', { exact: true }).click();
  await page.getByText('Заполнить демо-историей (для проверки)').click();
  await page.getByText('Добавить демо', { exact: true }).click();
  await page.waitForTimeout(800);
  const ids = await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('form.workouts')).state;
    const p = JSON.parse(localStorage.getItem('form.plan')).state.plan;
    return { session: w.sessions.filter((s) => s.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)[0].id, tpl: p.templates[0].id };
  });

  const screens = [
    ['Сегодня', '/'],
    ['Тренировки', '/training'],
    ['Питание', '/nutrition'],
    ['Прогресс', '/progress'],
    ['Дневник тренировок', '/training?seg=history'],
    ['Состав тренировки', `/workout/preview?templateId=${ids.tpl}`],
    ['Итоги тренировки', `/workout/${ids.session}`],
    ['Чек-ин', '/checkin'],
    ['Отчёт недели', '/weekly-review'],
    ['Профиль', '/profile'],
  ];
  const out = {};
  const settle = async () => {
    await page.waitForTimeout(1600);
    const d = page.getByText('У тебя есть незавершённая тренировка');
    if (await d.count()) {
      await page.mouse.click(12, 12);
      await page.waitForTimeout(600);
    }
  };
  for (const [name, route] of screens) {
    if (ONLY && !ONLY.includes(name)) continue;
    await page.goto(URL + route, { waitUntil: 'networkidle' });
    await settle();
    out[name] = await page.evaluate(measure, { fold: VIEW.height - TAB_BAR });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  }
  // Активная тренировка — без нижнего меню, считаем весь экран
  if (!ONLY || ONLY.includes('Тренировка')) {
  await page.goto(`${URL}/exercise/bench_press`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Тренировать сейчас').click();
  await page.waitForTimeout(1500);
  const again = page.getByText('Начать новую', { exact: true });
  if (await again.count()) {
    await again.last().click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(800);
  out['Тренировка'] = await page.evaluate(measure, { fold: VIEW.height });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'Тренировка.png') });
  }
  await browser.close();

  const base = BASE_JSON ? JSON.parse(fs.readFileSync(BASE_JSON, 'utf8')) : null;
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  console.log(`${pad('Экран', 22)}${lpad('текст', 7)}${lpad('иконки', 8)}${lpad('нажать', 8)}${lpad('карточки', 10)}${lpad('слов', 6)}${lpad('всего', 7)}${base ? `${lpad('было', 6)}${lpad('Δ', 7)}` : ''}`);
  for (const [name, m] of Object.entries(out)) {
    const b = base?.[name];
    const delta = b ? `${Math.round(((m.total - b.total) / b.total) * 100)}%` : '';
    console.log(`${pad(name, 22)}${lpad(m.texts, 7)}${lpad(m.icons, 8)}${lpad(m.controls, 8)}${lpad(m.surfaces, 10)}${lpad(m.words, 6)}${lpad(m.total, 7)}${b ? `${lpad(b.total, 6)}${lpad(delta, 7)}` : ''}`);
  }
  if (OUT_JSON) fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
})();
