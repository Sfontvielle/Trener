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
  const texts: (keyof Palette)[] = ['text', 'textDim', 'muted', 'accent', 'protein', 'fat', 'carbs', 'fiber', 'ringSleep', 'ringWeek', 'warning', 'danger'];
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
    for (const d of ['protein', 'fat', 'carbs', 'fiber', 'ringSleep', 'ringWeek'] as const) assert.notEqual(p[d].toLowerCase(), p.accent.toLowerCase(), `${name}: ${d} = акцент`);
  }
});

/** Полупрозрачная подложка поверх основы — итоговый цвет, как его видит глаз */
const over = (rgba: string, base: string): string => {
  const m = rgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgba;
  const [r, g, b, a = 1] = m[1].split(',').map((x) => Number(x.trim()));
  const h = base.replace('#', '');
  const [br, bg, bb] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (f: number, k: number) => Math.round(f * a + k * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(r, br)}${mix(g, bg)}${mix(b, bb)}`;
};

test('Тема: текст на верхней поверхности и цветных подложках (WCAG AA ≥ 4,5:1)', () => {
  for (const { name, p } of all) {
    // surface3 — свои сообщения в чате, вторичные кнопки; подложки — баннеры предупреждения, ошибки, акцента
    for (const t of ['text', 'textDim'] as const) {
      const r = contrast(p[t], over(p.surface3, p.surface));
      assert.ok(r >= 4.5, `${name}: ${t} на surface3 — ${r.toFixed(2)}`);
    }
    for (const s of ['warningDim', 'dangerDim', 'accentDim'] as const)
      for (const base of ['bg', 'surface'] as const) {
        const r = contrast(p.text, over(p[s], p[base]));
        assert.ok(r >= 4.5, `${name}: text на ${s} поверх ${base} — ${r.toFixed(2)}`);
      }
  }
});

test('Тема: графика различима (WCAG 1.4.11 ≥ 3:1) — мышцы на схеме, значки статуса на подложках, бегунок переключателя', () => {
  for (const { name, p } of all) {
    for (const m of ['accent', 'secondaryMuscle'] as const) {
      const r = contrast(p[m], over(p.muscleIdle, p.surface2));
      assert.ok(r >= 3, `${name}: ${m} на muscleIdle — ${r.toFixed(2)}`);
    }
    for (const [fg, tint] of [['warning', 'warningDim'], ['danger', 'dangerDim'], ['accent', 'accentDim']] as const)
      for (const base of ['bg', 'surface'] as const) {
        const r = contrast(p[fg], over(p[tint], p[base]));
        assert.ok(r >= 3, `${name}: ${fg} на ${tint} поверх ${base} — ${r.toFixed(2)}`);
      }
    // Переключатель: бегунок (text) на выключенной дорожке (surface3) и на включённой (accent)
    assert.ok(contrast(p.text, over(p.surface3, p.surface)) >= 3, `${name}: бегунок на выключенной дорожке`);
  }
});
