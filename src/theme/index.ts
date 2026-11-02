import { Platform, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { ACCENT_LABEL, ACCENT_SWATCH, paletteFor, type AccentName, type Palette, type SchemeName } from './tokens';

/**
 * Система тем RYNJI. Значения цветов — в ./tokens (Precision Performance, docs/design/RYNJI_DESIGN_SYSTEM.md).
 *
 * Палитра = схема (тёмная / светлая) × акцент (лайм / синий / оранжевый). Тёмная + лайм — default.
 *
 * `colors` — живой объект: при смене темы его значения меняются на месте. Стили, созданные через
 * `themed()`, регистрируются: для каждого цвета запоминается токен, и при смене темы значение
 * подставляется заново. Инлайн-стили читают `colors.*` при рендере и обновляются сами.
 */

export type { AccentName, Palette, SchemeName };
export { ACCENT_LABEL, ACCENT_SWATCH, paletteFor };
export type ThemePref = 'system' | SchemeName;

export function resolveScheme(pref: ThemePref | undefined, system: 'light' | 'dark' | null | undefined): SchemeName {
  if (pref === 'light' || pref === 'dark') return pref;
  return system === 'light' ? 'light' : 'dark';
}

/** Живая палитра (мутируется при смене темы) */
export const colors: Palette = paletteFor('dark', 'lime');
let current = { scheme: 'dark' as SchemeName, accent: 'lime' as AccentName };

export function currentTheme() {
  return { ...current };
}

/**
 * Семантические имена (для нового кода): colors.* остаются основным API, это удобные псевдонимы,
 * читающие живую палитру.
 */
export const semantic = {
  get background() { return colors.bg; },
  get surfaceElevated() { return colors.surface2; },
  get textPrimary() { return colors.text; },
  get textSecondary() { return colors.textDim; },
  get success() { return colors.accent; },
};

// ── Стили, зависящие от темы ───────────────────────────────────────────────
//
// ВАЖНО: объекты стилей НЕЛЬЗЯ менять на месте. React Native в dev-режиме замораживает объекты,
// переданные в нативную часть (deepFreezeAndThrowOnMutationInDev), и попытка перекрасить их при
// смене темы падала с Render Error. Поэтому для каждой темы строится НОВАЯ копия стилей, а доступ
// styles.x идёт через геттер, возвращающий копию для текущей темы.

// Акцентные токены — первыми: статичные стили чаще всего про акцент. Значения в палитре уникальны (см. tokens.ts)
const ACCENT_KEYS: (keyof Palette)[] = ['accent', 'accentPressed', 'accentDim', 'accentLine', 'onAccent', 'doneRow', 'barSoft'];
const TOKENS = [...ACCENT_KEYS, ...(Object.keys(colors) as (keyof Palette)[]).filter((k) => !ACCENT_KEYS.includes(k))];
const BASE = paletteFor('dark', 'lime');

function tokenOf(value: string, pal: Palette): keyof Palette | undefined {
  const v = value.toLowerCase();
  return TOKENS.find((t) => pal[t].toLowerCase() === v);
}

/** Копия значения с заменой цветов-токенов на значения из палитры */
function recolor(v: unknown, from: Palette, to: Palette): unknown {
  if (typeof v === 'string') {
    const t = tokenOf(v, from);
    return t ? to[t] : v;
  }
  if (Array.isArray(v)) return v.map((x) => recolor(x, from, to));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = recolor((v as Record<string, unknown>)[k], from, to);
    return out;
  }
  return v;
}

let themeKey = 'dark-lime';
/** Ключ текущей темы — меняется при каждой смене (для кэшей и перемонтирования) */
export function currentThemeKey(): string {
  return themeKey;
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Замена StyleSheet.create с поддержкой тем. Исходные стили описываются цветами текущей палитры;
 * при смене темы создаются новые объекты (исходные не мутируются), кэшируются по ключу темы.
 */
export function themed<T extends NamedStyles<T> | NamedStyles<any>>(styles: T & NamedStyles<any>): T {
  const source = recolor(styles, { ...colors }, BASE) as T; // нормализуем к базовой палитре
  const cache = new Map<string, T>();
  const forTheme = (): T => {
    let v = cache.get(themeKey);
    if (!v) {
      v = recolor(source, BASE, colors) as T;
      cache.set(themeKey, v);
    }
    return v;
  };
  const out = {} as T;
  for (const k of Object.keys(styles)) {
    Object.defineProperty(out, k, { enumerable: true, get: () => (forTheme() as Record<string, unknown>)[k] });
  }
  return out;
}

/** Применить тему: обновляет живую палитру `colors`. Стили пересоздаются лениво. true — если что-то изменилось */
export function applyPalette(scheme: SchemeName, accent: AccentName): boolean {
  if (current.scheme === scheme && current.accent === accent) return false;
  Object.assign(colors, paletteFor(scheme, accent));
  current = { scheme, accent };
  themeKey = `${scheme}-${accent}`;
  return true;
}

/** Скругления (5 значений): 8 — чип, 12 — кнопка/поле/строка, 16 — группа/карточка, 24 — верх листа */
export const radius = { xs: 8, sm: 12, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Шкала отступов 4/8/12/16/24/32: поля экрана 16, между секциями 24, перед крупным разделом 32 */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 16, xl: 24, xxl: 32 } as const;

const family = Platform.select({ ios: 'System', default: undefined });
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

/**
 * Типографика Precision Performance (docs/design/RYNJI_DESIGN_SYSTEM.md §3): системный SF Pro, начертания 400–700,
 * табличные цифры, минимум 12 pt. Подписи — обычным регистром. Старые имена (hero, h1–h3, small, caption, num)
 * — псевдонимы новой шкалы, пока экраны не переведены на новые имена.
 */
const display = { fontFamily: family, fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: -0.4, fontVariant: ['tabular-nums'], color: colors.text } as const;
const title1 = { fontFamily: family, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3, color: colors.text } as const;
const title2 = { fontFamily: family, fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2, color: colors.text } as const;
const headline = { fontFamily: family, fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.1, color: colors.text } as const;
const body = { fontFamily: family, fontSize: 16, lineHeight: 22, fontWeight: '400', color: colors.text } as const;
const callout = { fontFamily: family, fontSize: 15, lineHeight: 20, fontWeight: '400', color: colors.textDim } as const;
const footnote = { fontFamily: family, fontSize: 13, lineHeight: 18, fontWeight: '400', color: colors.textDim } as const;

export const type = themed({
  display,
  title1,
  title2,
  headline,
  body,
  bodyStrong: { ...body, fontWeight: '600' },
  callout,
  footnote,
  caption: { fontFamily: family, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.1, color: colors.textDim },
  metric: { fontFamily: family, fontSize: 22, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2, fontVariant: ['tabular-nums'], color: colors.text },
  // ── Псевдонимы старых имён ──
  hero: display,
  h1: title1,
  h2: title2,
  h3: headline,
  bodyDim: { ...body, color: colors.textDim },
  small: callout,
  num: { fontFamily: family, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.text, letterSpacing: -0.3 },
  mono: { fontFamily: mono, fontVariant: ['tabular-nums'] },
});

export const hit = { top: 10, bottom: 10, left: 10, right: 10 };
/** Минимальный размер тач-таргета по HIG */
export const TOUCH = 44;
