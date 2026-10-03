import { Platform, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Система тем FORM.
 *
 * Палитра = схема (тёмная / светлая) × акцент (лайм / синий / оранжевый). Тёмная + лайм — default.
 * Светлая тема — отдельная палитра, а не инверсия: мягкий серо-белый фон, белые карточки,
 * почти чёрный текст и затемнённый акцент (лайм на белом нечитаем как текст).
 *
 * `colors` — живой объект: при смене темы его значения меняются на месте. Стили, созданные через
 * `themed()`, регистрируются: для каждого цвета запоминается токен, и при смене темы значение
 * подставляется заново. Инлайн-стили читают `colors.*` при рендере и обновляются сами.
 */

export type SchemeName = 'dark' | 'light';
export type AccentName = 'lime' | 'blue' | 'orange';
export type ThemePref = 'system' | SchemeName;

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  muted: string;
  accent: string;
  accentPressed: string;
  accentDim: string;
  accentLine: string;
  onAccent: string;
  warning: string;
  warningDim: string;
  warningLine: string;
  danger: string;
  dangerDim: string;
  dangerLine: string;
  secondaryMuscle: string;
  stabilizerMuscle: string;
  muscleIdle: string;
  muscleNeutral: string;
  protein: string;
  fat: string;
  carbs: string;
  overlay: string;
  tabBar: string;
  doneRow: string;
  barSoft: string;
}

type AccentSet = Pick<Palette, 'accent' | 'accentPressed' | 'accentDim' | 'accentLine' | 'onAccent' | 'doneRow' | 'barSoft'>;

const DARK_BASE: Omit<Palette, keyof AccentSet> = {
  bg: '#0A0B0D',
  surface: '#141619',
  surface2: '#1B1E22',
  surface3: '#23272C',
  border: '#262A30',
  borderStrong: '#343941',
  text: '#F4F5F1',
  textDim: '#A3A9B0',
  muted: '#6B7179',
  warning: '#F7B23B',
  warningDim: 'rgba(247,178,59,0.14)',
  warningLine: 'rgba(247,178,59,0.42)',
  danger: '#FF5D52',
  dangerDim: 'rgba(255,93,82,0.14)',
  dangerLine: 'rgba(255,93,82,0.45)',
  secondaryMuscle: '#FF9F2E',
  stabilizerMuscle: '#8E7CFF',
  muscleIdle: '#2B2F35',
  muscleNeutral: '#3A3F46',
  protein: '#7CC4FF',
  fat: '#F7B23B',
  carbs: '#C8F53C',
  overlay: 'rgba(0,0,0,0.62)',
  tabBar: 'rgba(12,13,15,0.97)',
};

const LIGHT_BASE: Omit<Palette, keyof AccentSet> = {
  bg: '#F1F2EE',
  surface: '#FFFFFF',
  surface2: '#F5F6F2',
  surface3: '#E8EAE4',
  border: '#E1E3DD',
  borderStrong: '#CBCFC7',
  text: '#121412',
  textDim: '#5B6168',
  muted: '#8C9298',
  warning: '#C27500',
  warningDim: 'rgba(194,117,0,0.12)',
  warningLine: 'rgba(194,117,0,0.4)',
  danger: '#D63A30',
  dangerDim: 'rgba(214,58,48,0.1)',
  dangerLine: 'rgba(214,58,48,0.4)',
  secondaryMuscle: '#F08A1C',
  stabilizerMuscle: '#6E5CE6',
  muscleIdle: '#DADDD6',
  muscleNeutral: '#C9CDC4',
  protein: '#2D8BE0',
  fat: '#C27500',
  carbs: '#6E9E00',
  overlay: 'rgba(16,18,16,0.38)',
  tabBar: 'rgba(255,255,255,0.97)',
};

const ACCENTS: Record<SchemeName, Record<AccentName, AccentSet>> = {
  dark: {
    lime: { accent: '#C8F53C', accentPressed: '#B2DD2A', accentDim: 'rgba(200,245,60,0.14)', accentLine: 'rgba(200,245,60,0.35)', onAccent: '#0B0D06', doneRow: 'rgba(200,245,60,0.07)', barSoft: 'rgba(200,245,60,0.45)' },
    blue: { accent: '#4DA3FF', accentPressed: '#3A8EEA', accentDim: 'rgba(77,163,255,0.15)', accentLine: 'rgba(77,163,255,0.4)', onAccent: '#04111F', doneRow: 'rgba(77,163,255,0.08)', barSoft: 'rgba(77,163,255,0.45)' },
    orange: { accent: '#FF8A3D', accentPressed: '#EB7628', accentDim: 'rgba(255,138,61,0.15)', accentLine: 'rgba(255,138,61,0.4)', onAccent: '#1C0B02', doneRow: 'rgba(255,138,61,0.08)', barSoft: 'rgba(255,138,61,0.45)' },
  },
  light: {
    lime: { accent: '#4C8A00', accentPressed: '#3F7400', accentDim: 'rgba(110,170,0,0.13)', accentLine: 'rgba(76,138,0,0.38)', onAccent: '#FFFFFF', doneRow: 'rgba(110,170,0,0.09)', barSoft: 'rgba(76,138,0,0.4)' },
    blue: { accent: '#0B6AD6', accentPressed: '#0858B4', accentDim: 'rgba(11,106,214,0.1)', accentLine: 'rgba(11,106,214,0.36)', onAccent: '#FFFFFF', doneRow: 'rgba(11,106,214,0.07)', barSoft: 'rgba(11,106,214,0.4)' },
    orange: { accent: '#D2600E', accentPressed: '#B4500A', accentDim: 'rgba(210,96,14,0.11)', accentLine: 'rgba(210,96,14,0.38)', onAccent: '#FFFFFF', doneRow: 'rgba(210,96,14,0.07)', barSoft: 'rgba(210,96,14,0.4)' },
  },
};

export const ACCENT_LABEL: Record<AccentName, string> = { lime: 'Салатовый', blue: 'Синий', orange: 'Оранжевый' };
/** Образец для выбора акцента (одинаковый в обеих схемах) */
export const ACCENT_SWATCH: Record<AccentName, string> = { lime: '#C8F53C', blue: '#4DA3FF', orange: '#FF8A3D' };

export function paletteFor(scheme: SchemeName, accent: AccentName = 'lime'): Palette {
  return { ...(scheme === 'light' ? LIGHT_BASE : DARK_BASE), ...ACCENTS[scheme][accent] };
}

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

// Акцентные токены — первыми: в тёмной теме «углеводы» совпадают с лаймом, а статичные стили почти всегда про акцент
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
export const space = { xxs: 4, xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 } as const;

const family = Platform.select({ ios: 'System', default: undefined });
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

export const type = themed({
  display: { fontFamily: family, fontSize: 34, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  h1: { fontFamily: family, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  h2: { fontFamily: family, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  h3: { fontFamily: family, fontSize: 17, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  body: { fontFamily: family, fontSize: 15, fontWeight: '500', color: colors.text },
  bodyDim: { fontFamily: family, fontSize: 15, fontWeight: '500', color: colors.textDim },
  small: { fontFamily: family, fontSize: 13, fontWeight: '500', color: colors.textDim },
  caption: { fontFamily: family, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.muted },
  num: { fontFamily: family, fontWeight: '800', fontVariant: ['tabular-nums'], color: colors.text, letterSpacing: -0.5 },
  mono: { fontFamily: mono, fontVariant: ['tabular-nums'] },
});

export const hit = { top: 10, bottom: 10, left: 10, right: 10 };
/** Минимальный размер тач-таргета по HIG */
export const TOUCH = 44;
