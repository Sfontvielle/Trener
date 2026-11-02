// Рендер макетов в PNG 393×852 @3x: FONT_DIR=<папка с inter-*-normal.woff2 из @fontsource/inter> node docs/design/mockups/render.cjs docs/design/mockups <out> 01-home.html:dark:0 …
// Формат задания: файл:тема(dark|light):прокрутка(px)[:имя]. Inter подставляется вместо SF Pro, которого нет в Linux.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('path');
const [dir, out, ...jobs] = process.argv.slice(2);
const F = process.env.FONT_DIR;
const face = [400, 500, 600, 700].map((w) => ['cyrillic', 'latin'].map((s) => `@font-face{font-family:Inter;font-weight:${w};src:url(file://${F}/inter-${s}-${w}-normal.woff2) format('woff2');}`).join('')).join('');
(async () => {
  const b = await chromium.launch();
  for (const job of jobs) {
    const [file, theme = 'dark', scrollY = '0', name] = job.split(':');
    const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    await p.goto('file://' + path.resolve(dir, file));
    await p.addStyleTag({ content: face });
    if (theme === 'light') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await p.evaluate((y) => { const s = document.getElementById('scroll'); if (s) s.scrollTop = Number(y); }, scrollY);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    const n = name || file.replace('.html', '') + (theme === 'light' ? '-light' : '') + (scrollY !== '0' ? '-2' : '');
    await p.screenshot({ path: `${out}/${n}.png` });
    console.log('ok', n);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
