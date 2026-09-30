import { Platform, TextStyle } from 'react-native';

export const colors = {
  bg: '#0A0B0D',
  surface: '#141619',
  surface2: '#1B1E22',
  surface3: '#23272C',
  border: '#262A30',
  borderStrong: '#343941',
  text: '#F4F5F1',
  textDim: '#A3A9B0',
  muted: '#6B7179',
  accent: '#C8F53C',
  accentPressed: '#B2DD2A',
  accentDim: 'rgba(200,245,60,0.14)',
  accentLine: 'rgba(200,245,60,0.35)',
  onAccent: '#0B0D06',
  warning: '#F7B23B',
  warningDim: 'rgba(247,178,59,0.14)',
  danger: '#FF5D52',
  dangerDim: 'rgba(255,93,82,0.14)',
  secondaryMuscle: '#FF9F2E',
  muscleIdle: '#2B2F35',
  protein: '#7CC4FF',
  fat: '#F7B23B',
  carbs: '#C8F53C',
  overlay: 'rgba(0,0,0,0.62)',
} as const;

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xxs: 4, xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 } as const;

const family = Platform.select({ ios: 'System', default: undefined });
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

export const type = {
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
} satisfies Record<string, TextStyle>;

export const hit = { top: 10, bottom: 10, left: 10, right: 10 };
/** Минимальный размер тач-таргета по HIG */
export const TOUCH = 44;
