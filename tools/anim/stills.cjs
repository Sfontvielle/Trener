/**
 * Иллюстрации интерфейса: node tools/anim/stills.cjs [<id> …] → assets/art/<id>.png (прозрачный фон).
 * id — из web/stills.js; без аргументов — все. W×HH — размер кадра (по умолчанию 1200×1500), H — шаг сетки тела.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const serve = require('./serve.cjs');

const SIZES = { welcome: [1200, 1500], home_hero: [1200, 1200], goal_bulk: [900, 900], goal_cut: [900, 900], goal_recomp: [900, 900], goal_maintain: [900, 900] };

(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SIZES);
  const step = Number(process.env.H || 0.005);
  const out = path.resolve(__dirname, process.env.OUT || '../../assets/art');
  fs.mkdirSync(out, { recursive: true });
  const port = 8890 + Math.floor(Math.random() * 100);
  const server = await serve(port);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const id of ids) {
    const [W, Hh] = SIZES[id] || [Number(process.env.W || 1200), Number(process.env.HH || 1200)];
    const page = await browser.newPage({ viewport: { width: W, height: Hh } });
    page.on('pageerror', (e) => console.log('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/tools/anim/web/index.html?w=${W}&h=${Hh}`);
    await page.waitForFunction(() => window.rynjiReady, null, { timeout: 30000 });
    const t0 = Date.now();
    const data = await page.evaluate(([x, h]) => window.rynji.still(x, h), [id, step]);
    const file = path.join(out, `${id}.png`);
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    console.log(id, `${W}×${Hh}`, ((Date.now() - t0) / 1000).toFixed(1), 's →', path.relative(process.cwd(), file));
    await page.close();
  }
  await browser.close();
  server.close();
})();
