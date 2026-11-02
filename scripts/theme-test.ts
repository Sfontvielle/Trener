import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCENTS, contrast, paletteFor, type AccentName, type Palette, type SchemeName } from '../src/theme/tokens';

const SCHEMES: SchemeName[] = ['dark', 'light'];
const ACCENT_NAMES = Object.keys(ACCENTS.dark) as AccentName[];
const all = SCHEMES.flatMap((s) => ACCENT_NAMES.map((a) => ({ name: `${s}/${a}`, p: paletteFor(s, a) })));

test('Тема: в каждой палитре все значения уникальны (иначе перекраска themed() путает токены)', () => {
  for (const { name, p } of all) {
    const seen = new Map<string, string>();
    for (const [k, v] of Object.entries(p)) {
      const key = v.toLowerCase();
      assert.ok(!seen.has(key), `${name}: «${k}» и «${seen.get(key)}» — одно значение ${v}`);
      seen.set(key, k);
    }
  }
});

test('Тема: текст и цвета данных читаемы на фоне и поверхностях (WCAG AA ≥ 4,5:1)', () => {
  const surfaces: (keyof Palette)[] = ['bg', 'surface', 'surface2'];
  const texts: (keyof Palette)[] = ['text', 'textDim', 'muted', 'accent', 'protein', 'fat', 'carbs', 'fiber', 'warning', 'danger'];
  for (const { name, p } of all) {
    for (const t of texts) for (const s of surfaces) {
      const r = contrast(p[t], p[s]);
      assert.ok(r >= 4.5, `${name}: ${t} ${p[t]} на ${s} ${p[s]} — ${r.toFixed(2)}`);
    }
    const on = contrast(p.onAccent, p.accent);
    assert.ok(on >= 4.5, `${name}: текст на акценте ${on.toFixed(2)}`);
  }
});

test('Тема: цвета данных не совпадают с акцентом ни в одном профиле', () => {
  for (const { name, p } of all) {
    for (const d of ['protein', 'fat', 'carbs', 'fiber'] as const) assert.notEqual(p[d].toLowerCase(), p.accent.toLowerCase(), `${name}: ${d} = акцент`);
  }
});
