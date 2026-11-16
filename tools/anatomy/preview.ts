/**
 * Превью анатомической фигуры без приложения: npx tsx tools/anatomy/preview.ts <out.html> [primary] [secondary] [light]
 * Пример: npx tsx tools/anatomy/preview.ts /tmp/a.html chest,triceps deltoids
 */
import { writeFileSync } from 'fs';
import { figure, FIGURE_BOX, type View } from '../../src/features/exercises/anatomy/geometry';
import type { MuscleSlug, Sex } from '../../src/types';

const [out, prim = 'chest,quadriceps', sec = 'deltoids,triceps,gluteal', light] = process.argv.slice(2);
const P = new Set(prim.split(',') as MuscleSlug[]);
const S = new Set(sec.split(',') as MuscleSlug[]);
const C = light
  ? { bg: '#FFFFFF', skin: '#9AA3B0', neutral: '#BAC1CB', idle: '#CDD3DC', tendon: '#EEF1F5', fiber: 'rgba(0,0,0,0.13)', line: '#9AA3B0', hair: '#7D8693', p: '#1FA855', s: '#E3BE2E' }
  : { bg: '#1C2430', skin: '#0F141B', neutral: '#252E3B', idle: '#2C3644', tendon: '#4C576A', fiber: 'rgba(0,0,0,0.38)', line: '#0F141B', hair: '#3A4454', p: '#3DDC84', s: '#F4DE77' };
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const grad = (id: string, hex: string) => `<radialGradient id="${id}" cx="0.42" cy="0.38" r="0.8"><stop offset="0" stop-color="${shade(hex, 0.16)}"/><stop offset="0.65" stop-color="${hex}"/><stop offset="1" stop-color="${shade(hex, -0.22)}"/></radialGradient>`;
const DEFS = `<defs>${grad('gi', C.idle)}${grad('gp', C.p)}${grad('gs', C.s)}${grad('gt', C.tendon)}${grad('gn', C.neutral)}${grad('gh', C.hair)}</defs>`;

function svg(sex: Sex, view: View) {
  const b = FIGURE_BOX;
  const parts = figure(sex, view).map((sh) => {
    if (sh.kind === 'line') return `<path d="${sh.d}" fill="none" stroke="${C.line}" stroke-width="1.1"/>`;
    if (sh.kind === 'contour') return `<path d="${sh.d}" fill="none" stroke="${C.line}" stroke-width="1.3" stroke-linecap="round"/>`;
    const fill = sh.kind === 'skin' ? C.skin : sh.kind === 'tendon' ? 'url(#gt)' : sh.kind === 'neutral' ? 'url(#gn)' : sh.kind === 'hair' ? 'url(#gh)' : sh.slug && P.has(sh.slug) ? 'url(#gp)' : sh.slug && S.has(sh.slug) ? 'url(#gs)' : 'url(#gi)';
    const stroke = sh.kind === 'skin' ? '' : ` stroke="${C.skin}" stroke-width="0.6"`;
    return `<path d="${sh.d}" fill="${fill}"${stroke}/>` + (sh.fib ? `<path d="${sh.fib}" fill="none" stroke="${C.fiber}" stroke-width="0.45" stroke-linecap="round"/>` : '');
  });
  return `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${b.w * 2.4}" height="${b.h * 2.4}">${DEFS}${parts.join('')}</svg>`;
}

const html = `<!doctype html><html><body style="margin:0;background:${C.bg};display:flex;gap:8px;padding:8px">${(['male', 'female'] as Sex[]).flatMap((sx) => (['front', 'back'] as View[]).map((v) => svg(sx, v))).join('')}</body></html>`;
writeFileSync(out, html);
console.log('ok', out);
