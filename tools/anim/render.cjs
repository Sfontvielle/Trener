/**
 * Рендер циклов техники: node tools/anim/render.cjs <exercise_id> [<exercise_id> …]
 * Кадры (PNG) → tools/anim/out/<id>/, затем encode.py собирает зацикленный WebP в assets/anim/<id>.webp.
 * Параметры: FRAMES (по умолчанию 60), W×H кадра (960×720, итог уменьшается вдвое — сглаживание), H — шаг сетки тела.
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const serve = require('./serve.cjs');

(async () => {
  const ids = process.argv.slice(2);
  const FRAMES = Number(process.env.FRAMES || 60);
  const W = Number(process.env.W || 1280), Hh = Number(process.env.HH || 960);
  const step = Number(process.env.H || 0.008);
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  const port = 8790 + Math.floor(Math.random() * 100);
  const server = await serve(port);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: W, height: Hh } });
    page.on('pageerror', (e) => console.log('pageerror:', e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
    await page.goto(`http://localhost:${port}/tools/anim/web/index.html?w=${W}&h=${Hh}`);
    await page.waitForFunction(() => window.rynjiReady, null, { timeout: 30000 });
    await page.evaluate((x) => window.rynji.load(x), id);
    const out = path.resolve(__dirname, 'out', id);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const t0 = Date.now();
    for (let f = 0; f < FRAMES; f++) {
      if (only && !only.includes(f)) continue;
      const data = await page.evaluate(([t, h]) => window.rynji.frame(t, h), [f / FRAMES, step]);
      fs.writeFileSync(path.join(out, `${String(f).padStart(3, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log(id, 'frames', only ? only.length : FRAMES, 's', ((Date.now() - t0) / 1000).toFixed(1));
    await page.close();
    if (!only && !process.env.NO_ENCODE) execFileSync('python3', [path.resolve(__dirname, 'encode.py'), out, path.resolve(__dirname, '../../assets/anim', `${id}.webp`)], { stdio: 'inherit' });
  }
  await browser.close();
  server.close();
})();
