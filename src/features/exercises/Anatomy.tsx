import React, { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import type { BodyPart } from 'react-native-body-highlighter';
import { bodyFront } from 'react-native-body-highlighter/dist/assets/bodyFront';
import { bodyBack } from 'react-native-body-highlighter/dist/assets/bodyBack';
import { bodyFemaleFront } from 'react-native-body-highlighter/dist/assets/bodyFemaleFront';
import { bodyFemaleBack } from 'react-native-body-highlighter/dist/assets/bodyFemaleBack';
import type { MuscleSlug, Sex } from '@/types';
import { colors, radius, themed } from '@/theme';
import { Segmented, T } from '@/components/ui';
import { MUSCLE_LABEL } from '@/data/exercises';

const FRONT_ONLY: MuscleSlug[] = ['chest', 'biceps', 'abs', 'obliques', 'quadriceps', 'tibialis'];
const BACK_ONLY: MuscleSlug[] = ['upper-back', 'lower-back', 'gluteal', 'hamstring'];

/**
 * Анатомическая карта: фигура спереди и сзади.
 * Основные мышцы — ярко-зелёные, вспомогательные — оранжевые, остальные — тёмно-серые.
 */
export const Anatomy = memo(function Anatomy({
  primary,
  secondary,
  stabilizers = [],
  sex = 'male',
  scale = 0.62,
  showLegend = true,
  large = false,
}: {
  primary: MuscleSlug[];
  secondary: MuscleSlug[];
  stabilizers?: MuscleSlug[];
  sex?: Sex;
  scale?: number;
  showLegend?: boolean;
  /** Крупный план одной стороны с переключателем «Спереди / Сзади» */
  large?: boolean;
}) {
  const fillOf = useMemo(() => {
    const m = new Map<string, string>();
    stabilizers.forEach((s) => m.set(s, colors.stabilizerMuscle));
    secondary.forEach((s) => m.set(s, colors.secondaryMuscle));
    primary.forEach((s) => m.set(s, colors.accent));
    return m;
  }, [primary, secondary, stabilizers]);
  // Какая сторона показывает основные мышцы — её открываем первой
  const primaryFront = primary.some((m) => !BACK_ONLY.includes(m));
  const primaryBack = primary.some((m) => !FRONT_ONLY.includes(m));
  const [side, setSide] = useState<'front' | 'back'>(primaryFront || !primaryBack ? 'front' : 'back');
  const hasFront = [...primary, ...secondary].some((m) => !BACK_ONLY.includes(m));
  const hasBack = [...primary, ...secondary].some((m) => !FRONT_ONLY.includes(m));
  const legend = showLegend ? (
    <View style={{ gap: 8, marginTop: 12 }}>
      <LegendRow color={colors.accent} title="Основные" items={primary.map((m) => MUSCLE_LABEL[m])} />
      {secondary.filter((s) => !primary.includes(s)).length ? <LegendRow color={colors.secondaryMuscle} title="Вспомогательные" items={secondary.filter((s) => !primary.includes(s)).map((m) => MUSCLE_LABEL[m])} /> : null}
      {stabilizers.length ? <LegendRow color={colors.stabilizerMuscle} title="Стабилизаторы" items={stabilizers.map((m) => MUSCLE_LABEL[m])} /> : null}
    </View>
  ) : null;
  if (large) {
    return (
      <View>
        <View style={[styles.row, { flexDirection: 'column', alignItems: 'center', paddingVertical: 14 }]}>
          <Figure side={side} sex={sex} scale={1.15} fillOf={fillOf} />
          <Segmented
            items={(['front', 'back'] as const).map((sd) => ({ key: sd, label: `${sd === 'front' ? 'Спереди' : 'Сзади'}${(sd === 'front' ? hasFront : hasBack) ? ' •' : ''}`, a11y: `${sd === 'front' ? 'Спереди' : 'Сзади'}${(sd === 'front' ? hasFront : hasBack) ? ', есть нагруженные мышцы' : ''}` }))}
            value={side}
            onChange={setSide}
            style={{ marginTop: 12, minWidth: 220 }}
          />
        </View>
        {legend}
      </View>
    );
  }
  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.side, !hasFront && { opacity: 0.55 }]}>
          <Figure side="front" sex={sex} scale={scale} fillOf={fillOf} />
          <T v="caption" style={styles.label}>
            Спереди
          </T>
        </View>
        <View style={[styles.side, !hasBack && { opacity: 0.55 }]}>
          <Figure side="back" sex={sex} scale={scale} fillOf={fillOf} />
          <T v="caption" style={styles.label}>
            Сзади
          </T>
        </View>
      </View>
      {legend}
    </View>
  );
});

