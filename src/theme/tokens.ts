/**
 * RYNJI 2.0 · Precision Performance — токены цвета (docs/design/RYNJI_DESIGN_SYSTEM.md §2).
 *
 * Палитра = схема (тёмная / светлая) × акцент (лайм / синий / оранжевый). Светлая — своя палитра, не инверсия.
 * Цвета данных (белки, жиры, углеводы, клетчатка) одинаковы по тону во всех профилях и не совпадают с акцентом.
 *
 * ВАЖНО: внутри каждой палитры все значения уникальны. Перекраска стилей `themed()` ищет токен по значению
 * цвета, и два токена с одним значением ломают смену темы. Проверяется в scripts/theme-test.ts.
 */

export type SchemeName = 'dark' | 'light';
export type AccentName = 'lime' | 'blue' | 'orange';

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
  fiber: string;
  /** Кольца «Сегодня»: сон и тренировки недели (шаги — акцентом) */
  ringSleep: string;
  ringWeek: string;
  overlay: string;
  tabBar: string;
  doneRow: string;
  barSoft: string;
}

export type AccentSet = Pick<Palette, 'accent' | 'accentPressed' | 'accentDim' | 'accentLine' | 'onAccent' | 'doneRow' | 'barSoft'>;

// Тёмная: графитовый фон с холодным оттенком, уровни — заливкой, а не рамками
export const DARK_BASE: Omit<Palette, keyof AccentSet> = {
  bg: '#0D1118',
  surface: '#151B24',
  surface2: '#1C2430',
  surface3: '#263140',
  border: '#212A36',
  borderStrong: '#2C3746',
  text: '#F3F6FA',
  textDim: '#A4B0BF',
  muted: '#8592A3',
  warning: '#F5A033',
  warningDim: 'rgba(245,160,51,0.14)',
  warningLine: 'rgba(245,160,51,0.42)',
  danger: '#FF6359',
  dangerDim: 'rgba(255,99,89,0.14)',
  dangerLine: 'rgba(255,99,89,0.45)',
  secondaryMuscle: '#FF9F2E',
  stabilizerMuscle: '#8E7CFF',
  muscleIdle: '#29323F',
  muscleNeutral: '#3A4555',
  protein: '#A48BFF',
  fat: '#FF7EA6',
  carbs: '#F2D45C',
  fiber: '#4FD1C1',
  ringSleep: '#8FA2FF',
  ringWeek: '#4CC9F0',
  overlay: 'rgba(5,8,12,0.66)',
  tabBar: 'rgba(13,17,24,0.94)',
};

// Светлая: холодный светло-серый фон, белые поверхности, почти чёрный текст; цвета данных темнее
export const LIGHT_BASE: Omit<Palette, keyof AccentSet> = {
  bg: '#F3F5F8',
  surface: '#FFFFFF',
  surface2: '#EDF0F4',
  surface3: '#E1E6ED',
  border: '#E5E9EF',
  borderStrong: '#D3DAE3',
  text: '#0E141B',
  textDim: '#52606F',
  muted: '#5F6B7B',
  warning: '#935200',
  warningDim: 'rgba(147,82,0,0.1)',
  warningLine: 'rgba(147,82,0,0.36)',
  danger: '#C7342B',
  dangerDim: 'rgba(199,52,43,0.1)',
  dangerLine: 'rgba(199,52,43,0.38)',
  secondaryMuscle: '#B85F00',
  stabilizerMuscle: '#6E5CE6',
  muscleIdle: '#DCE1E8',
  muscleNeutral: '#C8CFD9',
  protein: '#6A4FE0',
  fat: '#B32F5C',
  carbs: '#806200',
  fiber: '#0C7062',
  ringSleep: '#4157CC',
  ringWeek: '#0A6C8C',
  overlay: 'rgba(14,20,27,0.32)',
  tabBar: 'rgba(255,255,255,0.96)',
};

// Светлая тема: лайм на белом не различим как форма, поэтому акцент — тёмный тон того же цвета с белым текстом.
// onAccent чуть отличается от белого фона карточек: значения в палитре должны быть уникальны
const ON_LIGHT = '#FAFDF7';
const ON_DARK = '#0B0F14';

export const ACCENTS: Record<SchemeName, Record<AccentName, AccentSet>> = {
  dark: {
    lime: { accent: '#B5F56B', accentPressed: '#A1E055', accentDim: 'rgba(181,245,107,0.12)', accentLine: 'rgba(181,245,107,0.32)', onAccent: ON_DARK, doneRow: 'rgba(181,245,107,0.06)', barSoft: 'rgba(181,245,107,0.42)' },
    blue: { accent: '#6CB6FF', accentPressed: '#559FEA', accentDim: 'rgba(108,182,255,0.14)', accentLine: 'rgba(108,182,255,0.38)', onAccent: ON_DARK, doneRow: 'rgba(108,182,255,0.07)', barSoft: 'rgba(108,182,255,0.45)' },
    orange: { accent: '#FF8A3D', accentPressed: '#EB7628', accentDim: 'rgba(255,138,61,0.14)', accentLine: 'rgba(255,138,61,0.38)', onAccent: ON_DARK, doneRow: 'rgba(255,138,61,0.07)', barSoft: 'rgba(255,138,61,0.45)' },
  },
  light: {
    lime: { accent: '#357000', accentPressed: '#2C5E00', accentDim: 'rgba(53,112,0,0.1)', accentLine: 'rgba(53,112,0,0.34)', onAccent: ON_LIGHT, doneRow: 'rgba(53,112,0,0.07)', barSoft: 'rgba(53,112,0,0.4)' },
    blue: { accent: '#1A62B0', accentPressed: '#155296', accentDim: 'rgba(26,98,176,0.1)', accentLine: 'rgba(26,98,176,0.34)', onAccent: ON_LIGHT, doneRow: 'rgba(26,98,176,0.07)', barSoft: 'rgba(26,98,176,0.4)' },
    orange: { accent: '#A84A00', accentPressed: '#8F3F00', accentDim: 'rgba(168,74,0,0.1)', accentLine: 'rgba(168,74,0,0.34)', onAccent: ON_LIGHT, doneRow: 'rgba(168,74,0,0.07)', barSoft: 'rgba(168,74,0,0.4)' },
  },
};

export const ACCENT_LABEL: Record<AccentName, string> = { lime: 'Салатовый', blue: 'Синий', orange: 'Оранжевый' };
/** Образец для выбора акцента (одинаковый в обеих схемах) */
export const ACCENT_SWATCH: Record<AccentName, string> = { lime: '#B5F56B', blue: '#6CB6FF', orange: '#FF8A3D' };

export function paletteFor(scheme: SchemeName, accent: AccentName = 'lime'): Palette {
  return { ...(scheme === 'light' ? LIGHT_BASE : DARK_BASE), ...ACCENTS[scheme][accent] };
}

// ── Контраст WCAG 2.1 (для тестов и проверки новых значений) ────────────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
