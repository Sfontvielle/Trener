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

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;
/** Больше воздуха: поля экрана 20, между смысловыми блоками — 28–40 */
export const space = { xxs: 4, xs: 6, sm: 10, md: 16, lg: 20, xl: 28, xxl: 40 } as const;

const family = Platform.select({ ios: 'System', default: undefined });
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

/**
 * Типографика в духе iOS: крупные заголовки, спокойный основной текст, подписи — обычным регистром
 * (без капса и разрядки), серым. Акцент — размером и жирностью, а не цветом и рамками.
 */
export const type = themed({
  /** Главный акцент экрана — одно слово или имя тренировки */
  hero: { fontFamily: family, fontSize: 50, lineHeight: 54, fontWeight: '800', letterSpacing: -1.6, color: colors.text },
  display: { fontFamily: family, fontSize: 40, fontWeight: '800', letterSpacing: -1.1, color: colors.text },
  h1: { fontFamily: family, fontSize: 32, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  h2: { fontFamily: family, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  h3: { fontFamily: family, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  body: { fontFamily: family, fontSize: 16, fontWeight: '500', color: colors.text },
  bodyDim: { fontFamily: family, fontSize: 16, fontWeight: '500', color: colors.textDim },
  small: { fontFamily: family, fontSize: 14, fontWeight: '500', color: colors.textDim },
  caption: { fontFamily: family, fontSize: 13, fontWeight: '600', color: colors.textDim },
  num: { fontFamily: family, fontWeight: '800', fontVariant: ['tabular-nums'], color: colors.text, letterSpacing: -0.5 },
  mono: { fontFamily: mono, fontVariant: ['tabular-nums'] },
});

export const hit = { top: 10, bottom: 10, left: 10, right: 10 };
/** Минимальный размер тач-таргета по HIG */
export const TOUCH = 44;
