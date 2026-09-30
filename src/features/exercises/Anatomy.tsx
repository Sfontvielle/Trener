import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import type { BodyPart } from 'react-native-body-highlighter';
import { bodyFront } from 'react-native-body-highlighter/dist/assets/bodyFront';
import { bodyBack } from 'react-native-body-highlighter/dist/assets/bodyBack';
import { bodyFemaleFront } from 'react-native-body-highlighter/dist/assets/bodyFemaleFront';
import { bodyFemaleBack } from 'react-native-body-highlighter/dist/assets/bodyFemaleBack';
import type { MuscleSlug, Sex } from '@/types';
import { colors, radius } from '@/theme';
import { T } from '@/components/ui';
import { MUSCLE_LABEL } from '@/data/exercises';

const FRONT_ONLY: MuscleSlug[] = ['chest', 'biceps', 'abs', 'obliques', 'quadriceps', 'tibialis'];
const BACK_ONLY: MuscleSlug[] = ['upper-back', 'lower-back', 'gluteal', 'hamstring'];

/**
 * Анатомическая карта: фигура спереди и сзади.
 * Основные мышцы — ярко-зелёные, вспомогательные — оранжевые, остальные — тёмно-серые.
 */
export const Anatomy = memo(function Anatomy({ primary, secondary, sex = 'male', scale = 0.62, showLegend = true }: { primary: MuscleSlug[]; secondary: MuscleSlug[]; sex?: Sex; scale?: number; showLegend?: boolean }) {
  const fillOf = useMemo(() => {
    const m = new Map<string, string>();
    secondary.forEach((s) => m.set(s, colors.secondaryMuscle));
    primary.forEach((s) => m.set(s, colors.accent));
    return m;
  }, [primary, secondary]);
  const hasFront = [...primary, ...secondary].some((m) => !BACK_ONLY.includes(m));
  const hasBack = [...primary, ...secondary].some((m) => !FRONT_ONLY.includes(m));
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
      {showLegend ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          <LegendRow color={colors.accent} title="Основные" items={primary.map((m) => MUSCLE_LABEL[m])} />
          {secondary.length ? <LegendRow color={colors.secondaryMuscle} title="Вспомогательные" items={secondary.filter((s) => !primary.includes(s)).map((m) => MUSCLE_LABEL[m])} /> : null}
        </View>
      ) : null}
    </View>
  );
});

const VIEWBOX = {
  male: { front: '0 0 724 1448', back: '724 0 724 1448' },
  female: { front: '-50 -40 734 1538', back: '756 0 774 1448' },
} as const;
const NEUTRAL = new Set(['head', 'hair', 'hands', 'feet', 'ankles', 'knees', 'neck']);

/** Фигура из SVG-контуров мышц (react-native-body-highlighter, MIT) без обработчиков нажатий */
const Figure = memo(function Figure({ side, sex, scale, fillOf }: { side: 'front' | 'back'; sex: Sex; scale: number; fillOf: Map<string, string> }) {
  const parts: BodyPart[] = sex === 'female' ? (side === 'front' ? bodyFemaleFront : bodyFemaleBack) : side === 'front' ? bodyFront : bodyBack;
  return (
    <Svg viewBox={VIEWBOX[sex][side]} width={200 * scale} height={400 * scale}>
      <G stroke={colors.bg} strokeWidth={2.5}>
        {parts.flatMap((part) => {
          const fill = fillOf.get(part.slug ?? '') ?? (NEUTRAL.has(part.slug ?? '') ? '#3A3F46' : colors.muscleIdle);
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface2, borderRadius: radius.lg, paddingVertical: 12 },
  side: { alignItems: 'center' },
  label: { marginTop: 4, color: colors.textDim },
});