const LOWER: MuscleSlug[] = ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors', 'tibialis'];

/**
 * Мини-схема для миниатюр в списках: сторона фигуры, где основные мышцы, кадр — верх или низ тела
 * (по основным мышцам), квадратом на всю миниатюру. Основные — акцентом, вспомогательные — своим цветом.
 */
export const MiniFigure = memo(function MiniFigure({ primary, secondary, size }: { primary: MuscleSlug[]; secondary: MuscleSlug[]; size: number }) {
  const fillOf = useMemo(() => {
    const m = new Map<string, string>();
    secondary.forEach((s) => m.set(s, colors.secondaryMuscle));
    primary.forEach((s) => m.set(s, colors.accent));
    return m;
  }, [primary, secondary]);
  const front = primary.some((m) => !BACK_ONLY.includes(m)) || !primary.some((m) => !FRONT_ONLY.includes(m));
  const lower = primary.filter((m) => LOWER.includes(m)).length * 2 > primary.length;
  // Мужская фигура: спереди x 0–724, сзади x 724–1448; верх — от трапеций до таза, низ — от поясницы до икр
  const x0 = front ? 0 : 724;
  const y0 = lower ? 600 : 140;
  return <Figure side={front ? 'front' : 'back'} sex="male" scale={1} width={size} height={size} viewBox={`${x0 + 30} ${y0} 664 664`} fillOf={fillOf} />;
});

const VIEWBOX = {
  male: { front: '0 0 724 1448', back: '724 0 724 1448' },
  female: { front: '-50 -40 734 1538', back: '756 0 774 1448' },
} as const;
const NEUTRAL = new Set(['head', 'hair', 'hands', 'feet', 'ankles', 'knees', 'neck']);

/** Фигура из SVG-контуров мышц (react-native-body-highlighter, MIT) без обработчиков нажатий */
const Figure = memo(function Figure({ side, sex, scale, fillOf, width, height, viewBox }: { side: 'front' | 'back'; sex: Sex; scale: number; fillOf: Map<string, string>; width?: number; height?: number; viewBox?: string }) {
  const parts: BodyPart[] = sex === 'female' ? (side === 'front' ? bodyFemaleFront : bodyFemaleBack) : side === 'front' ? bodyFront : bodyBack;
  return (
    <Svg viewBox={viewBox ?? VIEWBOX[sex][side]} width={width ?? 200 * scale} height={height ?? 400 * scale}>
      <G stroke={colors.bg} strokeWidth={2.5}>
        {parts.flatMap((part) => {
          const fill = fillOf.get(part.slug ?? '') ?? (NEUTRAL.has(part.slug ?? '') ? colors.muscleNeutral : colors.muscleIdle);
          const paths = [...(part.path?.common ?? []), ...(part.path?.left ?? []), ...(part.path?.right ?? [])];
          return paths.map((d, i) => <Path key={`${part.slug}-${i}`} d={d} fill={fill} />);
        })}
      </G>
    </Svg>
  );
});

function LegendRow({ color, title, items }: { color: string; title: string; items: string[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, marginTop: 3 }} />
      <T v="small" color={colors.text} style={{ flex: 1 }}>
        <T v="small" style={{ fontWeight: '800' }} color={colors.text}>
          {title}:{' '}
        </T>
        {items.join(', ')}
      </T>
    </View>
  );
}

const styles = themed({
  row: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface2, borderRadius: radius.lg, paddingVertical: 12 },
  side: { alignItems: 'center' },
  label: { marginTop: 4, color: colors.textDim },
});
