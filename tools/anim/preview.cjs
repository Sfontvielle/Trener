/** Превью фигуры: node tools/anim/preview.cjs <outDir> '[[основные],[вспомогательные]]' — фронт, спина, 3/4 в позе покоя */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const serve = require('./serve.cjs');
(async () => {
  const out = process.argv[2] || 'tools/anim/out/preview';
  const hl = process.argv[3] ? JSON.parse(process.argv[3]) : [[], []];
  const H = Number(process.env.H || 0.009);
  fs.mkdirSync(out, { recursive: true });
  const server = await serve(8790);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://localhost:8790/tools/anim/web/index.html?w=960&h=720');
  await page.waitForFunction(() => window.rynjiReady, null, { timeout: 30000 });
  const t0 = Date.now();
  const verts = await page.evaluate(([p, s, h]) => { window.rynji.rest(); return window.rynji.build(p, s, h); }, [hl[0], hl[1], H]);
  console.log('mesh vertices', verts, 'build ms', Date.now() - t0);
  const views = { front: [[0.0, 1.05, 5.2], [0, 0.95, 0]], back: [[0, 1.05, -5.2], [0, 0.95, 0]], q34: [[3.2, 1.4, 4.0], [0, 0.95, 0]], torso: [[0.6, 1.4, 2.0], [0, 1.28, 0]], backTorso: [[-0.6, 1.4, -2.0], [0, 1.28, 0]] };
  for (const [name, [pos, target]] of Object.entries(views)) {
    const data = await page.evaluate(([p, t]) => { window.rynji.view(p, t); return window.rynji.shot(); }, [pos, target]);
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  await browser.close();
  server.close();
  console.log('ok', out);
})();
