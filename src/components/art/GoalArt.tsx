import React, { memo } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { GoalType } from '@/types';
import { colors } from '@/theme';

/**
 * Иллюстрации целей (рисунок RYNJI, вектор): набор — гантель и стрелки вверх, сушка — пламя с каплей,
 * рекомпозиция — мышцы вверх, жир вниз, поддержание — уровень с пузырьком по центру.
 * Цвета — из темы (акцент, текст, подложки), поэтому рисунок одинаково читается в тёмной и светлой теме
 * и с любым акцентом. Кадр 112×104 — правый край карточки цели.
 */
export const GoalArt = memo(function GoalArt({ goal, width = 112, height = 104 }: { goal: GoalType; width?: number; height?: number }) {
  const c = { A: colors.accent, AP: colors.accentPressed, T: colors.text, D: colors.textDim, S: colors.surface3, B: colors.surface2 };
  return (
    <Svg width={width} height={height} viewBox="0 0 112 104">
      {goal === 'bulk' ? <Bulk c={c} /> : goal === 'cut' ? <Cut c={c} /> : goal === 'recomp' ? <Recomp c={c} /> : <Maintain c={c} />}
    </Svg>
  );
});

type C = { A: string; AP: string; T: string; D: string; S: string; B: string };

function Bulk({ c }: { c: C }) {
  const plate = (x: number, w: number, h: number, fill: string) => <Rect x={x} y={-h / 2} width={w} height={h} rx={3} fill={fill} />;
  return (
    <>
      <Ellipse cx={56} cy={88} rx={32} ry={3.5} fill={c.S} />
      <G transform="translate(58 58) rotate(-18)">
        <Rect x={-16} y={-3.5} width={32} height={7} rx={3.5} fill={c.T} opacity={0.9} />
        {plate(-19, 4, 13, c.T)}
        {plate(15, 4, 13, c.T)}
        {plate(-28, 9, 44, c.A)}
        {plate(19, 9, 44, c.A)}
        {plate(-34, 6, 32, c.AP)}
        {plate(28, 6, 32, c.AP)}
        {plate(-37, 3, 11, c.T)}
        {plate(34, 3, 11, c.T)}
      </G>
      <Path d="M14 26 L22 18 L30 26" fill="none" stroke={c.A} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 37 L22 29 L30 37" fill="none" stroke={c.A} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.45} />
    </>
  );
}

function Cut({ c }: { c: C }) {
  return (
    <>
      <Ellipse cx={56} cy={94} rx={26} ry={3.5} fill={c.S} />
      <Path d="M56 10 C66 26 84 36 82 62 C81 80 70 91 56 91 C42 91 30 80 30 64 C30 50 38 43 43 33 C45 44 49 49 53 49 C51 36 51 23 56 10 Z" fill={c.A} />
      <Path d="M56 50 C63 59 71 66 69 76 C68 84 63 89 56 89 C49 89 43 84 43 76 C43 67 50 61 56 50 Z" fill={c.B} />
      <Path d="M56 66 C60 71 63 74 62 79 C61 83 59 85 56 85 C53 85 50 83 50 79 C50 75 53 71 56 66 Z" fill={c.A} opacity={0.55} />
      <Circle cx={88} cy={30} r={3} fill={c.A} opacity={0.6} />
      <Circle cx={26} cy={40} r={2.2} fill={c.A} opacity={0.45} />
      <Circle cx={92} cy={48} r={1.8} fill={c.A} opacity={0.35} />
    </>
  );
}

function Recomp({ c }: { c: C }) {
  const dots: React.ReactNode[] = [];
  for (let x = 16; x <= 96; x += 16) for (let y = 20; y <= 88; y += 17) dots.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={1.3} fill={c.S} />);
  return (
    <>
      {dots}
      <Path d="M16 36 C40 38 58 60 94 78" fill="none" stroke={c.D} strokeWidth={5} strokeLinecap="round" opacity={0.55} />
      <Circle cx={94} cy={78} r={5.5} fill={c.D} opacity={0.55} />
      <Path d="M16 80 C42 78 58 54 94 28" fill="none" stroke={c.A} strokeWidth={6.5} strokeLinecap="round" />
      <Circle cx={94} cy={28} r={7.5} fill={c.A} />
      <Circle cx={94} cy={28} r={3} fill={c.B} />
    </>
  );
}

function Maintain({ c }: { c: C }) {
  return (
    <>
      <Rect x={8} y={34} width={96} height={36} rx={11} fill={c.S} />
      <Rect x={31} y={41} width={50} height={22} rx={11} fill={c.B} />
      <Ellipse cx={56} cy={52} rx={10.5} ry={7} fill={c.A} />
      <Ellipse cx={52.5} cy={49.6} rx={3.2} ry={1.8} fill={c.B} opacity={0.55} />
      <Path d="M42.5 41 V63 M69.5 41 V63" stroke={c.D} strokeWidth={2.2} opacity={0.85} />
      <Circle cx={19} cy={52} r={3.5} fill={c.D} opacity={0.45} />
      <Circle cx={93} cy={52} r={3.5} fill={c.D} opacity={0.45} />
      <Path d="M14 82 H98" stroke={c.S} strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M56 76 V88" stroke={c.A} strokeWidth={3.5} strokeLinecap="round" />
    </>
  );
}
